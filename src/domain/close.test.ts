import {
  applyCredited,
  availableCredit,
  endDateProblem,
  planCarryOver,
  planCreditSettlement,
  planDebtWriteoffs,
  previewCreditRefund,
  previewPeriodClose,
} from './close';
import { allocatePayments } from './allocation';
import type { WeekStatus } from './types';

/** Weeks 1..n with the given outstanding amounts (the rest of each due is paid). */
const weeks = (...outstanding: number[]): WeekStatus[] =>
  outstanding.map((o, i) => ({ week: i + 1, due: 15_000, paid: 15_000 - o, offset: 0, credited: 0, outstanding: o }));

const invariant = (s: WeekStatus) => s.due === s.paid + s.offset + s.credited + s.outstanding;

describe('availableCredit', () => {
  it('is received - allocated - applied - refunded', () => {
    expect(availableCredit({ received: 60_000, allocated: 30_000, applied: 10_000, refunded: 5_000 })).toBe(15_000);
    expect(availableCredit({ received: 30_000, allocated: 30_000, applied: 0, refunded: 0 })).toBe(0);
  });

  it('refuses inconsistent data instead of hiding a negative credit', () => {
    expect(() => availableCredit({ received: 10_000, allocated: 0, applied: 10_000, refunded: 5_000 })).toThrow(/negative/);
  });
});

describe('planCreditSettlement', () => {
  it('settles the oldest arrears first and may settle the last week partially', () => {
    const plan = planCreditSettlement({ statuses: weeks(15_000, 0, 15_000, 15_000), credit: 20_000 });
    expect(plan.applications).toEqual([
      { week: 1, amount: 15_000 },
      { week: 3, amount: 5_000 },
    ]);
    expect(plan).toMatchObject({ settled: 20_000, creditLeft: 0 });
  });

  it('keeps leftover credit when the arrears are smaller', () => {
    expect(planCreditSettlement({ statuses: weeks(0, 10_000), credit: 25_000 })).toEqual({
      applications: [{ week: 2, amount: 10_000 }],
      settled: 10_000,
      creditLeft: 15_000,
    });
  });

  it('does nothing without credit or without arrears', () => {
    expect(planCreditSettlement({ statuses: weeks(15_000), credit: 0 }).applications).toEqual([]);
    expect(planCreditSettlement({ statuses: weeks(0, 0), credit: 15_000 })).toMatchObject({ applications: [], creditLeft: 15_000 });
  });
});

describe('WeekStatus invariant: due = paid + offset + credited + outstanding', () => {
  it('holds after credit is applied', () => {
    const before = weeks(15_000, 5_000, 0);
    const plan = planCreditSettlement({ statuses: before, credit: 12_000 });
    const after = applyCredited(before, plan.applications);
    expect(after.every(invariant)).toBe(true);
    expect(after.map((s) => [s.credited, s.outstanding])).toEqual([
      [12_000, 3_000],
      [0, 5_000],
      [0, 0],
    ]);
  });

  it('holds for allocation results with offsets and credited amounts', () => {
    const r = allocatePayments([], 4, [{ week: 2, amount: 7_000 }], [{ week: 1, amount: 15_000 }, { week: 2, amount: 8_000 }]);
    expect(r.weeks.every(invariant)).toBe(true);
  });

  it('refuses credit above what is outstanding', () => {
    expect(() => applyCredited(weeks(5_000), [{ week: 1, amount: 6_000 }])).toThrow(/exceeds/);
  });
});

describe('planDebtWriteoffs', () => {
  it('gives one write-off per member still in arrears and none for members without arrears', () => {
    const result = planDebtWriteoffs([
      { memberId: 'a', statuses: weeks(0, 0, 0) },
      { memberId: 'b', statuses: weeks(15_000, 0, 15_000) },
      { memberId: 'c', statuses: weeks(5_000, 0, 0) },
    ]);
    expect(result).toEqual([
      { memberId: 'b', amount: 30_000 },
      { memberId: 'c', amount: 5_000 },
    ]);
  });
});

describe('planCarryOver', () => {
  it('lets credit of 5.000 settle PART of meeting 1', () => {
    const plan = planCarryOver({ weekCount: 3, sources: [{ fromPeriodId: 'p1', available: 5_000 }] });
    expect(plan.applications).toEqual([{ fromPeriodId: 'p1', week: 1, amount: 5_000 }]);
    expect(plan).toMatchObject({ applied: 5_000, creditLeft: 0, remaining: [] });
  });

  it('keeps the rest when credit exceeds the new period dues', () => {
    const plan = planCarryOver({ weekCount: 2, sources: [{ fromPeriodId: 'p1', available: 60_000 }] });
    expect(plan.applications).toEqual([
      { fromPeriodId: 'p1', week: 1, amount: 15_000 },
      { fromPeriodId: 'p1', week: 2, amount: 15_000 },
    ]);
    expect(plan).toMatchObject({ applied: 30_000, creditLeft: 30_000, remaining: [{ fromPeriodId: 'p1', amount: 30_000 }] });
  });

  it('uses several source periods oldest first and shares a week between them', () => {
    const plan = planCarryOver({
      weekCount: 2,
      sources: [
        { fromPeriodId: 'p1', available: 5_000 },
        { fromPeriodId: 'p2', available: 20_000 },
      ],
    });
    expect(plan.applications).toEqual([
      { fromPeriodId: 'p1', week: 1, amount: 5_000 },
      { fromPeriodId: 'p2', week: 1, amount: 10_000 },
      { fromPeriodId: 'p2', week: 2, amount: 10_000 },
    ]);
    expect(plan.applied).toBe(25_000);
    // No week receives more than the weekly due.
    const byWeek = new Map<number, number>();
    for (const a of plan.applications) byWeek.set(a.week, (byWeek.get(a.week) ?? 0) + a.amount);
    expect([...byWeek.values()].every((v) => v <= 15_000)).toBe(true);
  });

  it('does nothing without credit', () => {
    expect(planCarryOver({ weekCount: 3, sources: [] })).toEqual({ applications: [], applied: 0, remaining: [], creditLeft: 0 });
  });
});

describe('previewPeriodClose', () => {
  const closedWeeks = [1, 2, 3].map((number) => ({ number, status: 'closed' as const, hasActivePayout: true }));

  it('shows arrears before and after credit netting, the write-offs and the leftover credit', () => {
    const p = previewPeriodClose({
      weeks: closedWeeks,
      members: [
        { memberId: 'a', statuses: weeks(0, 0, 0), credit: 15_000 }, // credit only
        { memberId: 'b', statuses: weeks(15_000, 15_000, 0), credit: 20_000 }, // credit covers part
        { memberId: 'c', statuses: weeks(15_000, 0, 15_000), credit: 0 }, // plain debt
      ],
    });
    expect(p.canClose).toBe(true);
    expect(p).toMatchObject({
      membersInArrears: 2,
      totalArrears: 60_000,
      totalSettledByCredit: 20_000,
      totalWriteoff: 40_000,
      membersWithCredit: 2,
      totalCredit: 35_000,
      totalCreditLeft: 15_000,
    });
    expect(p.writeoffs).toEqual([
      { memberId: 'b', amount: 10_000 },
      { memberId: 'c', amount: 30_000 },
    ]);
    expect(p.members.find((m) => m.memberId === 'b')).toMatchObject({
      arrearsBefore: 30_000,
      settledByCredit: 20_000,
      writeoff: 10_000,
      creditLeft: 0,
    });
  });

  it('blocks on open meetings and on closed meetings without a host payout in force', () => {
    const p = previewPeriodClose({
      weeks: [
        { number: 1, status: 'closed', hasActivePayout: true },
        { number: 2, status: 'closed', hasActivePayout: false }, // never paid, or its payout was corrected
        { number: 3, status: 'open', hasActivePayout: false },
      ],
      members: [{ memberId: 'a', statuses: weeks(0, 0, 15_000), credit: 0 }],
    });
    expect(p).toMatchObject({ canClose: false, openWeeks: [3], unpaidHostWeeks: [2] });
    // Numbers cover the closed meetings only: the open meeting 3 does not count as arrears yet.
    expect(p.totalArrears).toBe(0);
  });
});

describe('endDateProblem', () => {
  it('requires a real date, not before the start and not in the future', () => {
    expect(endDateProblem('2026-06-01', '2026-01-04', '2026-12-31')).toBeNull();
    expect(endDateProblem('2026-12-31', '2026-01-04', '2026-12-31')).toBeNull();
    expect(endDateProblem('2026-02-31', '2026-01-04', '2026-12-31')).toBe('invalid');
    expect(endDateProblem('besok', '2026-01-04', '2026-12-31')).toBe('invalid');
    expect(endDateProblem('2026-01-03', '2026-01-04', '2026-12-31')).toBe('before_start');
    expect(endDateProblem('2027-01-01', '2026-01-04', '2026-12-31')).toBe('future');
  });
});

describe('previewCreditRefund', () => {
  const balances = { tunai: 10_000, debit: 50_000, piutang: 0, actual: 60_000 };

  it('refunds the whole remaining credit from the chosen pos with ONE out entry', () => {
    const p = previewCreditRefund({ memberId: 'a', available: 25_000, date: '2026-12-01', account: 'debit', balances });
    expect(p.entry).toMatchObject({ type: 'credit_refund', direction: 'out', amount: 25_000, account: 'debit', memberId: 'a', week: null });
    expect(p.after).toMatchObject({ tunai: 10_000, debit: 25_000, actual: 35_000 });
    expect(p.negativeAccounts).toEqual([]);
  });

  it('warns (never blocks) when the pos would go negative, and refuses no credit or a bad pos', () => {
    expect(previewCreditRefund({ memberId: 'a', available: 25_000, date: '2026-12-01', account: 'tunai', balances }).negativeAccounts).toEqual([
      'tunai',
    ]);
    expect(() => previewCreditRefund({ memberId: 'a', available: 0, date: '2026-12-01', account: 'tunai', balances })).toThrow(
      /nothing to refund/,
    );
    expect(() =>
      previewCreditRefund({ memberId: 'a', available: 1_000, date: '2026-12-01', account: 'piutang' as unknown as 'tunai', balances }),
    ).toThrow(/tunai or debit/);
  });
});
