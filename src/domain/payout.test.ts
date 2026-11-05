import { allocatePayments } from './allocation';
import { unpaidWeeksThrough } from './dues';
import { buildHostSettlement, previewHostPayout } from './payout';
import { computeKasBalances } from './kas';

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
    const payments = [{ id: 'p1', memberId: 'h', date: '2026-01-01', amount: 15_000 }];
    const { weeks } = allocatePayments(payments, 5);
    const unpaid = unpaidWeeksThrough(weeks, 3); // week2: 15.000, week3: 15.000
    const r = buildHostSettlement({ ...base, hostUnpaidWeeks: unpaid });
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ type: 'host_payout', direction: 'out', amount: 50_000 });
    expect(r.entries[1]).toMatchObject({ type: 'host_offset', direction: 'in', amount: 30_000, memberId: 'h', week: 3 });
    expect(r.offsetWeeks).toEqual([
      { week: 2, amount: 15_000 },
      { week: 3, amount: 15_000 },
    ]);
    expect(r.netCash).toBe(20_000);
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

  it('debt below payout: full offset, nothing remains', () => {
    const r = buildHostSettlement({ ...base, hostUnpaidWeeks: [{ week: 1, amount: 15_000 }, { week: 2, amount: 15_000 }] });
    expect(r.entries[1]).toMatchObject({ type: 'host_offset', amount: 30_000 });
    expect(r.netCash).toBe(20_000);
    expect(r.remainingDebt).toBe(0);
  });

  it('debt equal to payout: offset = payout, netCash 0, nothing remains', () => {
    const unpaid = [1, 2, 3].map((w) => ({ week: w, amount: 15_000 })).concat([{ week: 4, amount: 5_000 }]); // 50.000
    const r = buildHostSettlement({ ...base, week: 4, hostUnpaidWeeks: unpaid });
    expect(r.entries).toHaveLength(2);
    expect(r.entries[1]?.amount).toBe(50_000);
    expect(r.netCash).toBe(0);
    expect(r.remainingDebt).toBe(0);
    expect(r.offsetWeeks).toEqual(unpaid);
  });

  it('debt above payout: capped at payout, oldest weeks first, last week partial', () => {
    const unpaid = [1, 2, 3, 4, 5].map((week) => ({ week, amount: 15_000 })); // 75.000 vs payout 50.000
    const r = buildHostSettlement({ ...base, week: 5, hostUnpaidWeeks: unpaid });
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ type: 'host_payout', amount: 50_000 });
    expect(r.entries[1]).toMatchObject({ type: 'host_offset', direction: 'in', amount: 50_000 });
    expect(r.offsetWeeks).toEqual([
      { week: 1, amount: 15_000 },
      { week: 2, amount: 15_000 },
      { week: 3, amount: 15_000 },
      { week: 4, amount: 5_000 },
    ]);
    expect(r.netCash).toBe(0);
    expect(r.remainingDebt).toBe(25_000);
    expect(r.entries[1]?.note).toMatch(/weeks 1, 2, 3, 4/);
    expect(r.entries[1]?.note).toMatch(/partially/);
  });

  it('applies the cap oldest first even if input is unordered', () => {
    const unpaid = [5, 1, 4, 2, 3].map((week) => ({ week, amount: 15_000 }));
    const r = buildHostSettlement({ ...base, week: 5, hostUnpaidWeeks: unpaid });
    expect(r.offsetWeeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(r.offsetWeeks.reduce((s, w) => s + w.amount, 0)).toBe(50_000);
  });

  it('host without debt: remainingDebt is 0', () => {
    expect(buildHostSettlement({ ...base, hostUnpaidWeeks: [] }).remainingDebt).toBe(0);
  });

  it('capped offset keeps the rest outstanding; later payments fill it without double counting', () => {
    const { weeks } = allocatePayments([], 5);
    const r = buildHostSettlement({ ...base, week: 5, hostUnpaidWeeks: unpaidWeeksThrough(weeks, 5) });
    const after = allocatePayments([], 5, r.offsetWeeks);
    const unpaid = unpaidWeeksThrough(after.weeks, 5);
    expect(unpaid).toEqual([
      { week: 4, amount: 10_000 },
      { week: 5, amount: 15_000 },
    ]);
    expect(unpaid.reduce((s, u) => s + u.amount, 0)).toBe(r.remainingDebt);

    // A valid payment (15.000) fills the partially offset week 4 first (10.000), then 5.000 of week 5.
    const paid = allocatePayments([{ id: 'p', memberId: 'h', date: '2026-02-01', amount: 15_000 }], 5, r.offsetWeeks);
    expect(paid.allocations.map((a) => [a.week, a.amount])).toEqual([[4, 10_000], [5, 5_000]]);
    expect(paid.weeks[3]).toMatchObject({ paid: 10_000, offset: 5_000, outstanding: 0 });
    expect(unpaidWeeksThrough(paid.weeks, 5)).toEqual([{ week: 5, amount: 10_000 }]);
    expect(paid.credit).toBe(0);
  });

  // OPEN QUESTION - WAITING FOR OWNER DECISION. Do not treat this as the intended final behaviour.
  // Payments must be multiples of 15.000, but a capped offset can leave a remainingDebt that is NOT a
  // multiple (here 25.000). Today that exact remainder cannot be paid with a normal payment: 25.000 is
  // rejected. No exception was made on purpose; the owner must decide how such a remainder is collected.
  it('documents: remaining host debt of 25.000 cannot be paid by a normal payment (pending owner decision)', () => {
    const { weeks } = allocatePayments([], 5);
    const r = buildHostSettlement({ ...base, week: 5, hostUnpaidWeeks: unpaidWeeksThrough(weeks, 5) });
    expect(r.remainingDebt).toBe(25_000);
    expect(r.remainingDebt % 15_000).not.toBe(0);
    const exact = [{ id: 'p', memberId: 'h', date: '2026-02-01', amount: r.remainingDebt }];
    expect(() => allocatePayments(exact, 5, r.offsetWeeks)).toThrow(/multiple of 15000/);
    // A 30.000 payment is accepted, but 5.000 more than the debt is left over as credit.
    const over = [{ id: 'p', memberId: 'h', date: '2026-02-01', amount: 30_000 }];
    expect(allocatePayments(over, 5, r.offsetWeeks).credit).toBe(5_000);
  });

  it('works for N=1 and N=12 and yields integers only', () => {
    for (const n of [1, 12]) {
      const r = buildHostSettlement({ ...base, memberCount: n, hostUnpaidWeeks: [{ week: 1, amount: 5_000 }] });
      expect(r.entries[0]?.amount).toBe(10_000 * n);
      expect(r.entries.every((e) => Number.isInteger(e.amount) && e.amount > 0)).toBe(true);
      expect(Number.isInteger(r.netCash)).toBe(true);
      expect(Number.isInteger(r.remainingDebt)).toBe(true);
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

describe('buildHostSettlement account', () => {
  it('books payout and offset on the SAME pos', () => {
    const r = buildHostSettlement({ ...base, hostUnpaidWeeks: [{ week: 1, amount: 15_000 }], account: 'debit' });
    expect(r.entries.map((e) => [e.type, e.account])).toEqual([
      ['host_payout', 'debit'],
      ['host_offset', 'debit'],
    ]);
  });
});

describe('previewHostPayout', () => {
  const balances = (tunai: number, debit: number) =>
    computeKasBalances([
      { direction: 'in', amount: tunai, account: 'tunai' },
      { direction: 'in', amount: debit, account: 'debit' },
    ]);
  const input = { ...base, memberCount: 4, hostUnpaidWeeks: [{ week: 1, amount: 15_000 }], account: 'tunai' as const };

  it('shows payout, offset, net cash out and remaining debt', () => {
    const p = previewHostPayout({ ...input, balances: balances(100_000, 0) });
    expect(p).toMatchObject({ payout: 40_000, offset: 15_000, netCash: 25_000, remainingDebt: 0, account: 'tunai' });
    expect(p.offsetWeeks).toEqual([{ week: 1, amount: 15_000 }]);
    expect(p.kasShort).toBe(false);
    expect(p.accountShort).toBe(false);
  });

  it('warns on the NET cash out, not on the full payout', () => {
    // Net 25.000: kas of 30.000 covers it although the full payout is 40.000.
    expect(previewHostPayout({ ...input, balances: balances(30_000, 0) }).kasShort).toBe(false);
    expect(previewHostPayout({ ...input, balances: balances(20_000, 0) }).kasShort).toBe(true);
  });

  it('warns separately when only the chosen pos is short', () => {
    const p = previewHostPayout({ ...input, balances: balances(10_000, 100_000) });
    expect(p.kasShort).toBe(false);
    expect(p.accountShort).toBe(true);
    const onDebit = previewHostPayout({ ...input, account: 'debit', balances: balances(10_000, 100_000) });
    expect(onDebit.accountShort).toBe(false);
  });

  it('without debt the net cash out equals the payout', () => {
    const p = previewHostPayout({ ...input, hostUnpaidWeeks: [], balances: balances(39_999, 0) });
    expect(p).toMatchObject({ offset: 0, netCash: 40_000, kasShort: true });
  });

  it('keeps the remaining debt when it is capped', () => {
    const p = previewHostPayout({ ...input, hostUnpaidWeeks: [1, 2, 3, 4].map((week) => ({ week, amount: 15_000 })), balances: balances(0, 0) });
    expect(p).toMatchObject({ payout: 40_000, offset: 40_000, netCash: 0, remainingDebt: 20_000, kasShort: false });
  });
});
