import { computeKasBalances, entryEffects } from './kas';
import { DomainError } from './money';
import { buildReversal, requireReason, type ReversibleEntry } from './reversal';

const entry = (over: Partial<ReversibleEntry>): ReversibleEntry => ({
  id: 'e1',
  type: 'member_payment',
  direction: 'in',
  amount: 45_000,
  memberId: 'm1',
  week: null,
  account: 'tunai',
  toAccount: null,
  ...over,
});
const date = '2026-02-01';

describe('buildReversal', () => {
  it('flips in to out and out to in on the same pos (payment, offset, payout, opening balance, shared goal)', () => {
    expect(buildReversal(entry({ direction: 'in' }), { reason: 'salah ketik', date })).toMatchObject({
      type: 'reversal',
      direction: 'out',
      amount: 45_000,
      account: 'tunai',
      toAccount: null,
      memberId: 'm1',
      reversesEntryId: 'e1',
      correctionReason: 'salah ketik',
      date,
    });
    expect(buildReversal(entry({ type: 'host_payout', direction: 'out', week: 3, account: 'debit' }), { reason: 'x', date })).toMatchObject({
      direction: 'in',
      account: 'debit',
      week: 3,
    });
    expect(buildReversal(entry({ type: 'host_offset', direction: 'in' }), { reason: 'x', date }).direction).toBe('out');
    expect(buildReversal(entry({ type: 'opening_balance', direction: 'in', account: 'piutang' }), { reason: 'x', date })).toMatchObject({
      direction: 'out',
      account: 'piutang',
    });
    expect(buildReversal(entry({ type: 'shared_goal', direction: 'out', memberId: null }), { reason: 'x', date }).direction).toBe('in');
  });

  it('swaps source and destination of a move entry (transfer, loan, repayment) and keeps direction out', () => {
    const transfer = buildReversal(entry({ type: 'transfer', direction: 'out', account: 'tunai', toAccount: 'debit', memberId: null }), { reason: 'x', date });
    expect(transfer).toMatchObject({ direction: 'out', account: 'debit', toAccount: 'tunai' });
    const loan = buildReversal(entry({ type: 'loan', direction: 'out', account: 'debit', toAccount: 'piutang' }), { reason: 'x', date });
    expect(loan).toMatchObject({ account: 'piutang', toAccount: 'debit', memberId: 'm1' });
    const repayment = buildReversal(entry({ type: 'loan_repayment', direction: 'out', account: 'piutang', toAccount: 'tunai' }), { reason: 'x', date });
    expect(repayment).toMatchObject({ account: 'tunai', toAccount: 'piutang' });
  });

  it('cancels the balance effect of every kind exactly', () => {
    const originals = [
      entry({ direction: 'in', account: 'debit' }),
      entry({ type: 'host_payout', direction: 'out', account: 'tunai', amount: 40_000 }),
      entry({ type: 'transfer', direction: 'out', account: 'tunai', toAccount: 'debit' }),
      entry({ type: 'loan', direction: 'out', account: 'debit', toAccount: 'piutang' }),
      entry({ type: 'loan_repayment', direction: 'out', account: 'piutang', toAccount: 'tunai' }),
    ];
    for (const o of originals) {
      const r = buildReversal(o, { reason: 'x', date });
      const net = computeKasBalances([
        { direction: o.direction, amount: o.amount, account: o.account, toAccount: o.toAccount },
        { direction: r.direction, amount: r.amount, account: r.account ?? null, toAccount: r.toAccount ?? null },
      ]);
      expect(net).toEqual({ tunai: 0, debit: 0, piutang: 0, actual: 0 });
      expect(entryEffects({ direction: r.direction, amount: r.amount, account: r.account ?? null, toAccount: r.toAccount ?? null })).not.toEqual({
        tunai: 0,
        debit: 0,
        piutang: 0,
      });
    }
  });

  it('keeps an entry without a pos without a pos', () => {
    expect(buildReversal(entry({ account: null }), { reason: 'x', date })).toMatchObject({ account: null, toAccount: null });
  });

  it('requires a reason, trims it, and refuses to reverse a reversal', () => {
    expect(() => buildReversal(entry({}), { reason: '', date })).toThrow(DomainError);
    expect(() => buildReversal(entry({}), { reason: '   ', date })).toThrow(/reason is required/);
    expect(buildReversal(entry({}), { reason: '  salah orang ', date }).correctionReason).toBe('salah orang');
    expect(() => buildReversal(entry({ type: 'reversal' }), { reason: 'x', date })).toThrow(/cannot be reversed/);
    expect(() => buildReversal(entry({}), { reason: 'x', date: 'kemarin' })).toThrow(DomainError);
  });

  it('does not change its input', () => {
    const original = entry({ type: 'transfer', direction: 'out', account: 'tunai', toAccount: 'debit' });
    const copy = { ...original };
    buildReversal(original, { reason: 'x', date });
    expect(original).toEqual(copy);
  });
});

describe('requireReason', () => {
  it('returns the trimmed text or throws', () => {
    expect(requireReason(' ok ')).toBe('ok');
    expect(() => requireReason('')).toThrow(DomainError);
  });
});
