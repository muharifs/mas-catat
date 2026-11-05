// Weeks repository: the meeting schedule (a "week" in code is a "pertemuan" in the UI). Hosts are picked per
// meeting, only for the current and the next open meeting (rules in src/domain/schedule.ts). Every member hosts
// exactly once, so picking a member who already holds another open meeting exchanges the two hosts.
import { allocatePayments } from '@/domain/allocation';
import { periodWeekCount } from '@/domain/dues';
import { planAssignment, type WeekChange } from '@/domain/schedule';
import type { WeekCredit, WeekStatus } from '@/domain/types';
import type { Db, Queryable } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError } from './errors';

export type WeekState = 'open' | 'closed';

export interface Week {
  periodId: string;
  number: number;
  date: string;
  /** null = not decided yet ("Belum ditentukan"). */
  hostMemberId: string | null;
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

/**
 * Writes final hosts and dates. The unique index on (period, host) is checked per statement, so every week whose
 * host changes is parked on NULL first; then the final values are written. Call inside a transaction.
 */
async function applyChanges(tx: Queryable, periodId: string, changes: readonly WeekChange[]): Promise<void> {
  for (const c of changes) {
    await tx.run('UPDATE weeks SET host_member_id = NULL WHERE period_id = ? AND number = ?', [periodId, c.number]);
  }
  for (const c of changes) {
    await tx.run('UPDATE weeks SET host_member_id = ?, date = ? WHERE period_id = ? AND number = ?', [
      c.hostMemberId,
      c.date,
      periodId,
      c.number,
    ]);
  }
}

async function assertHasHost(db: Queryable, periodId: string, number: number): Promise<void> {
  const row = await db.getFirst<{ host_member_id: string | null }>(
    'SELECT host_member_id FROM weeks WHERE period_id = ? AND number = ?',
    [periodId, number],
  );
  if (row && row.host_member_id === null) throw new RepositoryError(`week ${number} has no host; pick a host first`);
}

// Per-member week state (paid via allocations, settled via host offsets). Lives here, next to the weeks, so
// payments.ts and ledger.ts can both use it without importing each other.
interface WeekAmountRow {
  week: number;
  total: number;
}

/**
 * Stored amounts per week for one member: paid via allocations and settled via host offsets.
 * Corrected things are ignored but never deleted: allocations of a reversed payment, and offset credits of an
 * offset entry that has a reversal.
 */
export async function loadWeekAmounts(
  db: Queryable,
  periodId: string,
  memberId: string,
): Promise<{ paid: WeekCredit[]; offset: WeekCredit[] }> {
  const toCredits = (rows: WeekAmountRow[]): WeekCredit[] => rows.map((r) => ({ week: r.week, amount: r.total }));
  const paid = await db.getAll<WeekAmountRow>(
    'SELECT week, SUM(amount) AS total FROM allocations WHERE period_id = ? AND member_id = ? AND payment_id NOT IN (SELECT payment_id FROM payment_reversals) GROUP BY week ORDER BY week',
    [periodId, memberId],
  );
  const offset = await db.getAll<WeekAmountRow>(
    `SELECT week, SUM(amount) AS total FROM offset_credits
      WHERE period_id = ? AND member_id = ?
        AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = offset_credits.ledger_entry_id)
      GROUP BY week ORDER BY week`,
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

    /** Exchanges the hosts (dates stay) of two open weeks; rejected if either week is closed. */
    async swapHosts(periodId: string, numberA: number, numberB: number): Promise<void> {
      if (numberA === numberB) throw new RepositoryError('cannot swap a week with itself');
      await db.transaction(async (tx) => {
        const a = await loadWeek(tx, periodId, numberA);
        const b = await loadWeek(tx, periodId, numberB);
        assertOpen(a);
        assertOpen(b);
        await applyChanges(tx, periodId, [
          { number: a.number, hostMemberId: b.hostMemberId, date: a.date },
          { number: b.number, hostMemberId: a.hostMemberId, date: b.date },
        ]);
      });
    },

    /**
     * Picks the host AND the date of an open meeting in ONE transaction. Allowed only for the current (oldest
     * open) and the next open meeting, and only for members who have not hosted a closed meeting. If the member
     * already holds another open meeting the two hosts are exchanged. Later unassigned meetings get new estimated
     * dates (7 days apart from the last chosen date) and the last meeting is assigned automatically.
     * All rules are in planAssignment (src/domain/schedule.ts); this method only loads and writes.
     */
    async assignHost(periodId: string, number: number, memberId: string, date: string): Promise<void> {
      await db.transaction(async (tx) => {
        const rows = await tx.getAll<WeekRow>(`SELECT ${WEEK_COLUMNS} FROM weeks WHERE period_id = ? ORDER BY number`, [
          periodId,
        ]);
        if (rows.length === 0) throw new RepositoryError(`period ${periodId} not found`);
        const members = await tx.getAll<{ member_id: string }>(
          'SELECT member_id FROM period_members WHERE period_id = ? ORDER BY initial_order',
          [periodId],
        );
        const changes = planAssignment({
          weeks: rows.map((r) => ({ number: r.number, date: r.date, hostMemberId: r.host_member_id, status: r.status })),
          memberIds: members.map((m) => m.member_id),
          number,
          memberId,
          date,
        });
        await applyChanges(tx, periodId, changes);
      });
    },

    /**
     * Closes the OLDEST open week of an active period (weeks are closed strictly in order, no payout needed).
     * A week without a host cannot be closed. Returns the closed week number. Throws when there is no open week left.
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
        await assertHasHost(tx, periodId, oldest.number);
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
      await assertHasHost(db, periodId, number);
      await db.run("UPDATE weeks SET status = 'closed', closed_at = ? WHERE period_id = ? AND number = ?", [
        deps.now(),
        periodId,
        number,
      ]);
    },
  };
}

export type WeeksRepo = ReturnType<typeof createWeeksRepo>;
