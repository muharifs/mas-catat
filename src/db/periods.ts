// Periods repository: creates a period with its fixed member list and host schedule.
import { assertIsoDate, DomainError } from '@/domain/money';
import { periodWeekCount } from '@/domain/dues';
import { addDays, isRealDate } from '@/domain/schedule';
import type { Db } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError } from './errors';

export type PeriodStatus = 'active' | 'closed';

export interface Period {
  id: string;
  name: string;
  /** N: fixed for the whole period. */
  memberCount: number;
  status: PeriodStatus;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

export interface PeriodMember {
  memberId: string;
  /** Position in the originally planned rotation (1-based). The real host can differ (see weeks). */
  initialOrder: number;
}

interface PeriodRow {
  id: string;
  name: string;
  member_count: number;
  status: PeriodStatus;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

const toPeriod = (r: PeriodRow): Period => ({
  id: r.id,
  name: r.name,
  memberCount: r.member_count,
  status: r.status,
  startDate: r.start_date,
  endDate: r.end_date,
  createdAt: r.created_at,
});

export interface CreatePeriodInput {
  name: string;
  /** Date of week 1; later weeks are 7 days apart. */
  startDate: string;
  /** Member ids in planned host order: index 0 hosts week 1. Its length is N. */
  hostOrder: readonly string[];
}

export function createPeriodsRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    /**
     * Creates the period, its N members and its N weeks (one planned host each) in ONE transaction.
     * Anything invalid (duplicate or unknown member, bad date) rolls back and leaves no rows behind.
     */
    async create(input: CreatePeriodInput): Promise<Period> {
      const name = input.name.trim();
      if (name.length === 0) throw new RepositoryError('period name must not be empty');
      assertIsoDate(input.startDate, 'startDate');
      if (!isRealDate(input.startDate)) {
        throw new DomainError(`startDate is not a real calendar date: ${input.startDate}`);
      }
      const memberCount = input.hostOrder.length;
      const weekCount = periodWeekCount(memberCount); // throws DomainError when N is 0
      if (new Set(input.hostOrder).size !== memberCount) {
        throw new RepositoryError('hostOrder must list each member exactly once');
      }

      const period: Period = {
        id: deps.newId(),
        name,
        memberCount,
        status: 'active',
        startDate: input.startDate,
        endDate: null,
        createdAt: deps.now(),
      };

      await db.transaction(async (tx) => {
        // Only one active period at a time. Checked inside the transaction so it cannot race.
        const active = await tx.getFirst<{ id: string }>("SELECT id FROM periods WHERE status = 'active' LIMIT 1");
        if (active) throw new RepositoryError('another period is still active; end it before creating a new one');
        await tx.run(
          'INSERT INTO periods (id, name, member_count, status, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [period.id, period.name, period.memberCount, period.status, period.startDate, null, period.createdAt],
        );
        for (let i = 0; i < weekCount; i += 1) {
          const memberId = input.hostOrder[i] as string; // i < length, checked above
          await tx.run('INSERT INTO period_members (period_id, member_id, initial_order) VALUES (?, ?, ?)', [
            period.id,
            memberId,
            i + 1,
          ]);
        }
        for (let i = 0; i < weekCount; i += 1) {
          await tx.run('INSERT INTO weeks (period_id, number, date, host_member_id, status) VALUES (?, ?, ?, ?, ?)', [
            period.id,
            i + 1,
            addDays(period.startDate, 7 * i),
            input.hostOrder[i] as string,
            'open',
          ]);
        }
      });
      return period;
    },

    async getById(id: string): Promise<Period | null> {
      const row = await db.getFirst<PeriodRow>(
        'SELECT id, name, member_count, status, start_date, end_date, created_at FROM periods WHERE id = ?',
        [id],
      );
      return row ? toPeriod(row) : null;
    },

    /** The single active period, or null. */
    async getActive(): Promise<Period | null> {
      const row = await db.getFirst<PeriodRow>(
        "SELECT id, name, member_count, status, start_date, end_date, created_at FROM periods WHERE status = 'active' ORDER BY rowid DESC LIMIT 1",
      );
      return row ? toPeriod(row) : null;
    },

    /**
     * Ends the period: status='closed' and end_date only. Allowed only when EVERY week is closed.
     * Write-off of member debt and leftover credit are not done here (planned for M5).
     */
    async close(periodId: string, endDate: string): Promise<void> {
      assertIsoDate(endDate, 'endDate');
      if (!isRealDate(endDate)) throw new DomainError(`endDate is not a real calendar date: ${endDate}`);
      await db.transaction(async (tx) => {
        const period = await tx.getFirst<PeriodRow>(
          'SELECT id, name, member_count, status, start_date, end_date, created_at FROM periods WHERE id = ?',
          [periodId],
        );
        if (!period) throw new RepositoryError(`period ${periodId} not found`);
        if (period.status === 'closed') throw new RepositoryError(`period ${periodId} is already closed`);
        if (endDate < period.start_date) throw new RepositoryError('end date is before the start date of the period');
        const open = await tx.getFirst<{ n: number }>(
          "SELECT COUNT(*) AS n FROM weeks WHERE period_id = ? AND status <> 'closed'",
          [periodId],
        );
        if ((open?.n ?? 0) > 0) throw new RepositoryError('period still has open weeks; close every week first');
        await tx.run("UPDATE periods SET status = 'closed', end_date = ? WHERE id = ?", [endDate, periodId]);
      });
    },

    /** Newest first. */
    async list(): Promise<Period[]> {
      const rows = await db.getAll<PeriodRow>(
        'SELECT id, name, member_count, status, start_date, end_date, created_at FROM periods ORDER BY start_date DESC, rowid DESC',
      );
      return rows.map(toPeriod);
    },

    /** Members of the period in planned rotation order. */
    async getMembers(periodId: string): Promise<PeriodMember[]> {
      const rows = await db.getAll<{ member_id: string; initial_order: number }>(
        'SELECT member_id, initial_order FROM period_members WHERE period_id = ? ORDER BY initial_order',
        [periodId],
      );
      return rows.map((r) => ({ memberId: r.member_id, initialOrder: r.initial_order }));
    },
  };
}

export type PeriodsRepo = ReturnType<typeof createPeriodsRepo>;
