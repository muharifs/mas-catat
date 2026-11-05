// Weeks repository: the host schedule. Every member hosts exactly once, so a host change is always a SWAP of
// two weeks, and it is allowed only while both weeks are open.
import { allocatePayments } from '@/domain/allocation';
import { periodWeekCount } from '@/domain/dues';
import type { WeekCredit, WeekStatus } from '@/domain/types';
import type { Db, Queryable } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError } from './errors';

export type WeekState = 'open' | 'closed';

export interface Week {
  periodId: string;
  number: number;
  date: string;
  hostMemberId: string;
  status: WeekState;
  closedAt: string | null;
}

interface WeekRow {
  period_id: string;
  number: number;
  date: string;
  host_member_id: string | null;
  status: WeekState;
  closed_at: string | null;
}

const WEEK_COLUMNS = 'period_id, number, date, host_member_id, status, closed_at';

function toWeek(r: WeekRow): Week {
  // NULL host only exists transiently inside a swap transaction, never in committed data.
  if (r.host_member_id === null) throw new RepositoryError(`week ${r.number} has no host`);
  return {
    periodId: r.period_id,
    number: r.number,
    date: r.date,
    hostMemberId: r.host_member_id,
    status: r.status,
    closedAt: r.closed_at,
  };
}

async function loadWeek(db: Db, periodId: string, number: number): Promise<Week> {
  const row = await db.getFirst<WeekRow>(`SELECT ${WEEK_COLUMNS} FROM weeks WHERE period_id = ? AND number = ?`, [
    periodId,
    number,
  ]);
  if (!row) throw new RepositoryError(`week ${number} not found in period ${periodId}`);
  return toWeek(row);
}

function assertOpen(week: Week): void {
  if (week.status === 'closed') throw new RepositoryError(`week ${week.number} is closed; its host cannot be changed`);
}

// Per-member week state (paid via allocations, settled via host offsets). Lives here, next to the weeks, so
// payments.ts and ledger.ts can both use it without importing each other.
interface WeekAmountRow {
  week: number;
  total: number;
}

/** Stored amounts per week for one member: paid via allocations and settled via host offsets. */
export async function loadWeekAmounts(
  db: Queryable,
  periodId: string,
  memberId: string,
): Promise<{ paid: WeekCredit[]; offset: WeekCredit[] }> {
  const toCredits = (rows: WeekAmountRow[]): WeekCredit[] => rows.map((r) => ({ week: r.week, amount: r.total }));
  const paid = await db.getAll<WeekAmountRow>(
    'SELECT week, SUM(amount) AS total FROM allocations WHERE period_id = ? AND member_id = ? GROUP BY week ORDER BY week',
    [periodId, memberId],
  );
  const offset = await db.getAll<WeekAmountRow>(
    'SELECT week, SUM(amount) AS total FROM offset_credits WHERE period_id = ? AND member_id = ? GROUP BY week ORDER BY week',
    [periodId, memberId],
  );
  return { paid: toCredits(paid), offset: toCredits(offset) };
}

/** Merges paid and offset amounts into one credit per week (what is already settled). */
export function combineCredits(paid: readonly WeekCredit[], offset: readonly WeekCredit[]): WeekCredit[] {
  const settled = new Map<number, number>();
  for (const c of [...paid, ...offset]) settled.set(c.week, (settled.get(c.week) ?? 0) + c.amount);
  return [...settled].map(([week, amount]) => ({ week, amount }));
}

export async function loadMemberCount(db: Queryable, periodId: string): Promise<number> {
  const row = await db.getFirst<{ member_count: number }>('SELECT member_count FROM periods WHERE id = ?', [periodId]);
  if (!row) throw new RepositoryError(`period ${periodId} not found`);
  return row.member_count;
}

/**
 * Per-week state of one member's dues, built from STORED allocations and offsets.
 * `outstanding` comes from the domain function; paid/offset are the stored sums.
 */
export async function loadWeekStatuses(db: Queryable, periodId: string, memberId: string): Promise<WeekStatus[]> {
  const totalWeeks = periodWeekCount(await loadMemberCount(db, periodId));
  const { paid, offset } = await loadWeekAmounts(db, periodId, memberId);

  const credits = combineCredits(paid, offset);

  const paidByWeek = new Map(paid.map((c) => [c.week, c.amount]));
  const offsetByWeek = new Map(offset.map((c) => [c.week, c.amount]));
  return allocatePayments([], totalWeeks, credits).weeks.map((w) => ({
    ...w,
    paid: paidByWeek.get(w.week) ?? 0,
    offset: offsetByWeek.get(w.week) ?? 0,
  }));
}


export async function loadCurrentWeek(db: Queryable, periodId: string): Promise<number> {
  const open = await db.getFirst<{ number: number }>(
    "SELECT number FROM weeks WHERE period_id = ? AND status = 'open' ORDER BY number LIMIT 1",
    [periodId],
  );
  if (open) return open.number;
  const last = await db.getFirst<{ n: number | null }>('SELECT MAX(number) AS n FROM weeks WHERE period_id = ?', [periodId]);
  if (!last?.n) throw new RepositoryError(`period ${periodId} not found`);
  return last.n;
}

export function createWeeksRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    async get(periodId: string, number: number): Promise<Week | null> {
      const row = await db.getFirst<WeekRow>(`SELECT ${WEEK_COLUMNS} FROM weeks WHERE period_id = ? AND number = ?`, [
        periodId,
        number,
      ]);
      return row ? toWeek(row) : null;
    },

    async listByPeriod(periodId: string): Promise<Week[]> {
      const rows = await db.getAll<WeekRow>(`SELECT ${WEEK_COLUMNS} FROM weeks WHERE period_id = ? ORDER BY number`, [
        periodId,
      ]);
      return rows.map(toWeek);
    },

    /** Exchanges the hosts of two open weeks (the "can we swap?" request); rejected if either week is closed. */
    async swapHosts(periodId: string, numberA: number, numberB: number): Promise<void> {
      if (numberA === numberB) throw new RepositoryError('cannot swap a week with itself');
      await db.transaction(async (tx) => {
        const a = await loadWeek(tx, periodId, numberA);
        const b = await loadWeek(tx, periodId, numberB);
        assertOpen(a);
        assertOpen(b);
        // The unique index is checked per statement, so park one host on NULL for a moment.
        const sql = 'UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?';
        await tx.run(sql, [null, periodId, a.number]);
        await tx.run(sql, [a.hostMemberId, periodId, b.number]);
        await tx.run(sql, [b.hostMemberId, periodId, a.number]);
      });
    },

    /**
     * Closes the OLDEST open week of an active period (weeks are closed strictly in order, no payout needed).
     * Returns the closed week number. Throws when there is no open week left.
     */
    async closeOldest(periodId: string): Promise<number> {
      return db.transaction(async (tx) => {
        const period = await tx.getFirst<{ status: string }>('SELECT status FROM periods WHERE id = ?', [periodId]);
        if (!period) throw new RepositoryError(`period ${periodId} not found`);
        const oldest = await tx.getFirst<{ number: number }>(
          "SELECT number FROM weeks WHERE period_id = ? AND status = 'open' ORDER BY number LIMIT 1",
          [periodId],
        );
        if (!oldest) throw new RepositoryError('no open week left to close');
        await tx.run("UPDATE weeks SET status = 'closed', closed_at = ? WHERE period_id = ? AND number = ?", [
          deps.now(),
          periodId,
          oldest.number,
        ]);
        return oldest.number;
      });
    },

    /**
     * The "current week" for arrears: the oldest open week; when every week is closed, the last week.
     * (Not the phone clock: arrears follow what the owner has closed.)
     */
    async currentWeek(periodId: string): Promise<number> {
      return loadCurrentWeek(db, periodId);
    },

    /** Closes a week. After this its host is locked; later fixes go through ledger corrections (M5). */
    async close(periodId: string, number: number): Promise<void> {
      const week = await loadWeek(db, periodId, number);
      if (week.status === 'closed') return;
      await db.run("UPDATE weeks SET status = 'closed', closed_at = ? WHERE period_id = ? AND number = ?", [
        deps.now(),
        periodId,
        number,
      ]);
    },
  };
}

export type WeeksRepo = ReturnType<typeof createWeeksRepo>;
