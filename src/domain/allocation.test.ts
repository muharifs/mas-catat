import { allocatePayments } from './allocation';
import type { Payment } from './types';

const pay = (id: string, date: string, amount: number, memberId = 'm1'): Payment => ({ id, memberId, date, amount });

describe('allocatePayments', () => {
  it('no payments leaves every week outstanding', () => {
    const r = allocatePayments([], 3);
    expect(r.allocations).toEqual([]);
    expect(r.credit).toBe(0);
    expect(r.weeks.map((w) => w.outstanding)).toEqual([15_000, 15_000, 15_000]);
  });

  it('exact payment settles one week', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 15_000)], 3);
    expect(r.allocations).toEqual([
      { paymentId: 'a', memberId: 'm1', week: 1, amount: 15_000, paymentDate: '2026-01-01' },
    ]);
    expect(r.weeks.map((w) => w.outstanding)).toEqual([0, 15_000, 15_000]);
  });

  it('partial payment leaves the remainder; a later payment completes the same week first', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 5_000), pay('b', '2026-01-08', 20_000)], 3);
    expect(r.allocations).toEqual([
      { paymentId: 'a', memberId: 'm1', week: 1, amount: 5_000, paymentDate: '2026-01-01' },
      { paymentId: 'b', memberId: 'm1', week: 1, amount: 10_000, paymentDate: '2026-01-08' },
      { paymentId: 'b', memberId: 'm1', week: 2, amount: 10_000, paymentDate: '2026-01-08' },
    ]);
    expect(r.weeks.map((w) => w.outstanding)).toEqual([0, 5_000, 15_000]);
  });

  it('advance payment covers several future weeks', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 45_000)], 5);
    expect(r.allocations.map((a) => a.week)).toEqual([1, 2, 3]);
    expect(r.credit).toBe(0);
  });

  it('late payment fills the oldest unpaid week, keeping its real date', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 15_000), pay('late', '2026-02-01', 15_000)], 4);
    const late = r.allocations.find((a) => a.paymentId === 'late');
    expect(late).toMatchObject({ week: 2, paymentDate: '2026-02-01' });
  });

  it('lump sum spans several weeks oldest first, each allocation keeps the payment date', () => {
    const r = allocatePayments([pay('big', '2026-03-01', 40_000)], 5);
    expect(r.allocations.map((a) => [a.week, a.amount])).toEqual([
      [1, 15_000],
      [2, 15_000],
      [3, 10_000],
    ]);
    expect(new Set(r.allocations.map((a) => a.paymentDate))).toEqual(new Set(['2026-03-01']));
    expect(r.weeks.map((w) => w.outstanding)).toEqual([0, 0, 5_000, 15_000, 15_000]);
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
    const r = allocatePayments([pay('a', '2026-01-01', 50_000)], 2);
    expect(r.allocations.map((a) => a.amount)).toEqual([15_000, 15_000]);
    expect(r.credit).toBe(20_000);
    expect(r.weeks.every((w) => w.outstanding === 0)).toBe(true);
  });

  it('offset credits reduce what payments must cover', () => {
    const r = allocatePayments([pay('a', '2026-01-01', 10_000)], 3, [{ week: 1, amount: 5_000 }]);
    expect(r.weeks[0]).toEqual({ week: 1, due: 15_000, paid: 10_000, offset: 5_000, outstanding: 0 });
    expect(r.allocations).toHaveLength(1);
  });

  it('does not mutate its inputs', () => {
    const payments = Object.freeze([
      Object.freeze(pay('b', '2026-01-08', 20_000)),
      Object.freeze(pay('a', '2026-01-01', 5_000)),
    ]);
    const credits = Object.freeze([Object.freeze({ week: 2, amount: 1_000 })]);
    const snapshot = JSON.stringify([payments, credits]);
    allocatePayments(payments, 3, credits);
    expect(JSON.stringify([payments, credits])).toBe(snapshot);
  });

  it('returns only integers and conserves money', () => {
    const payments = [pay('a', '2026-01-01', 7_000), pay('b', '2026-01-02', 33_333), pay('c', '2026-01-03', 999_999)];
    const r = allocatePayments(payments, 4);
    const allocated = r.allocations.reduce((s, a) => s + a.amount, 0);
    expect(allocated + r.credit).toBe(7_000 + 33_333 + 999_999);
    const numbers = [r.credit, ...r.allocations.map((a) => a.amount), ...r.weeks.flatMap((w) => [w.paid, w.outstanding])];
    expect(numbers.every(Number.isInteger)).toBe(true);
  });

  describe('invalid input', () => {
    it.each([-1, 0, 1.5, NaN])('rejects payment amount %p', (amount) => {
      expect(() => allocatePayments([pay('a', '2026-01-01', amount)], 3)).toThrow(/amount/);
    });
    it('rejects bad date', () => {
      expect(() => allocatePayments([pay('a', '01/01/2026', 1_000)], 3)).toThrow(/ISO date/);
    });
    it.each([0, -2, 1.5])('rejects totalWeeks %p', (n) => {
      expect(() => allocatePayments([], n)).toThrow(/totalWeeks/);
    });
    it('rejects mixed members', () => {
      expect(() => allocatePayments([pay('a', '2026-01-01', 1_000), pay('b', '2026-01-01', 1_000, 'm2')], 3)).toThrow(
        /same member/,
      );
    });
    it('rejects invalid offset credits', () => {
      expect(() => allocatePayments([], 3, [{ week: 4, amount: 1 }])).toThrow(/beyond/);
      expect(() => allocatePayments([], 3, [{ week: 1, amount: 15_001 }])).toThrow(/exceeds/);
      expect(() => allocatePayments([], 3, [{ week: 1, amount: -5 }])).toThrow(/offset amount/);
    });
  });
});
