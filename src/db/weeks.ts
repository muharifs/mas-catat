// Weeks repository: the host schedule. Every member hosts exactly once, so a host change is always a SWAP of
// two weeks, and it is allowed only while both weeks are open.
import type { Db } from './db';
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
