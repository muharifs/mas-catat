import { allocatePayments } from './allocation';
import { DomainError } from './money';
import type { Payment } from './types';

const pay = (id: string, date: string, amount: number, memberId = 'm1'): Payment => ({ id, memberId, date, amount });

describe('allocatePayments', () => {
  it('no payments leaves every week outstanding', () => {
    const r = allocatePayments([], 3);
    expect(r.allocations).toEqual([]);
    expect(r.credit).toBe(0);
    expect(r.weeks.map((w) => w.outstanding)).toEqual([15_000, 15_000, 15_000]);
  });

  it('accepts exactly 15.000 and settles one week', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 15_000)], 3);
    expect(r.allocations).toEqual([
      { paymentId: 'a', memberId: 'm1', week: 1, amount: 15_000, paymentDate: '2026-01-01' },
    ]);
    expect(r.weeks.map((w) => w.outstanding)).toEqual([0, 15_000, 15_000]);
  });

  it('30.000 settles the two oldest unpaid weeks (member was absent for 2 weeks)', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 15_000), pay('catchup', '2026-01-22', 30_000)], 5);
    expect(r.allocations.filter((a) => a.paymentId === 'catchup').map((a) => [a.week, a.amount, a.paymentDate])).toEqual([
      [2, 15_000, '2026-01-22'],
      [3, 15_000, '2026-01-22'],
    ]);
    expect(r.weeks.map((w) => w.outstanding)).toEqual([0, 0, 0, 15_000, 15_000]);
  });

  it('45.000 paid in advance covers three future weeks', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 45_000)], 5);
    expect(r.allocations.map((a) => [a.week, a.amount])).toEqual([
      [1, 15_000],
      [2, 15_000],
      [3, 15_000],
    ]);
    expect(r.credit).toBe(0);
  });

  it('late payment fills the oldest unpaid week, keeping its real date', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 15_000), pay('late', '2026-02-01', 15_000)], 4);
    const late = r.allocations.find((a) => a.paymentId === 'late');
    expect(late).toMatchObject({ week: 2, paymentDate: '2026-02-01' });
  });

  it('lump sum spans several weeks oldest first, each allocation keeps the payment date', () => {
    const r = allocatePayments([pay('big', '2026-03-01', 45_000)], 5);
    expect(new Set(r.allocations.map((a) => a.paymentDate))).toEqual(new Set(['2026-03-01']));
    expect(r.weeks.map((w) => w.outstanding)).toEqual([0, 0, 0, 15_000, 15_000]);
  });

  it('processes payments in date order regardless of input order', () => {
    const r = allocatePayments([pay('later', '2026-01-08', 15_000), pay('first', '2026-01-01', 15_000)], 3);
    expect(r.allocations.map((a) => [a.paymentId, a.week])).toEqual([
      ['first', 1],
      ['later', 2],
    ]);
  });

  it('keeps input order for payments on the same date', () => {
    const r = allocatePayments([pay('x', '2026-01-01', 15_000), pay('y', '2026-01-01', 15_000)], 3);
    expect(r.allocations.map((a) => a.paymentId)).toEqual(['x', 'y']);
  });

  it('surplus after all weeks are settled becomes advance credit', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 60_000)], 2);
    expect(r.allocations.map((a) => a.amount)).toEqual([15_000, 15_000]);
    expect(r.credit).toBe(30_000);
    expect(r.weeks.every((w) => w.outstanding === 0)).toBe(true);
  });

  it('a large multiple with no open weeks left is still accepted and becomes credit', () => {
    const settled = allocatePayments([pay('a', '2026-01-01', 15_000), pay('b', '2026-01-08', 150_000)], 1);
    expect(settled.allocations).toHaveLength(1);
    expect(settled.credit).toBe(150_000);
    const big = allocatePayments([pay('c', '2026-01-01', 150_000)], 2);
    expect(big.allocations.map((a) => a.amount)).toEqual([15_000, 15_000]);
    expect(big.credit).toBe(120_000);
  });

  it('offset credits (not payments) may be any amount and reduce what payments must cover', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 15_000)], 3, [{ week: 1, amount: 5_000 }]);
    expect(r.weeks[0]).toEqual({ week: 1, due: 15_000, paid: 10_000, offset: 5_000, credited: 0, outstanding: 0 });    expect(r.allocations.map((a) => [a.week, a.amount])).toEqual([
      [1, 10_000],
      [2, 5_000],
    ]);
  });

  it('does not mutate its inputs', () => {
    const payments = Object.freeze([
      Object.freeze(pay('b', '2026-01-08', 30_000)),
      Object.freeze(pay('a', '2026-01-01', 15_000)),
    ]);
    const credits = Object.freeze([Object.freeze({ week: 2, amount: 1_000 })]);
    const snapshot = JSON.stringify([payments, credits]);
    allocatePayments(payments, 3, credits);
    expect(JSON.stringify([payments, credits])).toBe(snapshot);
  });

  it('returns only integers and conserves money', () => {
    const payments = [pay('a', '2026-01-01', 15_000), pay('b', '2026-01-02', 45_000), pay('c', '2026-01-03', 990_000)];
    const r = allocatePayments(payments, 4);
    const allocated = r.allocations.reduce((s, a) => s + a.amount, 0);
    expect(allocated + r.credit).toBe(15_000 + 45_000 + 990_000);
    const numbers = [r.credit, ...r.allocations.map((a) => a.amount), ...r.weeks.flatMap((w) => [w.paid, w.outstanding])];
    expect(numbers.every(Number.isInteger)).toBe(true);
  });

  describe('invalid input', () => {
    it.each([-1, 0, 1.5, NaN, Infinity])('rejects non-positive or non-integer payment amount %p', (amount) => {
      expect(() => allocatePayments([pay('a', '2026-01-01', amount)], 3)).toThrow(/amount/);
    });
    it.each([10_000, 20_000, 1_500, 150_001, 5_000, 25_000])('rejects non-multiple of 15.000: %p', (amount) => {
      const call = () => allocatePayments([pay('a', '2026-01-01', amount)], 3);
      expect(call).toThrow(DomainError);
      expect(call).toThrow(/multiple of 15000/);
    });
    it('rejects a bad payment even when it is not the first one', () => {
      expect(() => allocatePayments([pay('a', '2026-01-01', 15_000), pay('b', '2026-01-08', 10_000)], 3)).toThrow(
        /payment b amount/,
      );
    });
    it('rejects bad date', () => {
      expect(() => allocatePayments([pay('a', '01/01/2026', 15_000)], 3)).toThrow(/ISO date/);
    });
    it.each([0, -2, 1.5])('rejects totalWeeks %p', (n) => {
      expect(() => allocatePayments([], n)).toThrow(/totalWeeks/);
    });
    it('rejects mixed members', () => {
      expect(() =>
        allocatePayments([pay('a', '2026-01-01', 15_000), pay('b', '2026-01-01', 15_000, 'm2')], 3),
      ).toThrow(/same member/);
    });
    it('rejects invalid offset credits', () => {
      expect(() => allocatePayments([], 3, [{ week: 4, amount: 1 }])).toThrow(/beyond/);
      expect(() => allocatePayments([], 3, [{ week: 1, amount: 15_001 }])).toThrow(/exceeds/);
      expect(() => allocatePayments([], 3, [{ week: 1, amount: -5 }])).toThrow(/offset amount/);
    });
  });
});

describe('allocatePayments with credited weeks', () => {
  it('treats credited amounts as settled, reports them separately and keeps due = paid + offset + credited + outstanding', () => {
    const payment = pay('p', '2026-01-10', 15_000);
    const r = allocatePayments([payment], 3, [{ week: 1, amount: 5_000 }], [{ week: 1, amount: 5_000 }, { week: 2, amount: 15_000 }]);
    // Week 1 has 5.000 offset + 5.000 credited, so the payment only fills 5.000 there; week 2 is fully credited.
    expect(r.allocations.map((a) => [a.week, a.amount])).toEqual([[1, 5_000], [3, 10_000]]);
    expect(r.weeks).toEqual([
      { week: 1, due: 15_000, paid: 5_000, offset: 5_000, credited: 5_000, outstanding: 0 },
      { week: 2, due: 15_000, paid: 0, offset: 0, credited: 15_000, outstanding: 0 },
      { week: 3, due: 15_000, paid: 10_000, offset: 0, credited: 0, outstanding: 5_000 },
    ]);
    for (const w of r.weeks) expect(w.due).toBe(w.paid + w.offset + w.credited + w.outstanding);
  });

  it('rejects offset + credited above the weekly due and credited weeks beyond the period', () => {
    expect(() => allocatePayments([], 2, [{ week: 1, amount: 10_000 }], [{ week: 1, amount: 10_000 }])).toThrow(/exceeds the weekly due/);
    expect(() => allocatePayments([], 2, [], [{ week: 3, amount: 1 }])).toThrow(/beyond the period/);
  });
});
