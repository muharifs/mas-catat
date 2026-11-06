import { buildKasEntry, computeKasBalances, previewKasEntry } from './kas';
import {
  assertLoanReversalAllowed,
  assertRepaymentWithinLoan,
  computeLoanBalances,
  isLoanEntry,
  LoanError,
  loanBalanceOf,
  type LoanEntry,
} from './loans';
import { DomainError } from './money';
import { buildMemberHistory } from './report';
import { buildReversal } from './reversal';

let seq = 0;
const nextId = () => `e${(seq += 1)}`;

type Stored = LoanEntry & { direction: 'in' | 'out' };

const loan = (memberId: string, amount: number, id = nextId()): Stored => ({
  id, type: 'loan', direction: 'out', amount, memberId, account: 'tunai', toAccount: 'piutang', reversesEntryId: null,
});
const repayment = (memberId: string, amount: number, id = nextId()): Stored => ({
  id, type: 'loan_repayment', direction: 'out', amount, memberId, account: 'piutang', toAccount: 'tunai', reversesEntryId: null,
});
const openingLoan = (memberId: string | null, amount: number, id = nextId()): Stored => ({
  id, type: 'opening_balance', direction: 'in', amount, memberId, account: 'piutang', toAccount: null, reversesEntryId: null,
});
const openingCash = (amount: number): Stored => ({
  id: nextId(), type: 'opening_balance', direction: 'in', amount, memberId: null, account: 'tunai', toAccount: null, reversesEntryId: null,
});
/** The reversal of `original`, built by the real domain function. */
const reverse = (original: Stored): Stored => {
  const r = buildReversal(
    { id: original.id, type: original.type, direction: original.direction, amount: original.amount, memberId: original.memberId, week: null, account: original.account, toAccount: original.toAccount },
    { reason: 'salah', date: '2026-01-10' },
  );
  return { id: nextId(), type: 'reversal', direction: r.direction, amount: r.amount, memberId: r.memberId, account: r.account ?? null, toAccount: r.toAccount ?? null, reversesEntryId: original.id };
};

describe('computeLoanBalances', () => {
  it('is empty without entries', () => {
    expect(computeLoanBalances([])).toEqual({ members: [], unnamedOpening: 0, openCount: 0, openRemaining: 0 });
  });

  it('lent minus repaid per member, loans of two periods added together', () => {
    // The period is not part of the input on purpose: balances run over ALL periods.
    const o = computeLoanBalances([loan('a', 300_000), repayment('a', 100_000), loan('a', 50_000), loan('b', 20_000)]);
    expect(loanBalanceOf(o, 'a')).toEqual({ memberId: 'a', lent: 350_000, repaid: 100_000, remaining: 250_000, overpaid: 0 });
    expect(loanBalanceOf(o, 'b').remaining).toBe(20_000);
    expect(o.openCount).toBe(2);
    expect(o.openRemaining).toBe(270_000);
  });

  it('a member who never borrowed has an all-zero balance', () => {
    expect(loanBalanceOf(computeLoanBalances([loan('a', 1_000)]), 'z')).toEqual({ memberId: 'z', lent: 0, repaid: 0, remaining: 0, overpaid: 0 });
  });

  it('counts a reversal by the type of the ORIGINAL entry', () => {
    const l = loan('a', 300_000);
    const r1 = repayment('a', 100_000);
    const o = computeLoanBalances([l, r1, reverse(r1)]);
    // The reversed repayment is not repaid any more: the debt is back to the full loan.
    expect(loanBalanceOf(o, 'a')).toMatchObject({ lent: 300_000, repaid: 0, remaining: 300_000 });
    const gone = computeLoanBalances([l, reverse(l)]);
    expect(loanBalanceOf(gone, 'a')).toMatchObject({ lent: 0, repaid: 0, remaining: 0 });
    expect(gone.openCount).toBe(0);
  });

  it('repayment reversed and then repaid again counts once', () => {
    const l = loan('a', 300_000);
    const r1 = repayment('a', 300_000);
    const o = computeLoanBalances([l, r1, reverse(r1), repayment('a', 200_000)]);
    expect(loanBalanceOf(o, 'a')).toMatchObject({ repaid: 200_000, remaining: 100_000 });
  });

  it('a loan reversed and entered again with another amount', () => {
    const l1 = loan('a', 300_000);
    const o = computeLoanBalances([l1, reverse(l1), loan('a', 250_000)]);
    expect(loanBalanceOf(o, 'a')).toMatchObject({ lent: 250_000, remaining: 250_000 });
  });

  it('a named opening balance in Piutang is an old loan of that member', () => {
    const o = computeLoanBalances([openingLoan('a', 400_000), repayment('a', 100_000)]);
    expect(loanBalanceOf(o, 'a')).toMatchObject({ lent: 400_000, repaid: 100_000, remaining: 300_000 });
    expect(o.unnamedOpening).toBe(0);
  });

  it('an unnamed opening balance in Piutang is kept apart and belongs to nobody', () => {
    const u = openingLoan(null, 90_000);
    const o = computeLoanBalances([u, loan('a', 10_000)]);
    expect(o.unnamedOpening).toBe(90_000);
    expect(o.members.map((m) => m.memberId)).toEqual(['a']);
    expect(o.openRemaining).toBe(10_000);
    expect(computeLoanBalances([u, reverse(u)]).unnamedOpening).toBe(0);
  });

  it('opening balances in Tunai or Debit and a transfer are not loans', () => {
    const o = computeLoanBalances([openingCash(500_000)]);
    expect(o).toEqual({ members: [], unnamedOpening: 0, openCount: 0, openRemaining: 0 });
  });

  it('old data with repayments above the loan shows a negative remaining and overpaid, and is not counted as open', () => {
    const o = computeLoanBalances([loan('a', 100_000), repayment('a', 130_000), loan('b', 5_000)]);
    expect(loanBalanceOf(o, 'a')).toMatchObject({ remaining: -30_000, overpaid: 30_000 });
    expect(o.openCount).toBe(1);
    expect(o.openRemaining).toBe(5_000);
  });

  it('ignores a reversal whose original is unknown', () => {
    const orphan: Stored = { ...reverse(loan('a', 1_000)), reversesEntryId: 'missing' };
    expect(computeLoanBalances([orphan]).members).toEqual([]);
  });

  it('isLoanEntry is true for loans, repayments and Piutang opening balances only', () => {
    expect(isLoanEntry(loan('a', 1))).toBe(true);
    expect(isLoanEntry(repayment('a', 1))).toBe(true);
    expect(isLoanEntry(openingLoan('a', 1))).toBe(true);
    expect(isLoanEntry(openingLoan(null, 1))).toBe(true);
    expect(isLoanEntry(openingCash(1))).toBe(false);
    expect(isLoanEntry(reverse(loan('a', 1)))).toBe(false);
  });

  it('sum of member remaining + unnamed opening equals the Piutang balance of the kas', () => {
    const l1 = loan('a', 300_000);
    const r1 = repayment('a', 120_000);
    const u = openingLoan(null, 75_000);
    const named = openingLoan('b', 40_000);
    const entries = [
      openingCash(1_000_000), l1, r1, reverse(r1), repayment('a', 50_000), loan('c', 10_000), u, named, repayment('b', 70_000), // b overpaid
      loan('d', 5_000), reverse(named),
    ];
    const o = computeLoanBalances(entries);
    const sum = o.members.reduce((t, m) => t + m.remaining, 0) + o.unnamedOpening;
    expect(sum).toBe(computeKasBalances(entries).piutang);
    expect(o.members.some((m) => m.overpaid > 0)).toBe(true); // the case includes old overpaid data
  });
});

describe('assertRepaymentWithinLoan', () => {
  it('accepts any positive amount up to the remaining loan (no multiple of Rp15.000)', () => {
    expect(() => assertRepaymentWithinLoan(1, 300_000)).not.toThrow();
    expect(() => assertRepaymentWithinLoan(12_345, 300_000)).not.toThrow(); // partial
    expect(() => assertRepaymentWithinLoan(300_000, 300_000)).not.toThrow(); // exactly the remainder
  });

  it('rejects one rupiah above the remaining loan, with the remaining in the error', () => {
    try {
      assertRepaymentWithinLoan(300_001, 300_000);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LoanError);
      expect(e).toBeInstanceOf(DomainError);
      expect(e).toMatchObject({ code: 'above_remaining', remaining: 300_000 });
    }
  });

  it('rejects a member with no loan, a settled loan and an overpaid one', () => {
    for (const remaining of [0, -30_000]) {
      expect(() => assertRepaymentWithinLoan(1_000, remaining)).toThrow(expect.objectContaining({ code: 'no_loan' }));
    }
  });

  it('rejects zero, negative and non-integer amounts', () => {
    for (const amount of [0, -1, 1.5]) expect(() => assertRepaymentWithinLoan(amount, 10_000)).toThrow(DomainError);
  });
});

describe('assertLoanReversalAllowed', () => {
  const balance = (lent: number, repaid: number) => loanBalanceOf(computeLoanBalances([loan('a', lent), ...(repaid > 0 ? [repayment('a', repaid)] : [])]), 'a');

  it('allows correcting a loan nobody repaid, and one whose remainder still covers it', () => {
    expect(() => assertLoanReversalAllowed(loan('a', 300_000), balance(300_000, 0))).not.toThrow();
    expect(() => assertLoanReversalAllowed(loan('a', 100_000), balance(400_000, 300_000))).not.toThrow(); // remaining exactly 100.000
  });

  it('rejects when the remaining would go negative, reporting how much was repaid', () => {
    expect(() => assertLoanReversalAllowed(loan('a', 300_000), balance(300_000, 100_000))).toThrow(
      expect.objectContaining({ code: 'reversal_below_zero', repaid: 100_000 }),
    );
    expect(() => assertLoanReversalAllowed(openingLoan('a', 300_000), balance(300_000, 100_000))).toThrow(LoanError);
  });

  it('always allows correcting a repayment, and an unnamed opening balance', () => {
    expect(() => assertLoanReversalAllowed(repayment('a', 100_000), balance(300_000, 300_000))).not.toThrow();
    expect(() => assertLoanReversalAllowed(openingLoan(null, 50_000), balance(0, 0))).not.toThrow();
  });
});

describe('opening balance entry', () => {
  const base = { kind: 'opening_balance' as const, date: '2026-01-04', amount: 100_000 };

  it('in Piutang it must name a member and keeps him', () => {
    expect(() => buildKasEntry({ ...base, account: 'piutang' })).toThrow(/needs a member/);
    expect(buildKasEntry({ ...base, account: 'piutang', memberId: 'a' })).toMatchObject({ account: 'piutang', memberId: 'a', type: 'opening_balance' });
  });

  it('in Tunai or Debit it never has a member, even when one is given', () => {
    for (const account of ['tunai', 'debit'] as const) {
      expect(buildKasEntry({ ...base, account, memberId: 'a' }).memberId).toBeNull();
    }
  });
});

describe('previewKasEntry: loans', () => {
  const kas = { tunai: 0, debit: 0, piutang: 300_000, actual: 0 };
  const repay = (amount: number) => ({ kind: 'loan_repayment' as const, date: '2026-01-04', amount, memberId: 'a' });

  it('gives the remaining loan before and after a repayment', () => {
    const p = previewKasEntry(repay(100_000), kas, 300_000);
    expect(p.loanRemainingBefore).toBe(300_000);
    expect(p.loanRemainingAfter).toBe(200_000);
    expect(p.after.piutang).toBe(200_000);
    expect(previewKasEntry(repay(300_000), kas, 300_000).loanRemainingAfter).toBe(0);
  });

  it('rejects a repayment above the remaining loan, or with no remaining given', () => {
    expect(() => previewKasEntry(repay(300_001), kas, 300_000)).toThrow(expect.objectContaining({ code: 'above_remaining' }));
    expect(() => previewKasEntry(repay(1_000), kas)).toThrow(expect.objectContaining({ code: 'no_loan' }));
  });

  it('a loan and a named old loan raise the remaining; other kas entries have no loan lines', () => {
    const lend = previewKasEntry({ kind: 'loan', date: '2026-01-04', amount: 50_000, account: 'tunai', memberId: 'a' }, kas, 10_000);
    expect([lend.loanRemainingBefore, lend.loanRemainingAfter]).toEqual([10_000, 60_000]);
    const old = previewKasEntry({ kind: 'opening_balance', date: '2026-01-04', amount: 50_000, account: 'piutang', memberId: 'a' }, kas, 0);
    expect(old.loanRemainingAfter).toBe(50_000);
    const cash = previewKasEntry({ kind: 'opening_balance', date: '2026-01-04', amount: 50_000, account: 'tunai' }, kas);
    expect([cash.loanRemainingBefore, cash.loanRemainingAfter]).toEqual([null, null]);
  });
});

describe('member history agrees with the loan page', () => {
  it('a named Piutang opening balance counts in the member total, and corrections are left out', () => {
    const l = loan('a', 100_000);
    const old = openingLoan('a', 400_000);
    const r = repayment('a', 150_000);
    const rr = repayment('a', 7_000);
    const all = [old, l, r, rr, reverse(rr)];
    const toInput = (e: Stored) => ({
      id: e.id, periodId: 'p1', type: e.type, direction: e.direction, date: '2026-01-04', amount: e.amount, week: null,
      account: e.account, reversesEntryId: e.reversesEntryId, correctionReason: e.reversesEntryId ? 'salah' : null,
    });
    const h = buildMemberHistory({ periodId: 'p1', statuses: [], weeks: [], payments: [], entries: all.map(toInput), applications: [], offsetCredits: [] });
    expect(h.loans.map((x) => x.kind)).toEqual(['opening_loan', 'loan', 'loan_repayment', 'loan_repayment']);
    expect(h.totals.piutang).toBe(350_000);
    expect(h.totals.piutang).toBe(loanBalanceOf(computeLoanBalances(all), 'a').remaining);
  });
});
