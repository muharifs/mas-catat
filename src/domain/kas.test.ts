import { DomainError } from './money';
import {
  applyEntry,
  assertEntryDate,
  buildKasEntry,
  computeKasBalances,
  entryEffects,
  hasNoPos,
  negativeAfter,
  previewKasEntry,
  type BalanceEntry,
} from './kas';

const plain = (direction: 'in' | 'out', amount: number, account: BalanceEntry['account']): BalanceEntry => ({
  direction,
  amount,
  account,
});
const move = (amount: number, account: BalanceEntry['account'], toAccount: BalanceEntry['toAccount']): BalanceEntry => ({
  direction: 'out',
  amount,
  account,
  toAccount,
});

describe('computeKasBalances', () => {
  it('is all zero without entries', () => {
    expect(computeKasBalances([])).toEqual({ tunai: 0, debit: 0, piutang: 0, actual: 0 });
  });

  it('sums mixed entries per pos; actual kas is Tunai + Debit only', () => {
    const b = computeKasBalances([
      plain('in', 100_000, 'tunai'), // opening balance or payment
      plain('in', 50_000, 'debit'),
      plain('in', 20_000, 'piutang'), // opening Piutang
      plain('out', 40_000, 'tunai'), // payout
      plain('in', 15_000, 'tunai'), // offset
      plain('out', 10_000, 'debit'), // shared goal
    ]);
    expect(b).toEqual({ tunai: 75_000, debit: 40_000, piutang: 20_000, actual: 115_000 });
  });

  it('moves money in both directions between Tunai and Debit with ONE entry each', () => {
    const start = [plain('in', 100_000, 'tunai')];
    expect(computeKasBalances([...start, move(30_000, 'tunai', 'debit')])).toMatchObject({ tunai: 70_000, debit: 30_000, actual: 100_000 });
    expect(computeKasBalances([...start, move(30_000, 'tunai', 'debit'), move(10_000, 'debit', 'tunai')])).toMatchObject({
      tunai: 80_000,
      debit: 20_000,
      actual: 100_000,
    });
  });

  it('a loan moves money from Tunai/Debit to Piutang; a repayment brings it back to Tunai', () => {
    const entries = [plain('in', 200_000, 'debit'), move(50_000, 'debit', 'piutang')];
    expect(computeKasBalances(entries)).toEqual({ tunai: 0, debit: 150_000, piutang: 50_000, actual: 150_000 });
    expect(computeKasBalances([...entries, move(20_000, 'piutang', 'tunai')])).toEqual({
      tunai: 20_000,
      debit: 150_000,
      piutang: 30_000,
      actual: 170_000,
    });
  });

  it('ignores entries without a pos (account null), plain or move', () => {
    const b = computeKasBalances([plain('out', 40_000, null), plain('in', 15_000, null), move(5_000, null, 'tunai'), plain('in', 1_000, 'tunai')]);
    expect(b).toEqual({ tunai: 1_000, debit: 0, piutang: 0, actual: 1_000 });
    expect(hasNoPos({ account: null })).toBe(true);
    expect(hasNoPos({ account: 'tunai' })).toBe(false);
  });

  it('can go negative (a warning for the owner, not an error)', () => {
    expect(computeKasBalances([plain('out', 5_000, 'tunai')]).tunai).toBe(-5_000);
  });
});

describe('entryEffects, applyEntry, negativeAfter', () => {
  it('describes the change per pos', () => {
    expect(entryEffects(move(7_000, 'tunai', 'debit'))).toEqual({ tunai: -7_000, debit: 7_000, piutang: 0 });
    expect(entryEffects(plain('out', 7_000, 'debit'))).toEqual({ tunai: 0, debit: -7_000, piutang: 0 });
    expect(entryEffects(plain('in', 7_000, null))).toEqual({ tunai: 0, debit: 0, piutang: 0 });
  });

  it('reports only the pos that the entry itself pushes below zero', () => {
    const before = computeKasBalances([plain('in', 10_000, 'tunai'), plain('out', 3_000, 'debit')]); // debit already -3.000
    expect(applyEntry(before, plain('out', 4_000, 'tunai')).tunai).toBe(6_000);
    expect(negativeAfter(before, plain('out', 4_000, 'tunai'))).toEqual([]);
    expect(negativeAfter(before, plain('out', 12_000, 'tunai'))).toEqual(['tunai']);
    expect(negativeAfter(before, plain('in', 1_000, 'debit'))).toEqual([]);
  });
});

describe('buildKasEntry', () => {
  const base = { date: '2026-01-04', amount: 50_000 };

  it('opening balance: cash in on any of the three pos', () => {
    for (const account of ['tunai', 'debit', 'piutang'] as const) {
      expect(buildKasEntry({ ...base, kind: 'opening_balance', account, memberId: account === 'piutang' ? 'm1' : null })).toMatchObject({
        type: 'opening_balance',
        direction: 'in',
        account,
        toAccount: null,
        memberId: account === 'piutang' ? 'm1' : null,
      });
    }
    expect(() => buildKasEntry({ ...base, kind: 'opening_balance' })).toThrow(DomainError);
  });

  it('transfer: one entry, Tunai to Debit or Debit to Tunai, never to itself or to Piutang', () => {
    expect(buildKasEntry({ ...base, kind: 'transfer', account: 'tunai', toAccount: 'debit' })).toMatchObject({
      type: 'transfer',
      direction: 'out',
      account: 'tunai',
      toAccount: 'debit',
    });
    expect(buildKasEntry({ ...base, kind: 'transfer', account: 'debit', toAccount: 'tunai' })).toMatchObject({ account: 'debit', toAccount: 'tunai' });
    expect(() => buildKasEntry({ ...base, kind: 'transfer', account: 'tunai', toAccount: 'tunai' })).toThrow(DomainError);
    expect(() => buildKasEntry({ ...base, kind: 'transfer', account: 'tunai', toAccount: 'piutang' })).toThrow(DomainError);
    expect(() => buildKasEntry({ ...base, kind: 'transfer', account: 'piutang', toAccount: 'tunai' })).toThrow(DomainError);
  });

  it('loan: from Tunai/Debit into Piutang with a member, no interest or deadline fields', () => {
    const e = buildKasEntry({ ...base, kind: 'loan', account: 'debit', memberId: 'm1' });
    expect(e).toMatchObject({ type: 'loan', direction: 'out', account: 'debit', toAccount: 'piutang', memberId: 'm1' });
    expect(() => buildKasEntry({ ...base, kind: 'loan', account: 'debit' })).toThrow(/member/);
    expect(() => buildKasEntry({ ...base, kind: 'loan', account: 'piutang', memberId: 'm1' })).toThrow(DomainError);
  });

  it('repayment: Piutang to Tunai always, whatever the input says', () => {
    const e = buildKasEntry({ ...base, kind: 'loan_repayment', account: 'debit', toAccount: 'debit', memberId: 'm1' });
    expect(e).toMatchObject({ type: 'loan_repayment', account: 'piutang', toAccount: 'tunai', memberId: 'm1' });
    expect(() => buildKasEntry({ ...base, kind: 'loan_repayment' })).toThrow(/member/);
  });

  it('shared goal: plain cash out that needs a note', () => {
    expect(buildKasEntry({ ...base, kind: 'shared_goal', account: 'tunai', note: '  Tur ke Bali ' })).toMatchObject({
      type: 'shared_goal',
      direction: 'out',
      account: 'tunai',
      toAccount: null,
      note: 'Tur ke Bali',
    });
    expect(() => buildKasEntry({ ...base, kind: 'shared_goal', account: 'tunai', note: '   ' })).toThrow(/note/);
    expect(() => buildKasEntry({ ...base, kind: 'shared_goal', account: 'piutang', note: 'x' })).toThrow(DomainError);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the amount %s', (amount) => {
    expect(() => buildKasEntry({ kind: 'opening_balance', account: 'tunai', date: '2026-01-04', amount })).toThrow(DomainError);
  });

  it('accepts amounts that are not multiples of 15.000', () => {
    expect(buildKasEntry({ kind: 'opening_balance', account: 'tunai', date: '2026-01-04', amount: 12_345 }).amount).toBe(12_345);
  });
});

describe('previewKasEntry', () => {
  it('shows balances after the entry and warns about a pos that goes negative', () => {
    const before = computeKasBalances([plain('in', 20_000, 'tunai')]);
    const ok = previewKasEntry({ kind: 'transfer', date: '2026-01-04', amount: 15_000, account: 'tunai', toAccount: 'debit' }, before);
    expect(ok.after).toMatchObject({ tunai: 5_000, debit: 15_000 });
    expect(ok.negativeAccounts).toEqual([]);
    const short = previewKasEntry({ kind: 'shared_goal', date: '2026-01-04', amount: 25_000, account: 'tunai', note: 'tur' }, before);
    expect(short.negativeAccounts).toEqual(['tunai']);
  });
});

describe('assertEntryDate', () => {
  it('accepts today and the past; rejects the future and fake dates', () => {
    expect(() => assertEntryDate('2026-01-04', '2026-01-04')).not.toThrow();
    expect(() => assertEntryDate('2025-12-31', '2026-01-04')).not.toThrow();
    expect(() => assertEntryDate('2026-01-05', '2026-01-04')).toThrow(/in the future/);
    expect(() => assertEntryDate('2026-02-31', '2026-03-01')).toThrow(/real calendar date/);
    expect(() => assertEntryDate('04-01-2026', '2026-01-04')).toThrow(DomainError);
  });
});
