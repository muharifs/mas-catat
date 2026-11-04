import { allocatePayments } from './allocation';
import { unpaidWeeksThrough } from './dues';
import { buildHostSettlement } from './payout';

const base = { memberCount: 5, hostMemberId: 'h', week: 3, date: '2026-01-15' };

describe('buildHostSettlement', () => {
  it('host without debt: only the payout entry, no zero-amount offset', () => {
    const r = buildHostSettlement({ ...base, hostUnpaidWeeks: [] });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ type: 'host_payout', direction: 'out', amount: 50_000, memberId: 'h', week: 3 });
    expect(r.offsetWeeks).toEqual([]);
    expect(r.netCash).toBe(50_000);
  });

  it('host with debt over several weeks: two entries, offset = total of unpaid weeks', () => {
    const payments = [{ id: 'p1', memberId: 'h', date: '2026-01-01', amount: 20_000 }];
    const { weeks } = allocatePayments(payments, 5);
    const unpaid = unpaidWeeksThrough(weeks, 3); // week2: 10.000, week3: 15.000
    const r = buildHostSettlement({ ...base, hostUnpaidWeeks: unpaid });
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ type: 'host_payout', direction: 'out', amount: 50_000 });
    expect(r.entries[1]).toMatchObject({ type: 'host_offset', direction: 'in', amount: 25_000, memberId: 'h', week: 3 });
    expect(r.offsetWeeks).toEqual([
      { week: 2, amount: 10_000 },
      { week: 3, amount: 15_000 },
    ]);
    expect(r.netCash).toBe(25_000);
  });

  it('payout stays 10.000 x N, not reduced by the offset', () => {
    const r = buildHostSettlement({ ...base, hostUnpaidWeeks: [{ week: 1, amount: 15_000 }] });
    expect(r.entries[0]?.amount).toBe(50_000);
  });

  it('offset credits feed back into allocation and clear the debt', () => {
    const { weeks } = allocatePayments([], 5);
    const r = buildHostSettlement({ ...base, hostUnpaidWeeks: unpaidWeeksThrough(weeks, 3) });
    const after = allocatePayments([], 5, r.offsetWeeks);
    expect(unpaidWeeksThrough(after.weeks, 3)).toEqual([]);
    expect(after.weeks[3]?.outstanding).toBe(15_000);
  });

  it('debt larger than payout gives negative netCash (not capped)', () => {
    const unpaid = [1, 2, 3, 4, 5].map((week) => ({ week, amount: 15_000 }));
    const r = buildHostSettlement({ ...base, week: 5, hostUnpaidWeeks: unpaid });
    expect(r.entries[1]?.amount).toBe(75_000);
    expect(r.netCash).toBe(-25_000);
  });

  it('works for N=1 and N=12 and yields integers only', () => {
    for (const n of [1, 12]) {
      const r = buildHostSettlement({ ...base, memberCount: n, hostUnpaidWeeks: [{ week: 1, amount: 5_000 }] });
      expect(r.entries[0]?.amount).toBe(10_000 * n);
      expect(r.entries.every((e) => Number.isInteger(e.amount) && e.amount > 0)).toBe(true);
      expect(Number.isInteger(r.netCash)).toBe(true);
    }
  });

  it('does not mutate input', () => {
    const unpaid = Object.freeze([Object.freeze({ week: 1, amount: 5_000 })]);
    const snapshot = JSON.stringify(unpaid);
    buildHostSettlement({ ...base, hostUnpaidWeeks: unpaid });
    expect(JSON.stringify(unpaid)).toBe(snapshot);
  });

  it('rejects invalid input', () => {
    expect(() => buildHostSettlement({ ...base, memberCount: 0, hostUnpaidWeeks: [] })).toThrow(/memberCount/);
    expect(() => buildHostSettlement({ ...base, week: 0, hostUnpaidWeeks: [] })).toThrow(/week/);
    expect(() => buildHostSettlement({ ...base, date: 'x', hostUnpaidWeeks: [] })).toThrow(/ISO date/);
    expect(() => buildHostSettlement({ ...base, hostUnpaidWeeks: [{ week: 1, amount: -1 }] })).toThrow(/unpaid amount/);
    expect(() => buildHostSettlement({ ...base, hostUnpaidWeeks: [{ week: 1, amount: 1.5 }] })).toThrow(/unpaid amount/);
  });
});
