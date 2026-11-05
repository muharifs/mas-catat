// Reports (M6). Pure functions, integer rupiah only. The repository (src/db/reports.ts) loads rows and passes them
// in; every report number is computed here, and the screens only display it.
//
// Corrected entries: an entry that has a reversal stays visible in histories (marked reversed, with the reason) and is
// EXCLUDED from every total. The reversal entries themselves are never listed as events.
import { entryEffects, type KasBalances } from './kas';
import { weekState, type WeekState } from './payment-preview';
import { hostPayoutAmount, kasIncrease, weeklyTotalCollected } from './dues';
import { assertRupiah, DomainError } from './money';
import type { Account, IsoDate, LedgerEntryType, Rupiah, WeekCredit, WeekStatus } from './types';

function sum(values: readonly Rupiah[], label: string): Rupiah {
  let total = 0;
  for (const v of values) {
    assertRupiah(v, label);
    total += v;
  }
  return total;
}

// ---------------------------------------------------------------------------------------------------------------
// Expected kas
// ---------------------------------------------------------------------------------------------------------------

export interface ExpectedKasInput {
  /** From computeKasBalances: the same numbers as the Kas screen. */
  balances: KasBalances;
  /** Arrears through the current meeting of the active period (what Home shows). Written-off debt is NOT in here. */
  outstandingDues: Rupiah;
  /** (a) Credit still held per source period and member (loadAvailableCredit), each amount above 0. */
  availableCredits: readonly Rupiah[];
  /** (b) Carry-over applications that cover a meeting of the new period which is still open. */
  carriedOverOpen: readonly Rupiah[];
  /** Info only: dues already paid for meetings after the current one, per member. Not in the formula. */
  prepaidDues: readonly Rupiah[];
  /** Info only: host payouts of closed meetings not paid yet (gross payout per meeting). Not in the formula. */
  unpaidPayouts: readonly Rupiah[];
}

export interface ExpectedKas {
  actualKas: Rupiah;
  outstandingDues: Rupiah;
  /** (a) Titipan not used yet. */
  creditAvailable: Rupiah;
  /** (b) Titipan carried into meetings that are still open (leaves the line when that meeting is closed). */
  creditCarriedOpen: Rupiah;
  /** "Titipan anggota" = (a) + (b). */
  creditHeld: Rupiah;
  /** actual + outstanding dues - credit held. May be below actual (and even negative if data is odd). */
  expected: Rupiah;
  /** Info rows outside the formula. */
  prepaidDues: Rupiah;
  unpaidPayoutAmount: Rupiah;
  unpaidPayoutCount: number;
}

/** Expected kas = actual kas (Tunai + Debit) + outstanding dues - member credit held, with its breakdown. */
export function computeExpectedKas(input: ExpectedKasInput): ExpectedKas {
  assertRupiah(input.outstandingDues, 'outstandingDues');
  const creditAvailable = sum(input.availableCredits, 'available credit');
  const creditCarriedOpen = sum(input.carriedOverOpen, 'carried-over credit');
  const creditHeld = creditAvailable + creditCarriedOpen;
  return {
    actualKas: input.balances.actual,
    outstandingDues: input.outstandingDues,
    creditAvailable,
    creditCarriedOpen,
    creditHeld,
    expected: input.balances.actual + input.outstandingDues - creditHeld,
    prepaidDues: sum(input.prepaidDues, 'prepaid dues'),
    unpaidPayoutAmount: sum(input.unpaidPayouts, 'unpaid payout'),
    unpaidPayoutCount: input.unpaidPayouts.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Per-meeting summary
// ---------------------------------------------------------------------------------------------------------------

export interface MeetingSummaryInput {
  memberCount: number;
  week: number;
  date: IsoDate;
  hostMemberId: string | null;
  status: 'open' | 'closed';
  /** Every member's status for THIS week (exactly N rows). */
  members: readonly { memberId: string; status: WeekStatus }[];
  /** Host payout in force for this week (amount), or null when not paid out (or corrected). */
  payout: Rupiah | null;
  /** Host offset in force for this week (amount); 0 when the host had no debt. */
  offset: Rupiah;
}

export interface MeetingMemberRow {
  memberId: string;
  status: WeekStatus;
  state: WeekState;
}

export interface MeetingSummary {
  week: number;
  date: IsoDate;
  hostMemberId: string | null;
  status: 'open' | 'closed';
  /** 15.000 x N. */
  totalDues: Rupiah;
  coveredByPayments: Rupiah;
  coveredByOffset: Rupiah;
  coveredByTitipan: Rupiah;
  unpaid: Rupiah;
  /** Every member's due of this meeting is covered (unpaid = 0). */
  fullyCovered: boolean;
  /** 10.000 x N, what the host receives. */
  hostPayoutDue: Rupiah;
  /** Payout actually recorded, or null when still unpaid. */
  hostPayout: Rupiah | null;
  /** Offset recorded against the host's debt (0 if none). */
  hostOffset: Rupiah;
  /** 5.000 x N once the meeting is fully covered, else null (not realised yet). */
  kasContribution: Rupiah | null;
  members: MeetingMemberRow[];
}

/**
 * One meeting seen from the dues side. Covered = paid by payments + host offsets + titipan (member credit); the
 * invariant total = covered + unpaid holds because every member's status already satisfies due = paid + offset +
 * credited + outstanding. Throws when the number of member rows is not N.
 */
export function summarizeMeeting(input: MeetingSummaryInput): MeetingSummary {
  if (input.members.length !== input.memberCount) {
    throw new DomainError(`meeting ${input.week} needs ${input.memberCount} member rows, got ${input.members.length}`);
  }
  const totalDues = weeklyTotalCollected(input.memberCount);
  let coveredByPayments = 0;
  let coveredByOffset = 0;
  let coveredByTitipan = 0;
  let unpaid = 0;
  for (const m of input.members) {
    coveredByPayments += m.status.paid;
    coveredByOffset += m.status.offset;
    coveredByTitipan += m.status.credited;
    unpaid += m.status.outstanding;
  }
  if (coveredByPayments + coveredByOffset + coveredByTitipan + unpaid !== totalDues) {
    throw new DomainError(`meeting ${input.week} dues do not add up to ${totalDues}; data is inconsistent`);
  }
  const fullyCovered = unpaid === 0;
  return {
    week: input.week,
    date: input.date,
    hostMemberId: input.hostMemberId,
    status: input.status,
    totalDues,
    coveredByPayments,
    coveredByOffset,
    coveredByTitipan,
    unpaid,
    fullyCovered,
    hostPayoutDue: hostPayoutAmount(input.memberCount),
    hostPayout: input.payout,
    hostOffset: input.offset,
    kasContribution: fullyCovered ? kasIncrease(input.memberCount) : null,
    members: input.members.map((m) => ({ memberId: m.memberId, status: m.status, state: weekState(m.status) })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Per-member history within a period
// ---------------------------------------------------------------------------------------------------------------

export type HistoryEventKind =
  | 'payment'
  | 'host_payout'
  | 'host_offset'
  | 'titipan_carry_in' // credit of an earlier period settles meetings of THIS period
  | 'titipan_carry_out' // credit of THIS period settles meetings of a later period
  | 'titipan_settle' // credit settled the member's own arrears at close
  | 'writeoff'
  | 'refund';

export interface HistoryPaymentInput {
  id: string;
  date: IsoDate;
  amount: Rupiah;
  /** Part beyond the dues (0 for a corrected payment). */
  credit: Rupiah;
  reversed: boolean;
  reversalReason: string | null;
  /** Meetings this payment settled (stored allocations). */
  settled: readonly WeekCredit[];
}

/** A stored ledger entry of the member, as the repository loads it (reversal entries included). */
export interface HistoryEntryInput {
  id: string;
  periodId: string;
  type: LedgerEntryType;
  direction: 'in' | 'out';
  date: IsoDate;
  amount: Rupiah;
  week: number | null;
  account: Account | null;
  reversesEntryId: string | null;
  correctionReason: string | null;
}

export interface HistoryApplicationInput {
  kind: 'settle_debt' | 'carry_over';
  fromPeriodId: string;
  toPeriodId: string;
  fromPeriodName: string;
  toPeriodName: string;
  week: number;
  amount: Rupiah;
  /** Day the application belongs to (carry-over: when the new period was made; settle: the end date). */
  date: IsoDate;
}

export interface HistoryOffsetCredit {
  ledgerEntryId: string;
  week: number;
  amount: Rupiah;
}

export interface MemberHistoryInput {
  periodId: string;
  /** Per-week status of the member, weeks 1..N. */
  statuses: readonly WeekStatus[];
  weeks: readonly { number: number; date: IsoDate; hostMemberId: string | null; status: 'open' | 'closed' }[];
  payments: readonly HistoryPaymentInput[];
  /** Ledger entries of this member over ALL periods (events use this period only; loans use every period). */
  entries: readonly HistoryEntryInput[];
  applications: readonly HistoryApplicationInput[];
  offsetCredits: readonly HistoryOffsetCredit[];
}

export interface HistoryEvent {
  kind: HistoryEventKind;
  date: IsoDate;
  amount: Rupiah;
  reversed: boolean;
  reversalReason: string | null;
  /** Meetings settled by this event (payment allocations, offset credits, titipan applications). */
  settled: WeekCredit[];
  /** Payment only: part that became titipan. */
  credit: Rupiah;
  /** Meeting number for a host payout or offset. */
  week: number | null;
  /** Carry events: the other period. */
  otherPeriodName: string | null;
  account: Account | null;
}

export interface HistoryLoan {
  kind: 'loan' | 'loan_repayment';
  date: IsoDate;
  amount: Rupiah;
  reversed: boolean;
  reversalReason: string | null;
  account: Account | null;
}

export interface MemberHistory {
  weeks: { week: number; date: IsoDate; hostMemberId: string | null; meetingStatus: 'open' | 'closed'; status: WeekStatus; state: WeekState }[];
  /** Oldest first; same-day events keep a fixed order (see EVENT_RANK). */
  events: HistoryEvent[];
  loans: HistoryLoan[];
  totals: {
    /** Cash paid by the member in this period (corrected payments excluded). */
    paid: Rupiah;
    offset: Rupiah;
    titipanUsed: Rupiah;
    outstanding: Rupiah;
    /** Loans minus repayments (corrected ones excluded), over all periods. */
    piutang: Rupiah;
  };
}

/** Order of events that share a date. Payments first, then what they led to. */
const EVENT_RANK: Record<HistoryEventKind, number> = {
  payment: 0,
  titipan_carry_in: 1,
  host_payout: 2,
  host_offset: 3,
  titipan_settle: 4,
  titipan_carry_out: 5,
  writeoff: 6,
  refund: 7,
};

const EVENT_TYPES: Partial<Record<LedgerEntryType, HistoryEventKind>> = {
  host_payout: 'host_payout',
  host_offset: 'host_offset',
  debt_writeoff: 'writeoff',
  credit_refund: 'refund',
};

/**
 * Everything that happened to one member in one period, in date order, with corrected items kept (marked) but left
 * out of the totals. Pure: the repository only supplies rows.
 */
export function buildMemberHistory(input: MemberHistoryInput): MemberHistory {
  const reasonByOriginal = new Map<string, string | null>();
  for (const e of input.entries) {
    if (e.type === 'reversal' && e.reversesEntryId) reasonByOriginal.set(e.reversesEntryId, e.correctionReason);
  }
  const isReversed = (id: string) => reasonByOriginal.has(id);

  const events: HistoryEvent[] = [];

  for (const p of input.payments) {
    events.push({
      kind: 'payment',
      date: p.date,
      amount: p.amount,
      reversed: p.reversed,
      reversalReason: p.reversalReason,
      settled: p.settled.map((s) => ({ ...s })),
      credit: p.reversed ? 0 : p.credit,
      week: null,
      otherPeriodName: null,
      account: null,
    });
  }

  for (const e of input.entries) {
    if (e.periodId !== input.periodId) continue;
    const kind = EVENT_TYPES[e.type];
    if (!kind) continue;
    events.push({
      kind,
      date: e.date,
      amount: e.amount,
      reversed: isReversed(e.id),
      reversalReason: reasonByOriginal.get(e.id) ?? null,
      settled: e.type === 'host_offset' ? input.offsetCredits.filter((c) => c.ledgerEntryId === e.id).map((c) => ({ week: c.week, amount: c.amount })) : [],
      credit: 0,
      week: e.week,
      otherPeriodName: null,
      account: e.account,
    });
  }

  // Titipan applications of the same kind and the same two periods are ONE event listing the meetings it settled.
  const groups = new Map<string, HistoryEvent>();
  for (const a of input.applications) {
    let kind: HistoryEventKind;
    let other: string | null = null;
    if (a.kind === 'settle_debt') {
      kind = 'titipan_settle';
    } else if (a.toPeriodId === input.periodId) {
      kind = 'titipan_carry_in';
      other = a.fromPeriodName;
    } else {
      kind = 'titipan_carry_out';
      other = a.toPeriodName;
    }
    if (a.toPeriodId !== input.periodId && a.fromPeriodId !== input.periodId) continue;
    const key = `${kind}|${a.fromPeriodId}|${a.toPeriodId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.amount += a.amount;
      existing.settled.push({ week: a.week, amount: a.amount });
    } else {
      groups.set(key, {
        kind,
        date: a.date,
        amount: a.amount,
        reversed: false,
        reversalReason: null,
        settled: [{ week: a.week, amount: a.amount }],
        credit: 0,
        week: null,
        otherPeriodName: other,
        account: null,
      });
    }
  }
  events.push(...groups.values());

  // Stable sort: date, then fixed rank; equal items keep their input order.
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((x, y) => {
      if (x.event.date !== y.event.date) return x.event.date < y.event.date ? -1 : 1;
      const rank = EVENT_RANK[x.event.kind] - EVENT_RANK[y.event.kind];
      return rank !== 0 ? rank : x.index - y.index;
    })
    .map((o) => o.event);

  const loans: HistoryLoan[] = [];
  for (const e of input.entries) {
    if (e.type !== 'loan' && e.type !== 'loan_repayment') continue;
    loans.push({
      kind: e.type,
      date: e.date,
      amount: e.amount,
      reversed: isReversed(e.id),
      reversalReason: reasonByOriginal.get(e.id) ?? null,
      account: e.account,
    });
  }
  loans.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  const dateOf = new Map(input.weeks.map((w) => [w.number, w]));
  const weeks = input.statuses.map((s) => {
    const w = dateOf.get(s.week);
    return {
      week: s.week,
      date: w?.date ?? '',
      hostMemberId: w?.hostMemberId ?? null,
      meetingStatus: w?.status ?? ('open' as const),
      status: s,
      state: weekState(s),
    };
  });

  const inForce = <T extends { reversed: boolean }>(items: readonly T[]) => items.filter((i) => !i.reversed);
  let piutang = 0;
  for (const l of inForce(loans)) piutang += l.kind === 'loan' ? l.amount : -l.amount;

  return {
    weeks,
    events: ordered,
    loans,
    totals: {
      paid: sum(inForce(ordered.filter((e) => e.kind === 'payment')).map((e) => e.amount), 'payment'),
      offset: input.statuses.reduce((t, s) => t + s.offset, 0),
      titipanUsed: input.statuses.reduce((t, s) => t + s.credited, 0),
      outstanding: input.statuses.reduce((t, s) => t + s.outstanding, 0),
      piutang,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Period summary
// ---------------------------------------------------------------------------------------------------------------

export interface PeriodSummaryEntry {
  id: string;
  type: LedgerEntryType;
  direction: 'in' | 'out';
  amount: Rupiah;
  account: Account | null;
  toAccount: Account | null;
  reversesEntryId: string | null;
}

export interface PeriodSummary {
  /** 15.000 x N dues per meeting, N meetings. */
  totalDues: Rupiah;
  /** Cash received from members (payments in force, titipan part included). */
  collected: Rupiah;
  payouts: Rupiah;
  offsets: Rupiah;
  writeoffs: Rupiah;
  /** Shared-goal spending (for example a tour). */
  sharedGoal: Rupiah;
  /** Titipan paid back to members. */
  creditRefunds: Rupiah;
  /**
   * Net change of actual kas (Tunai + Debit) caused by the entries of this period that are in force. Opening balances
   * are not activity and are left out; transfers net to zero; loans and repayments move money to or from Piutang.
   * Write-offs do not touch a pos, so they are listed above but never change this number.
   */
  netKasChange: Rupiah;
}

/** Totals of one period from its ledger entries. Corrected entries and the reversal entries are both left out. */
export function summarizePeriod(input: { memberCount: number; entries: readonly PeriodSummaryEntry[] }): PeriodSummary {
  const reversedIds = new Set<string>();
  for (const e of input.entries) if (e.type === 'reversal' && e.reversesEntryId) reversedIds.add(e.reversesEntryId);
  const inForce = input.entries.filter((e) => e.type !== 'reversal' && !reversedIds.has(e.id));

  const total = (type: LedgerEntryType) => inForce.filter((e) => e.type === type).reduce((t, e) => t + e.amount, 0);
  let netKasChange = 0;
  for (const e of inForce) {
    if (e.type === 'opening_balance') continue;
    const effects = entryEffects(e);
    netKasChange += effects.tunai + effects.debit;
  }
  return {
    totalDues: weeklyTotalCollected(input.memberCount) * input.memberCount,
    collected: total('member_payment'),
    payouts: total('host_payout'),
    offsets: total('host_offset'),
    writeoffs: total('debt_writeoff'),
    sharedGoal: total('shared_goal'),
    creditRefunds: total('credit_refund'),
    netKasChange,
  };
}

/** The period the report screens open first: the active one, else the latest by start date (a tie keeps the first in the list). */
export function defaultReportPeriod<T extends { status: 'active' | 'closed'; startDate: IsoDate }>(periods: readonly T[]): T | null {
  const active = periods.find((p) => p.status === 'active');
  if (active) return active;
  let latest: T | null = null;
  for (const p of periods) if (latest === null || p.startDate > latest.startDate) latest = p;
  return latest;
}
