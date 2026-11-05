import { allocatePayments } from './allocation';
import { assertPaymentDate, parseRupiahInput, previewPayment, weekState } from './payment-preview';
import { DomainError } from './money';
import type { Payment, WeekStatus } from './types';

const blank = (n: number): WeekStatus[] =>
  Array.from({ length: n }, (_, i) => ({ week: i + 1, due: 15_000, paid: 0, offset: 0, credited: 0, outstanding: 15_000 }));
const pay = (amount: number): Payment => ({ id: 'p', memberId: 'm', date: '2026-01-10', amount });

describe('previewPayment', () => {
  it('fills the oldest unpaid weeks first and reports the settled range', () => {
    const p = previewPayment(pay(45_000), blank(4));
    expect(p.settledWeeks).toEqual([1, 2, 3]);
    expect(p.allocatedAmount).toBe(45_000);
    expect(p.creditAmount).toBe(0);
    expect(p.partialWeek).toBeNull();
  });

  it('skips weeks that are already settled', () => {
    const s = blank(4);
    s[0] = { week: 1, due: 15_000, paid: 15_000, offset: 0, credited: 0, outstanding: 0 };
    expect(previewPayment(pay(15_000), s).settledWeeks).toEqual([2]);
  });

  it('turns only the part beyond the remaining dues into credit', () => {
    const s = blank(3);
    s[0] = { week: 1, due: 15_000, paid: 15_000, offset: 0, credited: 0, outstanding: 0 };
    const p = previewPayment(pay(60_000), s);
    expect(p.settledWeeks).toEqual([2, 3]);
    expect(p.creditAmount).toBe(30_000);
    expect(p.allocatedAmount).toBe(30_000);
  });

  it('makes everything credit when all weeks are settled', () => {
    const s = blank(2).map((w) => ({ ...w, paid: 15_000, outstanding: 0 }));
    const p = previewPayment(pay(15_000), s);
    expect(p.allocations).toEqual([]);
    expect(p.settledWeeks).toEqual([]);
    expect(p.creditAmount).toBe(15_000);
  });

  it('reports a partly settled last week after a capped offset', () => {
    const s = blank(3);
    s[0] = { week: 1, due: 15_000, paid: 0, offset: 5_000, credited: 0, outstanding: 10_000 };
    const p = previewPayment(pay(15_000), s);
    expect(p.settledWeeks).toEqual([1]);
    expect(p.partialWeek).toBe(2);
  });

  it('matches allocatePayments exactly (what is saved is what was previewed)', () => {
    const s = blank(5);
    const p = previewPayment(pay(75_000), s);
    expect(p.allocations).toEqual(allocatePayments([pay(75_000)], 5).allocations);
  });

  it.each([0, -15_000, 20_000, 14_999, 1.5])('rejects %s', (amount) => {
    expect(() => previewPayment(pay(amount), blank(3))).toThrow(DomainError);
  });
});

describe('assertPaymentDate', () => {
  it('accepts today and the past', () => {
    expect(() => assertPaymentDate('2026-11-05', '2026-11-05')).not.toThrow();
    expect(() => assertPaymentDate('2026-01-01', '2026-11-05')).not.toThrow();
  });
  it('rejects the future, bad formats and impossible dates', () => {
    expect(() => assertPaymentDate('2026-11-06', '2026-11-05')).toThrow(/in the future/);
    expect(() => assertPaymentDate('5/11/2026', '2026-11-05')).toThrow(DomainError);
    expect(() => assertPaymentDate('2026-02-31', '2026-11-05')).toThrow(/not a real calendar date/);
  });
});

describe('weekState', () => {
  const st = (paid: number, offset: number, credited = 0): WeekStatus => ({
    week: 1,
    due: 15_000,
    paid,
    offset,
    credited,
    outstanding: 15_000 - paid - offset - credited,
  });
  it('classifies weeks', () => {
    expect(weekState(st(15_000, 0))).toBe('paid');
    expect(weekState(st(0, 15_000))).toBe('offset');
    expect(weekState(st(0, 5_000))).toBe('partial_offset');
    expect(weekState(st(5_000, 0))).toBe('partial');
    expect(weekState(st(0, 0))).toBe('unpaid');
  });

  it('classifies weeks settled by member credit', () => {
    expect(weekState(st(0, 0, 15_000))).toBe('credited');
    expect(weekState(st(0, 0, 5_000))).toBe('partial_credited');
    expect(weekState(st(10_000, 0, 5_000))).toBe('paid');
  });
});

describe('previewPayment with credited weeks', () => {
  it('skips weeks that member credit already settled and fills the remaining room', () => {
    const s = blank(3);
    s[0] = { week: 1, due: 15_000, paid: 0, offset: 0, credited: 15_000, outstanding: 0 };
    s[1] = { week: 2, due: 15_000, paid: 0, offset: 0, credited: 5_000, outstanding: 10_000 };
    const preview = previewPayment(pay(30_000), s);
    expect(preview.allocations.map((a) => [a.week, a.amount])).toEqual([
      [2, 10_000],
      [3, 15_000],
    ]);
    expect(preview.creditAmount).toBe(5_000);
  });
});

describe('parseRupiahInput', () => {
  it('reads plain digits and correctly grouped thousands', () => {
    expect(parseRupiahInput('45000')).toBe(45_000);
    expect(parseRupiahInput('45.000')).toBe(45_000);
    expect(parseRupiahInput('1.045.000')).toBe(1_045_000);
    expect(parseRupiahInput('999')).toBe(999);
    expect(parseRupiahInput('0')).toBe(0);
  });

  it('ignores spaces around the whole text only', () => {
    expect(parseRupiahInput(' 45.000 ')).toBe(45_000);
    expect(parseRupiahInput('45 000')).toBeNull();
  });

  it.each(['15000,00', '1,5', '15,000', '15.00', '1.5000', '.000', '15.', '1..000', '1234.000', '15.0000', '', '   ', 'abc', '-15000', '1x', '+15000', '1e3', '15000.5'])(
    'rejects %j',
    (text) => {
      expect(parseRupiahInput(text)).toBeNull();
    },
  );

  it('rejects numbers longer than 12 digits', () => {
    expect(parseRupiahInput('1234567890123')).toBeNull();
    expect(parseRupiahInput('123456789012')).toBe(123_456_789_012);
  });
});

describe('previewPayment weekCount', () => {
  it('counts the weeks the payment touches, credit weeks excluded', () => {
    expect(previewPayment(pay(45_000), blank(4)).weekCount).toBe(3);
    expect(previewPayment(pay(15_000), blank(4)).weekCount).toBe(1);
    const s = blank(2);
    expect(previewPayment(pay(60_000), s).weekCount).toBe(2); // 2 weeks, 30.000 credit
    const settled = s.map((w) => ({ ...w, paid: 15_000, outstanding: 0 }));
    expect(previewPayment(pay(30_000), settled).weekCount).toBe(0); // everything is credit
  });
});
