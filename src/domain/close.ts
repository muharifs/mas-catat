// Period close and member credit. Pure functions, integer rupiah only.
//
// Credit is money a member paid beyond the dues of a period (payments minus allocations). Its life:
//  1. At period close it first settles the member's OWN arrears of that period, oldest week first (partial allowed).
//  2. Whatever arrears remain are written off, one entry per member (absorbed by kas).
//  3. Leftover credit is carried over into the member's next period (weeks 1..N, oldest first) or refunded.
// Applications are stored per week and never recomputed; they write no ledger entry (the money entered Tunai/Debit
// when it was received). Only a refund is a ledger entry (credit_refund).
import { applyEntry, negativeAfter, type KasBalances } from './kas';
import { assertIsoDate, assertPositiveInt, assertRupiah, DomainError, WEEKLY_DUE } from './money';
import { isRealDate } from './schedule';
import type { Account, IsoDate, LedgerEntry, Rupiah, WeekCredit, WeekStatus } from './types';

export interface CreditParts {
  received: Rupiah;
  /** Allocations to meetings that are NOT skipped (an allocation to a skipped meeting is released to credit). */
  allocated: Rupiah;
  /** Applications out of this period's credit to meetings that are NOT skipped. */
  applied: Rupiah;
  refunded: Rupiah;
  /**
   * Host offsets of this period (no reversal) that settle a skipped meeting: nothing is owed there, so the amount
   * becomes credit of the host. 0 when absent.
   */
  releasedOffset?: Rupiah;
}

/** received - allocated - applied - refunded + released offset, WITHOUT the non-negative check (undo uses it). */
export function creditBalance(parts: CreditParts): Rupiah {
  assertRupiah(parts.received, 'received');
  assertRupiah(parts.allocated, 'allocated');
  assertRupiah(parts.applied, 'applied');
  assertRupiah(parts.refunded, 'refunded');
  const released = parts.releasedOffset ?? 0;
  assertRupiah(released, 'releasedOffset');
  return parts.received - parts.allocated - parts.applied - parts.refunded + released;
}

/** Credit still held for one member from ONE source period: received - allocated - already applied - refunded + released offset. */
export function availableCredit(parts: CreditParts): Rupiah {
  const credit = creditBalance(parts);
  if (credit < 0) throw new DomainError(`member credit would be negative (${credit}); data is inconsistent`);
  return credit;
}

export interface CreditSettlement {
  /** Credit applied to the member's own weeks, oldest week first. */
  applications: WeekCredit[];
  /** Total applied. */
  settled: Rupiah;
  /** Credit not used. */
  creditLeft: Rupiah;
}

/** Credit settles the member's own arrears, oldest week first. The last week touched may be settled partially. */
export function planCreditSettlement(params: { statuses: readonly WeekStatus[]; credit: Rupiah }): CreditSettlement {
  assertRupiah(params.credit, 'credit');
  const applications: WeekCredit[] = [];
  let left = params.credit;
  for (const s of [...params.statuses].sort((a, b) => a.week - b.week)) {
    if (left <= 0) break;
    if (s.outstanding <= 0) continue;
    const applied = Math.min(s.outstanding, left); // integer min, no rounding
    applications.push({ week: s.week, amount: applied });
    left -= applied;
  }
  return { applications, settled: params.credit - left, creditLeft: left };
}

/** Statuses after the credit applications: credited goes up and outstanding down, so the invariant holds. */
export function applyCredited(statuses: readonly WeekStatus[], applications: readonly WeekCredit[]): WeekStatus[] {
  const byWeek = new Map<number, number>();
  for (const a of applications) byWeek.set(a.week, (byWeek.get(a.week) ?? 0) + a.amount);
  return statuses.map((s) => {
    const extra = byWeek.get(s.week) ?? 0;
    if (extra > s.outstanding) throw new DomainError(`credit for week ${s.week} exceeds what is outstanding`);
    return { ...s, credited: s.credited + extra, outstanding: s.outstanding - extra };
  });
}

export interface DebtWriteoff {
  memberId: string;
  amount: Rupiah;
}

/** One write-off per member that still has arrears (call with statuses AFTER the credit was applied). */
export function planDebtWriteoffs(members: readonly { memberId: string; statuses: readonly WeekStatus[] }[]): DebtWriteoff[] {
  const result: DebtWriteoff[] = [];
  for (const m of members) {
    const amount = m.statuses.reduce((sum, s) => sum + s.outstanding, 0);
    if (amount > 0) result.push({ memberId: m.memberId, amount });
  }
  return result;
}

export interface CarryOverApplication {
  fromPeriodId: string;
  week: number;
  amount: Rupiah;
}

export interface CarryOverPlan {
  applications: CarryOverApplication[];
  /** Total applied to the new period. */
  applied: Rupiah;
  /** Credit that did not fit in the new period's dues, per source period (only those with something left). */
  remaining: { fromPeriodId: string; amount: Rupiah }[];
  /** Sum of `remaining`. */
  creditLeft: Rupiah;
}

/**
 * Carries a member's unused credit into a NEW period (every week still owes the full weekly due).
 * Sources are used oldest first, each one fills weeks 1..N oldest first; the last week touched may be partial.
 * Credit above the period's dues stays available (nothing is lost).
 */
export function planCarryOver(params: {
  weekCount: number;
  sources: readonly { fromPeriodId: string; available: Rupiah }[];
}): CarryOverPlan {
  assertPositiveInt(params.weekCount, 'weekCount');
  const room = new Array<number>(params.weekCount).fill(WEEKLY_DUE);
  const applications: CarryOverApplication[] = [];
  const remaining: { fromPeriodId: string; amount: Rupiah }[] = [];
  let applied = 0;
  let cursor = 0;
  for (const source of params.sources) {
    assertRupiah(source.available, 'available credit');
    let left = source.available;
    while (left > 0 && cursor < params.weekCount) {
      const open = room[cursor] ?? 0;
      if (open <= 0) {
        cursor += 1;
        continue;
      }
      const amount = Math.min(open, left);
      room[cursor] = open - amount;
      applications.push({ fromPeriodId: source.fromPeriodId, week: cursor + 1, amount });
      applied += amount;
      left -= amount;
    }
    if (left > 0) remaining.push({ fromPeriodId: source.fromPeriodId, amount: left });
  }
  return { applications, applied, remaining, creditLeft: remaining.reduce((sum, r) => sum + r.amount, 0) };
}

export interface CloseWeekInfo {
  number: number;
  /** Stored status. A skipped meeting is still 'open' here (it is closed together with its period). */
  status: 'open' | 'closed';
  /** The meeting is skipped: it neither blocks closing nor needs a host payout, and owes nothing. */
  skipped?: boolean;
  /** True when the week has a host payout in force (a corrected payout does not count). */
  hasActivePayout: boolean;
}

export interface CloseMemberInput {
  memberId: string;
  statuses: readonly WeekStatus[];
  /** Credit this member holds from THIS period. */
  credit: Rupiah;
}

export interface MemberClosePlan {
  memberId: string;
  /** Arrears of the closed weeks before credit netting. */
  arrearsBefore: Rupiah;
  credit: Rupiah;
  /** Credit used on the member's own arrears (no ledger entry). */
  settledByCredit: Rupiah;
  settlements: WeekCredit[];
  /** Written off (one ledger entry); 0 when nothing remains. */
  writeoff: Rupiah;
  /** Credit still held after settling; carried over or refunded later. */
  creditLeft: Rupiah;
}

export interface PeriodClosePreview {
  /** Meetings that are still open (a skipped meeting is not): they block closing. */
  openWeeks: number[];
  /** Skipped meetings: closed together with the period, no dues, no payout. */
  skippedWeeks: number[];
  /** Closed meetings whose host payout is missing or was corrected: they block closing. */
  unpaidHostWeeks: number[];
  canClose: boolean;
  members: MemberClosePlan[];
  membersInArrears: number;
  /** Total arrears BEFORE credit netting. */
  totalArrears: Rupiah;
  /** Total credit used on arrears. */
  totalSettledByCredit: Rupiah;
  /** Total written off = the loss absorbed by kas (AFTER credit netting). */
  totalWriteoff: Rupiah;
  membersWithCredit: number;
  totalCredit: Rupiah;
  /** Credit left after settling. */
  totalCreditLeft: Rupiah;
  writeoffs: DebtWriteoff[];
}

/**
 * Everything period close would do, without writing anything. The repository closes with this very plan, so what
 * the pre-close screen shows is what gets saved. Numbers cover the CLOSED meetings only (equal to all meetings
 * once closing is possible).
 */
export function previewPeriodClose(params: { weeks: readonly CloseWeekInfo[]; members: readonly CloseMemberInput[] }): PeriodClosePreview {
  const skippedWeeks = params.weeks.filter((w) => w.skipped === true).map((w) => w.number);
  const openWeeks = params.weeks.filter((w) => w.status === 'open' && w.skipped !== true).map((w) => w.number);
  const closedNumbers = new Set(params.weeks.filter((w) => w.status === 'closed').map((w) => w.number));
  const unpaidHostWeeks = params.weeks
    .filter((w) => w.status === 'closed' && w.skipped !== true && !w.hasActivePayout)
    .map((w) => w.number);

  const plans: MemberClosePlan[] = [];
  const afterNetting: { memberId: string; statuses: readonly WeekStatus[] }[] = [];
  for (const m of params.members) {
    const statuses = m.statuses.filter((s) => closedNumbers.has(s.week));
    const settlement = planCreditSettlement({ statuses, credit: m.credit });
    const after = applyCredited(statuses, settlement.applications);
    afterNetting.push({ memberId: m.memberId, statuses: after });
    plans.push({
      memberId: m.memberId,
      arrearsBefore: statuses.reduce((sum, s) => sum + s.outstanding, 0),
      credit: m.credit,
      settledByCredit: settlement.settled,
      settlements: settlement.applications,
      writeoff: after.reduce((sum, s) => sum + s.outstanding, 0),
      creditLeft: settlement.creditLeft,
    });
  }
  const writeoffs = planDebtWriteoffs(afterNetting);
  const sum = (pick: (p: MemberClosePlan) => Rupiah) => plans.reduce((total, p) => total + pick(p), 0);
  return {
    openWeeks,
    skippedWeeks,
    unpaidHostWeeks,
    canClose: openWeeks.length === 0 && unpaidHostWeeks.length === 0,
    members: plans,
    membersInArrears: plans.filter((p) => p.arrearsBefore > 0).length,
    totalArrears: sum((p) => p.arrearsBefore),
    totalSettledByCredit: sum((p) => p.settledByCredit),
    totalWriteoff: sum((p) => p.writeoff),
    membersWithCredit: plans.filter((p) => p.credit > 0).length,
    totalCredit: sum((p) => p.credit),
    totalCreditLeft: sum((p) => p.creditLeft),
    writeoffs,
  };
}

export type EndDateProblem = 'invalid' | 'before_start' | 'future';

/** Period end date: a real date, not before the start date and not in the future. null = fine. */
export function endDateProblem(endDate: string, startDate: IsoDate, today: IsoDate): EndDateProblem | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !isRealDate(endDate)) return 'invalid';
  if (endDate < startDate) return 'before_start';
  if (endDate > today) return 'future';
  return null;
}

export interface CreditRefundPreview {
  entry: LedgerEntry;
  before: KasBalances;
  after: KasBalances;
  /** Pos that would end below zero. A warning, never a block. */
  negativeAccounts: Account[];
}

/**
 * The ONE ledger entry that refunds ALL of a member's remaining credit of a source period. The amount is not
 * typed by the owner. Direction out, from Tunai or Debit.
 */
export function previewCreditRefund(params: {
  memberId: string;
  available: Rupiah;
  date: IsoDate;
  account: 'tunai' | 'debit';
  balances: KasBalances;
}): CreditRefundPreview {
  if (params.available <= 0) throw new DomainError('nothing to refund: the member holds no credit');
  if (params.account !== 'tunai' && params.account !== 'debit') throw new DomainError('refund account must be tunai or debit');
  assertIsoDate(params.date, 'refund date');
  assertPositiveInt(params.available, 'refund amount');
  const entry: LedgerEntry = {
    type: 'credit_refund',
    direction: 'out',
    date: params.date,
    amount: params.available,
    memberId: params.memberId,
    week: null,
    note: 'Member credit refund',
    account: params.account,
    toAccount: null,
  };
  const be = { direction: entry.direction, amount: entry.amount, account: params.account, toAccount: null };
  return { entry, before: params.balances, after: applyEntry(params.balances, be), negativeAccounts: negativeAfter(params.balances, be) };
}
