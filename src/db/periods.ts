// Periods repository: creates a period with its fixed member list and its (host-less) meeting slots (carrying over
// member credit), and closes it (credit settles arrears, then one write-off per member).
import { endDateProblem, previewPeriodClose, type PeriodClosePreview } from '@/domain/close';
import { assertIsoDate, DomainError } from '@/domain/money';
import { periodWeekCount } from '@/domain/dues';
import { isRealDate, nextMeetingDate, planAutoAssignment, type ScheduleWeek } from '@/domain/schedule';
import { insertCreditApplication, loadAvailableCredit, planMemberCarryOvers, type MemberCarryOver } from './credits';
import type { Db, Queryable } from './db';
import { defaultDeps, todayOf, type RepoDeps } from './deps';
import { RepositoryError } from './errors';
import { insertEntry, loadWeekPayout } from './ledger';
import { loadWeekStatuses } from './weeks';

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
  /** Order in which the members were selected when the period was created (1-based). Not a host order. */
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
  /** Estimated date of meeting 1; later meetings are estimated 7 days apart. */
  startDate: string;
  /** The members of the period, each exactly once. Its length is N. No host order: hosts are picked per meeting. */
  memberIds: readonly string[];
}

/**
 * Everything period close needs, loaded through `db` (a transaction handle when closing) and turned into the plan
 * by the pure previewPeriodClose. The preview screen and the close itself use this same function.
 */
async function loadClosePreview(db: Queryable, periodId: string): Promise<PeriodClosePreview> {
  const weekRows = await db.getAll<{ number: number; status: 'open' | 'closed' }>(
    'SELECT number, status FROM weeks WHERE period_id = ? ORDER BY number',
    [periodId],
  );
  const weeks = [];
  for (const w of weekRows) {
    weeks.push({ number: w.number, status: w.status, hasActivePayout: (await loadWeekPayout(db, periodId, w.number)) !== null });
  }
  const memberRows = await db.getAll<{ member_id: string }>(
    'SELECT member_id FROM period_members WHERE period_id = ? ORDER BY initial_order',
    [periodId],
  );
  const members = [];
  for (const m of memberRows) {
    members.push({
      memberId: m.member_id,
      statuses: await loadWeekStatuses(db, periodId, m.member_id),
      credit: await loadAvailableCredit(db, periodId, m.member_id),
    });
  }
  return previewPeriodClose({ weeks, members });
}

export function createPeriodsRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    /**
     * Creates the period, its N members and its N meetings (host NULL, estimated dates) in ONE transaction.
     * With a single member, the only meeting gets that member automatically.
     * Unused credit of the members from closed periods is carried over in the same transaction.
     * Anything invalid (duplicate or unknown member, bad date) rolls back and leaves no rows behind.
     */
    async create(input: CreatePeriodInput): Promise<Period> {
      const name = input.name.trim();
      if (name.length === 0) throw new RepositoryError('period name must not be empty');
      assertIsoDate(input.startDate, 'startDate');
      if (!isRealDate(input.startDate)) {
        throw new DomainError(`startDate is not a real calendar date: ${input.startDate}`);
      }
      const memberCount = input.memberIds.length;
      const weekCount = periodWeekCount(memberCount); // throws DomainError when N is 0
      if (new Set(input.memberIds).size !== memberCount) {
        throw new RepositoryError('memberIds must list each member exactly once');
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
          const memberId = input.memberIds[i] as string; // i < length, checked above
          await tx.run('INSERT INTO period_members (period_id, member_id, initial_order) VALUES (?, ?, ?)', [
            period.id,
            memberId,
            i + 1,
          ]);
        }
        const planned: ScheduleWeek[] = [];
        let date = period.startDate;
        for (let i = 0; i < weekCount; i += 1) {
          if (i > 0) date = nextMeetingDate(date);
          planned.push({ number: i + 1, date, hostMemberId: null, status: 'open' });
          await tx.run('INSERT INTO weeks (period_id, number, date, host_member_id, status) VALUES (?, ?, ?, ?, ?)', [
            period.id,
            i + 1,
            date,
            null,
            'open',
          ]);
        }
        // Single member: the only meeting is the "last meeting" and is assigned automatically.
        for (const change of planAutoAssignment(planned, input.memberIds)) {
          await tx.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [
            change.hostMemberId,
            period.id,
            change.number,
          ]);
        }
        // Carry-over: unused credit from ALL closed periods settles weeks 1..N, oldest first. Stored per week, no
        // ledger entry (the money entered Tunai/Debit when it was received).
        for (const carry of await planMemberCarryOvers(tx, input.memberIds)) {
          for (const a of carry.plan.applications) {
            await insertCreditApplication(tx, deps, {
              kind: 'carry_over',
              fromPeriodId: a.fromPeriodId,
              memberId: carry.memberId,
              toPeriodId: period.id,
              week: a.week,
              amount: a.amount,
            });
          }
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
     * What closing the period would do, without writing anything: blockers (open meetings, unpaid hosts), arrears,
     * credit netting and the write-offs. close() uses the same plan.
     */
    async previewClose(periodId: string): Promise<PeriodClosePreview> {
      const period = await db.getFirst('SELECT 1 AS ok FROM periods WHERE id = ?', [periodId]);
      if (!period) throw new RepositoryError(`period ${periodId} not found`);
      return loadClosePreview(db, periodId);
    },

    /** What a new period with these members would take over from their unused credit (nothing is written). */
    async previewCarryOver(memberIds: readonly string[]): Promise<MemberCarryOver[]> {
      if (new Set(memberIds).size !== memberIds.length) throw new RepositoryError('memberIds must list each member exactly once');
      return planMemberCarryOvers(db, memberIds);
    },

    /**
     * Ends the period in ONE transaction (all or nothing):
     *  - rejected while any meeting is open, or any meeting has no host payout in force (a corrected payout counts
     *    as unpaid), and for an end date before the start date or in the future;
     *  - member credit settles that member's OWN arrears first, oldest week first, partial allowed (stored as
     *    credit_applications, no ledger entry);
     *  - then ONE debt_writeoff entry per member still in arrears (out, no pos, no week, dated the end date, amount
     *    = remaining arrears). Write-offs never change a kas balance; a unique index blocks a second one;
     *  - finally status closed and end_date.
     * Leftover credit stays available for carry-over (periods.create) or a refund (credits.refund).
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
        const problem = endDateProblem(endDate, period.start_date, todayOf(deps));
        if (problem === 'before_start') throw new RepositoryError('end date is before the start date of the period');
        if (problem === 'future') throw new DomainError(`end date is in the future: ${endDate}`);

        const preview = await loadClosePreview(tx, periodId);
        if (preview.openWeeks.length > 0) throw new RepositoryError('period still has open weeks; close every week first');
        if (preview.unpaidHostWeeks.length > 0) {
          throw new RepositoryError(
            `weeks ${preview.unpaidHostWeeks.join(', ')} have no host payout in force; pay the hosts before closing the period`,
          );
        }

        for (const m of preview.members) {
          for (const s of m.settlements) {
            await insertCreditApplication(tx, deps, {
              kind: 'settle_debt',
              fromPeriodId: periodId,
              memberId: m.memberId,
              toPeriodId: periodId,
              week: s.week,
              amount: s.amount,
            });
          }
        }
        for (const w of preview.writeoffs) {
          await insertEntry(tx, deps, {
            periodId,
            type: 'debt_writeoff',
            direction: 'out',
            date: endDate,
            amount: w.amount,
            memberId: w.memberId,
            week: null,
            note: 'Unpaid dues written off at period close',
            account: null,
            toAccount: null,
          });
        }
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

    /** Members of the period in the order they were selected. */
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
