// Reports repository (M6): READ-ONLY. It loads rows through the existing repositories and loaders and hands them to the
// pure functions in src/domain/report.ts; it never writes and never does money arithmetic itself.
import { hostPayoutAmount } from '@/domain/dues';
import type { KasBalances } from '@/domain/kas';
import {
  buildMemberHistory,
  computeExpectedKas,
  summarizeMeeting,
  summarizePeriod,
  type ExpectedKas,
  type HistoryApplicationInput,
  type HistoryEntryInput,
  type HistoryOffsetCredit,
  type MeetingSummary,
  type MemberHistory,
  type PeriodSummary,
} from '@/domain/report';
import type { Db } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError } from './errors';
import { createLedgerRepo } from './ledger';
import { loadAvailableCredit } from './credits';
import { createPaymentsRepo } from './payments';
import { createPeriodsRepo, type Period } from './periods';
import { createWeeksRepo, loadSkippedWeekNumbers, type Week } from './weeks';

export interface KasReport {
  /** Same numbers as the Kas screen (computeKasBalances over every entry of every period). */
  balances: KasBalances;
  expected: ExpectedKas;
}

export interface PeriodReport {
  period: Period;
  summary: PeriodSummary;
  meetings: MeetingSummary[];
}

/** open/closed of a meeting for the report layer; a skipped meeting is closed once its period was closed. */
function storedStatus(w: Week): 'open' | 'closed' {
  if (w.status === 'skipped') return w.closedAt !== null ? 'closed' : 'open';
  return w.status;
}

export function createReportsRepo(db: Db, deps: RepoDeps = defaultDeps) {
  const ledger = createLedgerRepo(db, deps);
  const payments = createPaymentsRepo(db, deps);
  const periods = createPeriodsRepo(db, deps);
  const weeks = createWeeksRepo(db, deps);

  async function requirePeriod(periodId: string): Promise<Period> {
    const period = await periods.getById(periodId);
    if (!period) throw new RepositoryError(`period ${periodId} not found`);
    return period;
  }

  /** One summary per meeting of the period, built from every member's stored week status and the payouts in force. */
  async function loadMeetings(period: Period): Promise<MeetingSummary[]> {
    const members = await periods.getMembers(period.id);
    const statusesByMember = new Map<string, Awaited<ReturnType<typeof payments.getWeekStatuses>>>();
    for (const m of members) statusesByMember.set(m.memberId, await payments.getWeekStatuses(period.id, m.memberId));

    const result: MeetingSummary[] = [];
    for (const w of await weeks.listByPeriod(period.id)) {
      const payout = await ledger.getWeekPayout(period.id, w.number);
      result.push(
        summarizeMeeting({
          memberCount: period.memberCount,
          week: w.number,
          date: w.date,
          hostMemberId: w.hostMemberId,
          status: storedStatus(w),
          skipped: w.skipped,
          members: members.map((m) => {
            const status = statusesByMember.get(m.memberId)?.find((s) => s.week === w.number);
            if (!status) throw new RepositoryError(`week ${w.number} has no status for member ${m.memberId}`);
            return { memberId: m.memberId, status };
          }),
          payout: payout ? payout.payout.amount : null,
          offset: payout?.offset ? payout.offset.amount : 0,
        }),
      );
    }
    return result;
  }

  return {
    /**
     * Actual kas (Tunai, Debit, Piutang) and expected kas, global over every period.
     * - outstanding dues: arrears through the current meeting of the ACTIVE period (what Home shows); ended periods
     *   have their debt written off, so they add nothing;
     * - credit held: (a) credit still available per source period and member, plus (b) carry-over applications that
     *   cover a meeting still open in the new period (it leaves the line when that meeting is closed). settle_debt
     *   applications are not counted: that credit already paid dues.
     * - info rows: dues paid ahead of the current meeting, and host payouts of closed meetings not paid yet.
     */
    async getKasReport(): Promise<KasReport> {
      const balances = await ledger.getKasBalances();
      const allPeriods = await periods.list();

      let outstandingDues = 0;
      const prepaidDues: number[] = [];
      for (const p of allPeriods.filter((x) => x.status === 'active')) {
        outstandingDues += (await payments.getArrearsSummary(p.id)).totalArrears;
        for (const b of await payments.listBalances(p.id)) prepaidDues.push(b.prepaid);
      }

      const availableCredits: number[] = [];
      const holders = await db.getAll<{ period_id: string; member_id: string }>(
        'SELECT period_id, member_id FROM period_members ORDER BY period_id, initial_order',
      );
      for (const h of holders) {
        const amount = await loadAvailableCredit(db, h.period_id, h.member_id);
        if (amount > 0) availableCredits.push(amount);
      }

      const carried = await db.getAll<{ amount: number }>(
        `SELECT ca.amount FROM credit_applications ca
           JOIN weeks w ON w.period_id = ca.to_period_id AND w.number = ca.week
          WHERE ca.kind = 'carry_over' AND w.status = 'open'
            AND NOT EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = ca.to_period_id AND k.week = ca.week)`,
      );

      const unpaidPayouts: number[] = [];
      for (const p of allPeriods) {
        for (const w of await weeks.listByPeriod(p.id)) {
          if (w.status !== 'closed' || w.hostMemberId === null) continue;
          if (!(await ledger.getWeekPayout(p.id, w.number))) unpaidPayouts.push(hostPayoutAmount(p.memberCount));
        }
      }

      return {
        balances,
        expected: computeExpectedKas({
          balances,
          outstandingDues,
          availableCredits,
          carriedOverOpen: carried.map((c) => c.amount),
          prepaidDues,
          unpaidPayouts,
        }),
      };
    },

    /** Period summary plus the summary of every meeting. Works for active and ended periods. */
    async getPeriodReport(periodId: string): Promise<PeriodReport> {
      const period = await requirePeriod(periodId);
      const entries = await ledger.listByPeriod(periodId);
      return {
        period,
        summary: summarizePeriod({
          memberCount: period.memberCount,
          entries,
          skippedCount: (await weeks.listByPeriod(periodId)).filter((w) => w.skipped).length,
        }),
        meetings: await loadMeetings(period),
      };
    },

    /** One meeting with the state of every member (member order is stored order; the screen sorts A-Z). */
    async getMeetingReport(periodId: string, number: number): Promise<MeetingSummary> {
      const period = await requirePeriod(periodId);
      const meeting = (await loadMeetings(period)).find((m) => m.week === number);
      if (!meeting) throw new RepositoryError(`week ${number} not found in period ${periodId}`);
      return meeting;
    },

    /** Everything that happened to one member in one period (loans: over all periods). */
    async getMemberHistory(periodId: string, memberId: string): Promise<MemberHistory> {
      const period = await requirePeriod(periodId);
      const isMember = await db.getFirst('SELECT 1 AS ok FROM period_members WHERE period_id = ? AND member_id = ?', [periodId, memberId]);
      if (!isMember) throw new RepositoryError(`member ${memberId} not found in period ${periodId}`);

      const [statuses, weekList, paymentList, allocations] = await Promise.all([
        payments.getWeekStatuses(periodId, memberId),
        weeks.listByPeriod(periodId),
        payments.listWithCredit(periodId, memberId),
        payments.listAllocations(periodId, memberId),
      ]);

      const entries: HistoryEntryInput[] = [];
      for (const p of await periods.list()) {
        for (const e of await ledger.listByMember(p.id, memberId)) {
          entries.push({
            id: e.id,
            periodId: e.periodId,
            type: e.type,
            direction: e.direction,
            date: e.date,
            amount: e.amount,
            week: e.week,
            account: e.account,
            reversesEntryId: e.reversesEntryId,
            correctionReason: e.correctionReason,
            createdAt: e.createdAt,
          });
        }
      }

      const applicationRows = await db.getAll<{
        kind: 'settle_debt' | 'carry_over';
        from_period_id: string;
        to_period_id: string;
        from_name: string;
        to_name: string;
        from_end: string | null;
        week: number;
        amount: number;
        created_at: string;
      }>(
        `SELECT ca.kind, ca.from_period_id, ca.to_period_id, fp.name AS from_name, tp.name AS to_name,
                fp.end_date AS from_end, ca.week, ca.amount, ca.created_at
           FROM credit_applications ca
           JOIN periods fp ON fp.id = ca.from_period_id
           JOIN periods tp ON tp.id = ca.to_period_id
          WHERE ca.member_id = ? AND (ca.from_period_id = ? OR ca.to_period_id = ?)
          ORDER BY ca.rowid`,
        [memberId, periodId, periodId],
      );
      const skippedByPeriod = new Map<string, Set<number>>();
      for (const id of new Set(applicationRows.map((r) => r.to_period_id))) {
        skippedByPeriod.set(id, new Set(await loadSkippedWeekNumbers(db, id)));
      }
      const applications: HistoryApplicationInput[] = applicationRows.map((r) => ({
        kind: r.kind,
        fromPeriodId: r.from_period_id,
        toPeriodId: r.to_period_id,
        fromPeriodName: r.from_name,
        toPeriodName: r.to_name,
        week: r.week,
        amount: r.amount,
        date: r.kind === 'settle_debt' && r.from_end ? r.from_end : r.created_at.slice(0, 10),
        skipped: skippedByPeriod.get(r.to_period_id)?.has(r.week) === true,
      }));

      const skippedWeekSet = new Set(weekList.filter((w) => w.skipped).map((w) => w.number));
      const offsetCredits = (
        await db.getAll<{ ledger_entry_id: string; week: number; amount: number }>(
          'SELECT ledger_entry_id, week, amount FROM offset_credits WHERE period_id = ? AND member_id = ? ORDER BY week, rowid',
          [period.id, memberId],
        )
      ).map((r): HistoryOffsetCredit => ({ ledgerEntryId: r.ledger_entry_id, week: r.week, amount: r.amount, skipped: skippedWeekSet.has(r.week) }));

      return buildMemberHistory({
        periodId,
        statuses,
        weeks: weekList.map((w) => ({ number: w.number, date: w.date, hostMemberId: w.hostMemberId, status: storedStatus(w), skipped: w.skipped })),
        payments: paymentList.map((p) => ({
          id: p.id,
          date: p.date,
          amount: p.amount,
          credit: p.credit,
          reversed: p.reversed,
          reversalReason: p.reversalReason,
          createdAt: p.createdAt,
          settled: allocations
            .filter((a) => a.paymentId === p.id)
            .map((a) => ({ week: a.week, amount: a.amount, skipped: a.skipped === true })),
        })),
        entries,
        applications,
        offsetCredits,
      });
    },
  };
}

export type ReportsRepo = ReturnType<typeof createReportsRepo>;
