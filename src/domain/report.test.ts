import { computeKasBalances } from './kas';
import { DomainError } from './money';
import {
  buildMemberHistory,
  computeExpectedKas,
  defaultReportPeriod,
  summarizeMeeting,
  summarizePeriod,
  type ExpectedKasInput,
  type HistoryEntryInput,
  type PeriodSummaryEntry,
} from './report';
import type { WeekStatus } from './types';

const status = (week: number, p: Partial<WeekStatus> = {}): WeekStatus => {
  const paid = p.paid ?? 0;
  const offset = p.offset ?? 0;
  const credited = p.credited ?? 0;
  return { week, due: 15_000, paid, offset, credited, outstanding: p.outstanding ?? 15_000 - paid - offset - credited };
};

const balances = computeKasBalances([
  { direction: 'in', amount: 150_000, account: 'tunai' },
  { direction: 'in', amount: 50_000, account: 'debit' },
  { direction: 'in', amount: 99_000, account: 'piutang' },
]);

const base: ExpectedKasInput = {
  balances,
  outstandingDues: 0,
  availableCredits: [],
  carriedOverOpen: [],
  prepaidDues: [],
  unpaidPayouts: [],
};

describe('computeExpectedKas', () => {
  it('without credit: expected = actual + outstanding dues; Piutang is not in actual', () => {
    const r = computeExpectedKas({ ...base, outstandingDues: 45_000 });
    expect(r).toMatchObject({ actualKas: 200_000, outstandingDues: 45_000, creditHeld: 0, expected: 245_000 });
  });

  it('with available credit: credit held lowers expected kas', () => {
    const r = computeExpectedKas({ ...base, outstandingDues: 30_000, availableCredits: [15_000, 30_000] });
    expect(r.creditAvailable).toBe(45_000);
    expect(r.creditCarriedOpen).toBe(0);
    expect(r.creditHeld).toBe(45_000);
    expect(r.expected).toBe(200_000 + 30_000 - 45_000);
  });

  it('with carried-over credit on an open meeting: it counts as credit held; once the meeting closes it leaves the line', () => {
    const open = computeExpectedKas({ ...base, carriedOverOpen: [15_000, 5_000] });
    expect(open.creditCarriedOpen).toBe(20_000);
    expect(open.creditHeld).toBe(20_000);
    expect(open.expected).toBe(180_000);

    const closed = computeExpectedKas({ ...base, carriedOverOpen: [] });
    expect(closed.creditHeld).toBe(0);
    expect(closed.expected).toBe(200_000);
  });

  it('handles credit that is not a multiple of 15.000 (5.000)', () => {
    const r = computeExpectedKas({ ...base, availableCredits: [5_000], carriedOverOpen: [5_000] });
    expect(r.creditHeld).toBe(10_000);
    expect(r.expected).toBe(190_000);
  });

  it('fixed numbers: 200.000 actual + 45.000 arrears - (5.000 + 15.000 available + 15.000 carried) = 210.000', () => {
    const r = computeExpectedKas({
      ...base,
      outstandingDues: 45_000,
      availableCredits: [5_000, 15_000],
      carriedOverOpen: [15_000],
      prepaidDues: [30_000, 15_000],
      unpaidPayouts: [30_000, 30_000],
    });
    expect(r).toEqual({
      actualKas: 200_000,
      outstandingDues: 45_000,
      creditAvailable: 20_000,
      creditCarriedOpen: 15_000,
      creditHeld: 35_000,
      expected: 210_000,
      prepaidDues: 45_000,
      unpaidPayoutAmount: 60_000,
      unpaidPayoutCount: 2,
    });
  });

  it('info rows (prepaid, unpaid payout) do not change the expected number', () => {
    const plain = computeExpectedKas({ ...base, outstandingDues: 15_000 });
    const withInfo = computeExpectedKas({ ...base, outstandingDues: 15_000, prepaidDues: [45_000], unpaidPayouts: [30_000] });
    expect(withInfo.expected).toBe(plain.expected);
  });

  it('reports the same actual kas as computeKasBalances', () => {
    expect(computeExpectedKas(base).actualKas).toBe(balances.actual);
  });

  it('rejects negative or fractional amounts', () => {
    expect(() => computeExpectedKas({ ...base, availableCredits: [-1] })).toThrow(DomainError);
    expect(() => computeExpectedKas({ ...base, outstandingDues: 1.5 })).toThrow(DomainError);
  });
});

describe('summarizeMeeting', () => {
  const rows = (statuses: WeekStatus[]) => statuses.map((s, i) => ({ memberId: `m${i + 1}`, status: s }));
  const common = { memberCount: 3, week: 1, date: '2026-01-06', hostMemberId: 'm1', status: 'open' as const };

  it('fully paid: 45.000 covered, payout 30.000, kas contribution 15.000', () => {
    const s = summarizeMeeting({
      ...common,
      members: rows([status(1, { paid: 15_000 }), status(1, { paid: 15_000 }), status(1, { paid: 15_000 })]),
      payout: 30_000,
      offset: 0,
    });
    expect(s).toMatchObject({
      totalDues: 45_000,
      coveredByPayments: 45_000,
      coveredByOffset: 0,
      coveredByTitipan: 0,
      unpaid: 0,
      fullyCovered: true,
      hostPayoutDue: 30_000,
      hostPayout: 30_000,
      hostOffset: 0,
      kasContribution: 15_000,
    });
    expect(s.members.map((m) => m.state)).toEqual(['paid', 'paid', 'paid']);
  });

  it('partial: unpaid stays, no kas contribution yet, payout not paid', () => {
    const s = summarizeMeeting({
      ...common,
      members: rows([status(1, { paid: 15_000 }), status(1), status(1, { credited: 5_000 })]),
      payout: null,
      offset: 0,
    });
    expect(s.coveredByPayments).toBe(15_000);
    expect(s.coveredByTitipan).toBe(5_000);
    expect(s.unpaid).toBe(25_000);
    expect(s.totalDues).toBe(s.coveredByPayments + s.coveredByOffset + s.coveredByTitipan + s.unpaid);
    expect(s.fullyCovered).toBe(false);
    expect(s.kasContribution).toBeNull();
    expect(s.hostPayout).toBeNull();
    expect(s.members.map((m) => m.state)).toEqual(['paid', 'unpaid', 'partial_credited']);
  });

  it('host with offset: the host unpaid dues are covered by the offset, shown as payout and offset', () => {
    const s = summarizeMeeting({
      ...common,
      members: rows([status(1, { offset: 15_000 }), status(1, { paid: 15_000 }), status(1, { paid: 15_000 })]),
      payout: 30_000,
      offset: 15_000,
    });
    expect(s.coveredByOffset).toBe(15_000);
    expect(s.hostPayout).toBe(30_000);
    expect(s.hostOffset).toBe(15_000);
    expect(s.fullyCovered).toBe(true);
    expect(s.kasContribution).toBe(15_000);
    expect(s.members[0]?.state).toBe('offset');
  });

  it('throws when the member rows are not N or the numbers do not add up', () => {
    expect(() => summarizeMeeting({ ...common, members: rows([status(1)]), payout: null, offset: 0 })).toThrow(DomainError);
    expect(() =>
      summarizeMeeting({
        ...common,
        members: rows([status(1), status(1), { ...status(1), outstanding: 0 }]),
        payout: null,
        offset: 0,
      }),
    ).toThrow(DomainError);
  });
});

describe('buildMemberHistory', () => {
  const entry = (p: Partial<HistoryEntryInput> & Pick<HistoryEntryInput, 'id' | 'type'>): HistoryEntryInput => ({
    periodId: 'p1',
    direction: 'out',
    date: '2026-01-06',
    amount: 10_000,
    week: null,
    account: 'tunai',
    reversesEntryId: null,
    correctionReason: null,
    ...p,
  });
  const weeks = [
    { number: 1, date: '2026-01-06', hostMemberId: 'a', status: 'closed' as const },
    { number: 2, date: '2026-01-13', hostMemberId: 'b', status: 'open' as const },
  ];
  const empty = { periodId: 'p1', weeks, statuses: [status(1, { paid: 15_000 }), status(2)], payments: [], entries: [], applications: [], offsetCredits: [] };

  it('lists events by date, same-day events in a fixed order, with real payment dates and settled meetings', () => {
    const h = buildMemberHistory({
      ...empty,
      payments: [
        { id: 'pay2', date: '2026-01-13', amount: 15_000, credit: 0, reversed: false, reversalReason: null, settled: [{ week: 2, amount: 15_000 }] },
        { id: 'pay1', date: '2026-01-06', amount: 15_000, credit: 0, reversed: false, reversalReason: null, settled: [{ week: 1, amount: 15_000 }] },
      ],
      entries: [
        entry({ id: 'po', type: 'host_payout', date: '2026-01-13', amount: 30_000, week: 1 }),
        entry({ id: 'of', type: 'host_offset', direction: 'in', date: '2026-01-13', amount: 5_000, week: 1 }),
      ],
      offsetCredits: [{ ledgerEntryId: 'of', week: 2, amount: 5_000 }],
    });
    expect(h.events.map((e) => `${e.date} ${e.kind}`)).toEqual([
      '2026-01-06 payment',
      '2026-01-13 payment',
      '2026-01-13 host_payout',
      '2026-01-13 host_offset',
    ]);
    expect(h.events[1]?.settled).toEqual([{ week: 2, amount: 15_000 }]);
    expect(h.events[3]?.settled).toEqual([{ week: 2, amount: 5_000 }]);
    expect(h.weeks.map((w) => w.state)).toEqual(['paid', 'unpaid']);
    expect(h.weeks[0]).toMatchObject({ week: 1, date: '2026-01-06', hostMemberId: 'a', meetingStatus: 'closed' });
  });

  it('keeps corrected entries visible with the reason and leaves them out of the totals', () => {
    const h = buildMemberHistory({
      ...empty,
      payments: [
        { id: 'bad', date: '2026-01-06', amount: 30_000, credit: 0, reversed: true, reversalReason: 'salah catat', settled: [{ week: 1, amount: 15_000 }] },
        { id: 'ok', date: '2026-01-07', amount: 15_000, credit: 0, reversed: false, reversalReason: null, settled: [{ week: 1, amount: 15_000 }] },
      ],
      entries: [
        entry({ id: 'l1', type: 'loan', amount: 100_000 }),
        entry({ id: 'l1r', type: 'reversal', direction: 'in', amount: 100_000, reversesEntryId: 'l1', correctionReason: 'salah orang' }),
        entry({ id: 'l2', type: 'loan', amount: 50_000, date: '2026-01-08' }),
        entry({ id: 'r1', type: 'loan_repayment', amount: 20_000, date: '2026-01-09' }),
        entry({ id: 'o1', type: 'host_offset', direction: 'in', amount: 15_000, week: 1 }),
        entry({ id: 'o1r', type: 'reversal', amount: 15_000, reversesEntryId: 'o1', correctionReason: 'bayar ulang' }),
      ],
    });
    expect(h.events.find((e) => e.kind === 'payment' && e.reversed)).toMatchObject({ amount: 30_000, reversalReason: 'salah catat', credit: 0 });
    expect(h.events.find((e) => e.kind === 'host_offset')).toMatchObject({ reversed: true, reversalReason: 'bayar ulang' });
    // reversal entries are never events
    expect(h.events.some((e) => e.amount === 100_000)).toBe(false);
    expect(h.totals.paid).toBe(15_000);
    expect(h.loans).toHaveLength(3);
    expect(h.loans[0]).toMatchObject({ kind: 'loan', reversed: true, reversalReason: 'salah orang' });
    expect(h.totals.piutang).toBe(30_000); // 50.000 loan - 20.000 repaid; the corrected loan is excluded
  });

  it('a member with no credit and nothing else has plain weeks and no events', () => {
    const h = buildMemberHistory({ ...empty, statuses: [status(1), status(2)] });
    expect(h.events).toEqual([]);
    expect(h.loans).toEqual([]);
    expect(h.totals).toEqual({ paid: 0, offset: 0, titipanUsed: 0, outstanding: 30_000, piutang: 0 });
  });

  it('shows titipan: a payment that became titipan, carry-in, carry-out and settle at close; write-off and refund', () => {
    const h = buildMemberHistory({
      ...empty,
      statuses: [status(1, { credited: 15_000 }), status(2, { credited: 5_000, outstanding: 10_000 })],
      payments: [{ id: 'x', date: '2026-01-06', amount: 30_000, credit: 15_000, reversed: false, reversalReason: null, settled: [{ week: 1, amount: 15_000 }] }],
      applications: [
        { kind: 'carry_over', fromPeriodId: 'p0', toPeriodId: 'p1', fromPeriodName: 'Lama', toPeriodName: 'Periode 1', week: 1, amount: 15_000, date: '2026-01-01' },
        { kind: 'carry_over', fromPeriodId: 'p0', toPeriodId: 'p1', fromPeriodName: 'Lama', toPeriodName: 'Periode 1', week: 2, amount: 5_000, date: '2026-01-01' },
        { kind: 'carry_over', fromPeriodId: 'p1', toPeriodId: 'p2', fromPeriodName: 'Periode 1', toPeriodName: 'Baru', week: 1, amount: 15_000, date: '2026-06-01' },
        { kind: 'settle_debt', fromPeriodId: 'p1', toPeriodId: 'p1', fromPeriodName: 'Periode 1', toPeriodName: 'Periode 1', week: 2, amount: 5_000, date: '2026-05-30' },
        { kind: 'carry_over', fromPeriodId: 'q', toPeriodId: 'q2', fromPeriodName: 'X', toPeriodName: 'Y', week: 1, amount: 1_000, date: '2026-02-01' },
      ],
      entries: [
        entry({ id: 'w', type: 'debt_writeoff', date: '2026-05-30', amount: 10_000, account: null }),
        entry({ id: 'f', type: 'credit_refund', date: '2026-06-02', amount: 15_000 }),
      ],
    });
    expect(h.events.map((e) => e.kind)).toEqual(['titipan_carry_in', 'payment', 'titipan_settle', 'writeoff', 'titipan_carry_out', 'refund']);
    const carryIn = h.events[0];
    expect(carryIn).toMatchObject({ amount: 20_000, otherPeriodName: 'Lama' });
    expect(carryIn?.settled).toEqual([
      { week: 1, amount: 15_000 },
      { week: 2, amount: 5_000 },
    ]);
    expect(h.events[1]?.credit).toBe(15_000);
    expect(h.events[4]).toMatchObject({ otherPeriodName: 'Baru', amount: 15_000 });
    expect(h.totals.titipanUsed).toBe(20_000);
  });

  it('only counts events of its own period', () => {
    const h = buildMemberHistory({ ...empty, entries: [entry({ id: 'e', type: 'host_payout', periodId: 'other' })] });
    expect(h.events).toEqual([]);
  });
});

describe('summarizePeriod', () => {
  const e = (p: Partial<PeriodSummaryEntry> & Pick<PeriodSummaryEntry, 'id' | 'type'>): PeriodSummaryEntry => ({
    direction: 'out',
    amount: 0,
    account: 'tunai',
    toAccount: null,
    reversesEntryId: null,
    ...p,
  });

  it('totals dues, payments, payouts, offsets, write-off, shared goal, refund and the net kas change', () => {
    const s = summarizePeriod({
      memberCount: 3,
      entries: [
        e({ id: '1', type: 'opening_balance', direction: 'in', amount: 100_000 }),
        e({ id: '2', type: 'member_payment', direction: 'in', amount: 90_000 }),
        e({ id: '3', type: 'member_payment', direction: 'in', amount: 30_000, account: 'debit' }),
        e({ id: '4', type: 'host_payout', amount: 90_000 }),
        e({ id: '5', type: 'host_offset', direction: 'in', amount: 15_000 }),
        e({ id: '6', type: 'debt_writeoff', amount: 20_000, account: null }),
        e({ id: '7', type: 'shared_goal', amount: 10_000, account: 'debit' }),
        e({ id: '8', type: 'credit_refund', amount: 5_000 }),
        e({ id: '9', type: 'transfer', amount: 40_000, account: 'tunai', toAccount: 'debit' }),
      ],
    });
    expect(s).toEqual({
      totalDues: 135_000,
      collected: 120_000,
      payouts: 90_000,
      offsets: 15_000,
      writeoffs: 20_000,
      sharedGoal: 10_000,
      creditRefunds: 5_000,
      // +120.000 payments - 90.000 payout + 15.000 offset - 10.000 goal - 5.000 refund = +30.000 (transfer nets 0,
      // opening balance and write-off excluded)
      netKasChange: 30_000,
    });
  });

  it('leaves corrected entries and their reversals out', () => {
    const s = summarizePeriod({
      memberCount: 2,
      entries: [
        e({ id: 'g', type: 'shared_goal', amount: 50_000 }),
        e({ id: 'gr', type: 'reversal', direction: 'in', amount: 50_000, reversesEntryId: 'g' }),
        e({ id: 'pay', type: 'member_payment', direction: 'in', amount: 30_000 }),
      ],
    });
    expect(s.sharedGoal).toBe(0);
    expect(s.collected).toBe(30_000);
    expect(s.netKasChange).toBe(30_000);
  });

  it('counts a loan as cash leaving actual kas and a repayment as cash coming back', () => {
    const s = summarizePeriod({
      memberCount: 2,
      entries: [
        e({ id: 'l', type: 'loan', amount: 40_000, account: 'tunai', toAccount: 'piutang' }),
        e({ id: 'r', type: 'loan_repayment', amount: 10_000, account: 'piutang', toAccount: 'tunai' }),
      ],
    });
    expect(s.netKasChange).toBe(-30_000);
  });
});

describe('defaultReportPeriod', () => {
  it('prefers the active period, else the latest by start date, else null', () => {
    const closedOld = { id: 'a', status: 'closed' as const, startDate: '2025-01-01' };
    const closedNew = { id: 'b', status: 'closed' as const, startDate: '2026-01-01' };
    const active = { id: 'c', status: 'active' as const, startDate: '2024-01-01' };
    expect(defaultReportPeriod([closedNew, closedOld, active])?.id).toBe('c');
    expect(defaultReportPeriod([closedOld, closedNew])?.id).toBe('b');
    expect(defaultReportPeriod([])).toBeNull();
  });
});
