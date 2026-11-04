import { allocatePayments } from './allocation';
import { hostPayoutAmount, kasIncrease, memberBalance, periodWeekCount, unpaidWeeksThrough, weeklyTotalCollected } from './dues';

describe.each([1, 5, 12])('weekly totals for N=%i', (n) => {
  it('computes collected, payout and kas as integers', () => {
    expect(weeklyTotalCollected(n)).toBe(15_000 * n);
    expect(hostPayoutAmount(n)).toBe(10_000 * n);
    expect(kasIncrease(n)).toBe(5_000 * n);
    expect(hostPayoutAmount(n) + kasIncrease(n)).toBe(weeklyTotalCollected(n));
    for (const v of [weeklyTotalCollected(n), hostPayoutAmount(n), kasIncrease(n)]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(periodWeekCount(n)).toBe(n);
  });
});

describe('host also pays', () => {
  it('counts the host among the N payers (total is 15.000 x N, not N-1)', () => {
    expect(weeklyTotalCollected(5)).toBe(75_000);
  });
});

describe('invalid input', () => {
  it.each([0, -1, 2.5, NaN])('rejects memberCount %p', (n) => {
    expect(() => weeklyTotalCollected(n)).toThrow(/memberCount/);
    expect(() => hostPayoutAmount(n)).toThrow(/memberCount/);
    expect(() => kasIncrease(n)).toThrow(/memberCount/);
  });
});

describe('member balance', () => {
  const pay = (id: string, date: string, amount: number) => ({ id, memberId: 'm1', date, amount });

  it('shows debt and advance separately', () => {
    // 5 weeks; paid 20.000 -> week 1 settled, week 2 has 5.000 paid.
    const { weeks } = allocatePayments([pay('a', '2026-01-01', 20_000)], 5);
    const atWeek3 = memberBalance(weeks, 3);
    expect(atWeek3).toEqual({ dueToDate: 45_000, settledToDate: 20_000, outstanding: 25_000, prepaid: 0 });
    expect(unpaidWeeksThrough(weeks, 3)).toEqual([
      { week: 2, amount: 10_000 },
      { week: 3, amount: 15_000 },
    ]);
  });

  it('reports advance as prepaid', () => {
    const { weeks } = allocatePayments([pay('a', '2026-01-01', 45_000)], 5);
    expect(memberBalance(weeks, 1)).toEqual({ dueToDate: 15_000, settledToDate: 15_000, outstanding: 0, prepaid: 30_000 });
  });

  it('rejects throughWeek beyond the period', () => {
    const { weeks } = allocatePayments([], 3);
    expect(() => memberBalance(weeks, 4)).toThrow(/beyond/);
  });
});
