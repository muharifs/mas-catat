// Read-only queries for the CSV export (M7). It writes nothing and does no money arithmetic of its own: sums come
// from the existing repositories and the pure functions in src/domain/report.ts. Rows hold raw values (enums, ids
// turned into names); the Indonesian labels are added in src/ui/csvFiles.ts.
import type { MeetingSummary, PeriodSummary } from '@/domain/report';
import type { Account, LedgerEntryType } from '@/domain/types';
import type { Db } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { createPaymentsRepo } from './payments';
import { createPeriodsRepo, type Period } from './periods';
import { createReportsRepo } from './reports';

export interface LedgerExportRow {
  date: string;
  type: LedgerEntryType;
  account: Account | null;
  toAccount: Account | null;
  memberName: string | null;
  periodName: string;
  week: number | null;
  direction: 'in' | 'out';
  amount: number;
  note: string;
  /** 'reversal' = this row is a correction entry; 'corrected' = a reversal cancelled this row; else 'in_force'. */
  status: 'in_force' | 'corrected' | 'reversal';
  /** The reason typed with the correction: on the reversal row, and on the row it cancelled. */
  correctionReason: string | null;
}

export interface PaymentExportRow {
  date: string;
  memberName: string;
  periodName: string;
  amount: number;
  /** Meetings the payment paid (ascending); empty for a corrected payment. */
  weeks: number[];
  /** Part of the payment beyond the dues (titipan); 0 for a corrected payment. */
  credit: number;
  corrected: boolean;
  correctionReason: string | null;
}

export interface MeetingDueExportRow {
  periodName: string;
  week: number;
  date: string;
  hostName: string | null;
  /** 'skipped' = the meeting is skipped (decision 33): nothing is due, due 0 on every row. */
  meetingStatus: 'open' | 'closed' | 'skipped';
  memberName: string;
  due: number;
  paid: number;
  offset: number;
  credited: number;
  outstanding: number;
}

export interface PeriodExportRow {
  period: Period;
  summary: PeriodSummary;
}

interface LedgerSqlRow {
  date: string;
  type: LedgerEntryType;
  account: Account | null;
  to_account: Account | null;
  member_name: string | null;
  period_name: string;
  week: number | null;
  direction: 'in' | 'out';
  amount: number;
  note: string;
  reverses_entry_id: string | null;
  correction_reason: string | null;
  reversed_reason: string | null;
  reversed_by_id: string | null;
}

export function createExportsRepo(db: Db, deps: RepoDeps = defaultDeps) {
  const periods = createPeriodsRepo(db, deps);
  const payments = createPaymentsRepo(db, deps);
  const reports = createReportsRepo(db, deps);

  async function memberNames(): Promise<Map<string, string>> {
    const rows = await db.getAll<{ id: string; name: string }>('SELECT id, name FROM members');
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Oldest period first, so the files read in the order things happened. */
  async function periodsOldestFirst(): Promise<Period[]> {
    return [...(await periods.list())].reverse();
  }

  return {
    /** Every ledger row in the order it was written, corrections and reversals included. */
    async listLedger(): Promise<LedgerExportRow[]> {
      const rows = await db.getAll<LedgerSqlRow>(
        `SELECT e.date, e.type, e.account, e.to_account, m.name AS member_name, p.name AS period_name, e.week,
                e.direction, e.amount, e.note, e.reverses_entry_id, e.correction_reason,
                r.correction_reason AS reversed_reason, r.id AS reversed_by_id
           FROM ledger_entries e
           JOIN periods p ON p.id = e.period_id
           LEFT JOIN members m ON m.id = e.member_id
           LEFT JOIN ledger_entries r ON r.reverses_entry_id = e.id
          ORDER BY e.rowid`,
      );
      return rows.map((r) => ({
        date: r.date,
        type: r.type,
        account: r.account,
        toAccount: r.to_account,
        memberName: r.member_name,
        periodName: r.period_name,
        week: r.week,
        direction: r.direction,
        amount: r.amount,
        note: r.note,
        status: r.reverses_entry_id !== null ? 'reversal' : r.reversed_by_id !== null ? 'corrected' : 'in_force',
        correctionReason: r.reverses_entry_id !== null ? r.correction_reason : r.reversed_reason,
      }));
    },

    /** Every payment (corrected ones too, marked), by period then date. */
    async listPayments(): Promise<PaymentExportRow[]> {
      const names = await memberNames();
      const result: PaymentExportRow[] = [];
      for (const period of await periodsOldestFirst()) {
        const members = await periods.getMembers(period.id);
        const rows: PaymentExportRow[] = [];
        for (const m of members) {
          const allocations = await payments.listAllocations(period.id, m.memberId);
          for (const p of await payments.listWithCredit(period.id, m.memberId)) {
            rows.push({
              date: p.date,
              memberName: names.get(m.memberId) ?? '',
              periodName: period.name,
              amount: p.amount,
              weeks: p.reversed
                ? []
                : allocations.filter((a) => a.paymentId === p.id && a.skipped !== true).map((a) => a.week).sort((a, b) => a - b),
              credit: p.credit,
              corrected: p.reversed,
              correctionReason: p.reversalReason,
            });
          }
        }
        rows.sort((a, b) => a.date.localeCompare(b.date) || a.memberName.localeCompare(b.memberName));
        result.push(...rows);
      }
      return result;
    },

    /** One row per member per meeting, from the same per-meeting summaries the report screens use. */
    async listMeetingDues(): Promise<MeetingDueExportRow[]> {
      const names = await memberNames();
      const result: MeetingDueExportRow[] = [];
      for (const period of await periodsOldestFirst()) {
        const report = await reports.getPeriodReport(period.id);
        for (const meeting of report.meetings as MeetingSummary[]) {
          const rows = [...meeting.members].sort((a, b) => (names.get(a.memberId) ?? '').localeCompare(names.get(b.memberId) ?? ''));
          for (const row of rows) {
            result.push({
              periodName: period.name,
              week: meeting.week,
              date: meeting.date,
              hostName: meeting.hostMemberId === null ? null : (names.get(meeting.hostMemberId) ?? ''),
              meetingStatus: meeting.skipped ? 'skipped' : meeting.status,
              memberName: names.get(row.memberId) ?? '',
              due: row.status.due,
              paid: row.status.paid,
              offset: row.status.offset,
              credited: row.status.credited,
              outstanding: row.status.outstanding,
            });
          }
        }
      }
      return result;
    },

    /** One row per period with its totals. */
    async listPeriodSummaries(): Promise<PeriodExportRow[]> {
      const result: PeriodExportRow[] = [];
      for (const period of await periodsOldestFirst()) {
        result.push({ period, summary: (await reports.getPeriodReport(period.id)).summary });
      }
      return result;
    },
  };
}

export type ExportsRepo = ReturnType<typeof createExportsRepo>;
