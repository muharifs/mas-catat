// Weeks repository: the meeting schedule (a "week" in code is a "pertemuan" in the UI). Hosts are picked per
// meeting, only for the current and the next open meeting (rules in src/domain/schedule.ts). Every member hosts
// exactly once, so picking a member who already holds another open meeting exchanges the two hosts.
import { allocatePayments } from '@/domain/allocation';
import { periodWeekCount } from '@/domain/dues';
import { assertNoStandingPayout, planAssignment, startDateAfterMeetingChange, type WeekChange } from '@/domain/schedule';
import type { WeekCredit, WeekStatus } from '@/domain/types';
import {
  assertSkipUndoable,
  assertWeekSkippable,
  previewWeekSkip,
  skippedTurnMember,
  type WeekSkipContext,
  type WeekSkipPreview,
} from '@/domain/week-skip';
import { loadCreditBalance } from './creditBalance';
import type { Db, Queryable } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError, SkipUndoBlockedError } from './errors';

/** 'skipped' = a skip of this meeting is in force (decision 33), also after its period was closed. */
export type WeekState = 'open' | 'closed' | 'skipped';

export interface Week {
  periodId: string;
  number: number;
  date: string;
  /** null = not decided yet ("Belum ditentukan"). */
  hostMemberId: string | null;
  status: WeekState;
  /** A skip is in force (same as status 'skipped'). A skipped meeting has no dues and no host payout. */
  skipped: boolean;
  closedAt: string | null;
}

interface WeekRow {
  period_id: string;
  number: number;
  date: string;
  host_member_id: string | null;
  /** Stored status: a skipped meeting stays 'open' until its period closes. */
  status: 'open' | 'closed';
  closed_at: string | null;
  skipped: number;
}

const WEEK_COLUMNS =
  'period_id, number, date, host_member_id, status, closed_at, ' +
  'EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = weeks.period_id AND k.week = weeks.number) AS skipped';

function toWeek(r: WeekRow): Week {
  const skipped = r.skipped === 1;
  return {
    periodId: r.period_id,
    number: r.number,
    date: r.date,
    hostMemberId: r.host_member_id,
    status: skipped ? 'skipped' : r.status,
    skipped,
    closedAt: r.closed_at,
  };
}

/** Numbers of the meetings of the period that have a skip in force. */
export async function loadSkippedWeekNumbers(db: Queryable, periodId: string): Promise<number[]> {
  const rows = await db.getAll<{ week: number }>('SELECT week FROM skipped_weeks WHERE period_id = ? ORDER BY week', [periodId]);
  return rows.map((r) => r.week);
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
  if (week.status === 'skipped') {
    throw new RepositoryError(`week ${week.number} is skipped; its host and date cannot be changed`);
  }
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

/**
 * Meetings whose host payout stands: a host_payout entry exists and has no reversal (a corrected payout counts as
 * unpaid, the same rule as closing a period). Kept here, not imported from ledger.ts, to avoid a circular import.
 */
export async function loadStandingPayoutWeeks(db: Queryable, periodId: string): Promise<number[]> {
  const rows = await db.getAll<{ week: number }>(
    `SELECT DISTINCT e.week AS week FROM ledger_entries e
      WHERE e.period_id = ? AND e.type = 'host_payout' AND e.week IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id)
      ORDER BY e.week`,
    [periodId],
  );
  return rows.map((r) => r.week);
}

/**
 * Meetings hosted by this member in the period whose host payout stands (recorded, not corrected). A payout cannot
 * stand while its host changes (F1), so the current host of the week is the one who was paid.
 */
export async function loadStandingPayoutWeeksOfHost(db: Queryable, periodId: string, memberId: string): Promise<number[]> {
  const rows = await db.getAll<{ week: number }>(
    `SELECT DISTINCT e.week AS week FROM ledger_entries e
      JOIN weeks w ON w.period_id = e.period_id AND w.number = e.week
      WHERE e.period_id = ? AND e.type = 'host_payout' AND e.week IS NOT NULL AND w.host_member_id = ?
        AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id)
      ORDER BY e.week`,
    [periodId, memberId],
  );
  return rows.map((r) => r.week);
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
 * Stored amounts per week for one member: paid via allocations, settled via host offsets, settled by credit.
 * Corrected things are ignored but never deleted: allocations of a reversed payment, and offset credits of an
 * offset entry that has a reversal.
 */
export async function loadWeekAmounts(
  db: Queryable,
  periodId: string,
  memberId: string,
): Promise<{ paid: WeekCredit[]; offset: WeekCredit[]; credited: WeekCredit[] }> {
  const toCredits = (rows: WeekAmountRow[]): WeekCredit[] => rows.map((r) => ({ week: r.week, amount: r.total }));
  // A skipped meeting owes nothing: amounts stored on it (allocations, offsets, carry-over) stay in their tables but
  // are not counted here; creditBalance.ts hands them back as member credit.
  const notSkipped = (periodColumn: string, weekColumn: string) =>
    `AND NOT EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = ${periodColumn} AND k.week = ${weekColumn})`;
  const paid = await db.getAll<WeekAmountRow>(
    `SELECT week, SUM(amount) AS total FROM allocations WHERE period_id = ? AND member_id = ? AND payment_id NOT IN (SELECT payment_id FROM payment_reversals)
        ${notSkipped('allocations.period_id', 'allocations.week')} GROUP BY week ORDER BY week`,
    [periodId, memberId],
  );
  const offset = await db.getAll<WeekAmountRow>(
    `SELECT week, SUM(amount) AS total FROM offset_credits
      WHERE period_id = ? AND member_id = ?
        AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = offset_credits.ledger_entry_id)
        ${notSkipped('offset_credits.period_id', 'offset_credits.week')}
      GROUP BY week ORDER BY week`,
    [periodId, memberId],
  );
  // Member credit applied to this period's weeks: settled at close (own arrears) or carried over from an earlier period.
  const credited = await db.getAll<WeekAmountRow>(
    `SELECT week, SUM(amount) AS total FROM credit_applications WHERE to_period_id = ? AND member_id = ?
        ${notSkipped('credit_applications.to_period_id', 'credit_applications.week')} GROUP BY week ORDER BY week`,
    [periodId, memberId],
  );
  return { paid: toCredits(paid), offset: toCredits(offset), credited: toCredits(credited) };
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
  const { paid, offset, credited } = await loadWeekAmounts(db, periodId, memberId);

  const credits = combineCredits(paid, offset);
  const skippedWeeks = await loadSkippedWeekNumbers(db, periodId);

  const paidByWeek = new Map(paid.map((c) => [c.week, c.amount]));
  const offsetByWeek = new Map(offset.map((c) => [c.week, c.amount]));
  return allocatePayments([], totalWeeks, credits, credited, skippedWeeks).weeks.map((w) => ({
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

/** One skip of a meeting, with its undo when there is one. Append-only: an undone skip stays listed. */
export interface WeekSkipRecord {
  id: string;
  periodId: string;
  week: number;
  reason: string;
  createdAt: string;
  /** Null while the skip is in force. */
  undoReason: string | null;
  undoneAt: string | null;
}

/** The member who lost a turn to host because the last meeting of an ended period was skipped. */
export interface SkippedTurn {
  memberId: string;
  periodId: string;
  periodName: string;
  /** The meeting that was skipped. */
  week: number;
}

/** Everything the skip rules need, loaded through `db` (a transaction handle when writing). */
async function loadSkipContext(db: Queryable, periodId: string): Promise<WeekSkipContext> {
  const period = await db.getFirst<{ status: 'active' | 'closed'; member_count: number }>(
    'SELECT status, member_count FROM periods WHERE id = ?',
    [periodId],
  );
  if (!period) throw new RepositoryError(`period ${periodId} not found`);
  const rows = await db.getAll<WeekRow>(`SELECT ${WEEK_COLUMNS} FROM weeks WHERE period_id = ? ORDER BY number`, [periodId]);
  const standing = await loadStandingPayoutWeeks(db, periodId);
  return {
    periodId,
    periodStatus: period.status,
    memberCount: period.member_count,
    weeks: rows.map((r) => ({
      number: r.number,
      status: r.status,
      skipped: r.skipped === 1,
      hasActivePayout: standing.includes(r.number),
    })),
  };
}

/** The skip of the period that is in force, or null. At most one meeting (the last) can be skipped. */
async function loadSkipInForce(db: Queryable, periodId: string): Promise<{ skipId: string; week: number } | null> {
  const row = await db.getFirst<{ skip_id: string; week: number }>(
    'SELECT skip_id, week FROM skipped_weeks WHERE period_id = ? ORDER BY week LIMIT 1',
    [periodId],
  );
  return row ? { skipId: row.skip_id, week: row.week } : null;
}

async function loadSkipRecord(db: Queryable, skipId: string): Promise<WeekSkipRecord> {
  const r = await db.getFirst<{
    id: string;
    period_id: string;
    week: number;
    reason: string;
    created_at: string;
    undo_reason: string | null;
    undone_at: string | null;
  }>(
    `SELECT s.id, s.period_id, s.week, s.reason, s.created_at, u.reason AS undo_reason, u.created_at AS undone_at
       FROM week_skips s LEFT JOIN week_skip_undos u ON u.skip_id = s.id WHERE s.id = ?`,
    [skipId],
  );
  if (!r) throw new RepositoryError(`skip ${skipId} not found`);
  return {
    id: r.id,
    periodId: r.period_id,
    week: r.week,
    reason: r.reason,
    createdAt: r.created_at,
    undoReason: r.undo_reason,
    undoneAt: r.undone_at,
  };
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

    /** Numbers of the meetings whose host payout stands (for the UI: no host change there). */
    async standingPayoutWeeks(periodId: string): Promise<number[]> {
      return loadStandingPayoutWeeks(db, periodId);
    },

    /** Exchanges the hosts (dates stay) of two open weeks; rejected if either week is closed. */
    async swapHosts(periodId: string, numberA: number, numberB: number): Promise<void> {
      if (numberA === numberB) throw new RepositoryError('cannot swap a week with itself');
      await db.transaction(async (tx) => {
        const a = await loadWeek(tx, periodId, numberA);
        const b = await loadWeek(tx, periodId, numberB);
        assertOpen(a);
        assertOpen(b);
        const standing = await loadStandingPayoutWeeks(tx, periodId);
        assertNoStandingPayout(
          [a, b].map((w) => ({ number: w.number, date: w.date, hostMemberId: w.hostMemberId, status: w.status, payoutStands: standing.includes(w.number) })),
          [a.number, b.number],
        );
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
        const standing = await loadStandingPayoutWeeks(tx, periodId);
        const changes = planAssignment({
          weeks: rows.map((r) => ({
            number: r.number,
            date: r.date,
            hostMemberId: r.host_member_id,
            status: toWeek(r).status,
            payoutStands: standing.includes(r.number),
          })),
          memberIds: members.map((m) => m.member_id),
          number,
          memberId,
          date,
        });
        await applyChanges(tx, periodId, changes);
        // Meeting 1 carries the start date of the period: keep them equal while nothing is closed (same transaction).
        const period = await tx.getFirst<{ start_date: string }>('SELECT start_date FROM periods WHERE id = ?', [periodId]);
        if (period) {
          const newStart = startDateAfterMeetingChange(
            rows.map((r) => ({ number: r.number, date: r.date, hostMemberId: r.host_member_id, status: toWeek(r).status })),
            number,
            date,
            period.start_date,
          );
          if (newStart) await tx.run('UPDATE periods SET start_date = ? WHERE id = ?', [newStart, periodId]);
        }
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
        // A skipped meeting is closed together with its period, never on its own.
        if ((await loadSkippedWeekNumbers(tx, periodId)).includes(oldest.number)) {
          throw new RepositoryError(`week ${oldest.number} is skipped; it cannot be closed`);
        }
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

    /**
     * What skipping the LAST meeting of the period would do, without writing: whether it is allowed (and if not, why:
     * `blocker.code` and the meetings behind it) and the dues already settled for that meeting, which would become
     * member credit (`prepaidTotal`, `prepaidMembers`). The same rules as skipLast.
     */
    async previewSkip(periodId: string): Promise<WeekSkipPreview> {
      const ctx = await loadSkipContext(db, periodId);
      const members = await db.getAll<{ member_id: string }>(
        'SELECT member_id FROM period_members WHERE period_id = ? ORDER BY initial_order',
        [periodId],
      );
      const prepaid = [];
      for (const m of members) {
        const week = (await loadWeekStatuses(db, periodId, m.member_id)).find((s) => s.week === ctx.memberCount);
        prepaid.push({ memberId: m.member_id, amount: week ? week.paid + week.offset + week.credited : 0 });
      }
      return previewWeekSkip(ctx, prepaid);
    },

    /**
     * Skips the LAST meeting (number = member count) of the ACTIVE period, with a required reason. Allowed only while
     * it is the oldest open meeting, every earlier meeting is closed with its host payout in force, no host payout of
     * it stands and it is not skipped already (WeekSkipError, code says which). One append-only row; no ledger entry
     * and no allocation changes: dues already paid for it become member credit by derivation. The host already set on
     * it stays stored. Rules are checked again inside the write transaction.
     */
    async skipLast(periodId: string, reason: string): Promise<WeekSkipRecord> {
      return db.transaction(async (tx) => {
        const ctx = await loadSkipContext(tx, periodId);
        assertWeekSkippable(ctx, reason);
        const id = deps.newId();
        await tx.run('INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES (?, ?, ?, ?, ?)', [
          id,
          periodId,
          ctx.memberCount,
          reason.trim(),
          deps.now(),
        ]);
        return loadSkipRecord(tx, id);
      });
    },

    /**
     * Undoes the skip in force, with a required reason, while the period is still active. The meeting is an ordinary
     * open meeting again and its dues count again. Every credit pool the skip touched is recomputed; if one would go
     * below zero (released credit was refunded meanwhile) SkipUndoBlockedError is thrown and nothing is written.
     */
    async undoSkip(periodId: string, reason: string): Promise<WeekSkipRecord> {
      return db.transaction(async (tx) => {
        const ctx = await loadSkipContext(tx, periodId);
        const inForce = await loadSkipInForce(tx, periodId);
        assertSkipUndoable(ctx, inForce?.week ?? ctx.memberCount, reason);
        if (!inForce) throw new RepositoryError(`period ${periodId} has no skip in force`); // unreachable: asserted above
        await tx.run('INSERT INTO week_skip_undos (skip_id, reason, created_at) VALUES (?, ?, ?)', [
          inForce.skipId,
          reason.trim(),
          deps.now(),
        ]);
        // Pools touched: every member's own credit in this period (payments, released offsets) and the credit of any
        // earlier period that was carried into the skipped meeting.
        const pools = new Map<string, { periodId: string; memberId: string }>();
        const add = (p: string, m: string) => pools.set(`${p}|${m}`, { periodId: p, memberId: m });
        for (const m of await tx.getAll<{ member_id: string }>('SELECT member_id FROM period_members WHERE period_id = ?', [periodId])) {
          add(periodId, m.member_id);
        }
        for (const c of await tx.getAll<{ from_period_id: string; member_id: string }>(
          "SELECT DISTINCT from_period_id, member_id FROM credit_applications WHERE to_period_id = ? AND week = ? AND kind = 'carry_over'",
          [periodId, inForce.week],
        )) {
          add(c.from_period_id, c.member_id);
        }
        for (const pool of pools.values()) {
          const balance = await loadCreditBalance(tx, pool.periodId, pool.memberId);
          if (balance < 0) {
            throw new SkipUndoBlockedError(
              `skip cannot be undone: member ${pool.memberId} would hold negative credit from period ${pool.periodId} (${balance}); the released credit was refunded`,
            );
          }
        }
        return loadSkipRecord(tx, inForce.skipId);
      });
    },

    /**
     * The member whose turn to host was lost to a skip in the LATEST ended period, or null (no ended period, no skip,
     * or no single member to name). New-period screens use it for a hint: reading only, no money.
     */
    async skippedTurn(): Promise<SkippedTurn | null> {
      const latest = await db.getFirst<{ id: string; name: string }>(
        "SELECT id, name FROM periods WHERE status = 'closed' ORDER BY start_date DESC, rowid DESC LIMIT 1",
      );
      if (!latest) return null;
      const rows = await db.getAll<WeekRow>(`SELECT ${WEEK_COLUMNS} FROM weeks WHERE period_id = ? ORDER BY number`, [latest.id]);
      const skipped = rows.find((r) => r.skipped === 1);
      if (!skipped) return null;
      const members = await db.getAll<{ member_id: string }>(
        'SELECT member_id FROM period_members WHERE period_id = ? ORDER BY initial_order',
        [latest.id],
      );
      const memberId = skippedTurnMember(
        members.map((m) => m.member_id),
        rows.map((r) => ({ hostMemberId: r.host_member_id, skipped: r.skipped === 1 })),
      );
      return memberId ? { memberId, periodId: latest.id, periodName: latest.name, week: skipped.number } : null;
    },

    /** Every skip of the period, oldest first, undone ones included (with the undo reason). */
    async listSkipHistory(periodId: string): Promise<WeekSkipRecord[]> {
      const ids = await db.getAll<{ id: string }>('SELECT id FROM week_skips WHERE period_id = ? ORDER BY rowid', [periodId]);
      const records: WeekSkipRecord[] = [];
      for (const r of ids) records.push(await loadSkipRecord(db, r.id));
      return records;
    },

    /** Closes a week. After this its host is locked; later fixes go through ledger corrections (M5). */
    async close(periodId: string, number: number): Promise<void> {
      const week = await loadWeek(db, periodId, number);
      if (week.status === 'closed') return;
      if (week.status === 'skipped') throw new RepositoryError(`week ${number} is skipped; it cannot be closed`);
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
