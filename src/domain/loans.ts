// Member loans (Piutang). Pure functions, integer rupiah only.
//
// Remaining loan of a member = lent - repaid, over ALL periods, after corrections.
// - lent    = loan entries + opening balances in Piutang that name the member
// - repaid  = loan repayment entries
// A reversal entry (type 'reversal') cancels its original, so it is counted by the ORIGINAL entry's type, found
// through reversesEntryId.
// - An opening balance in Piutang WITHOUT a member (written before loans were tied to members) is kept apart as
//   `unnamedOpening`: it is part of the Piutang balance but belongs to no one, so nobody can repay it.
// - Old data may hold repayments above the loan. The ledger is never rewritten, so such a member shows a NEGATIVE
//   remaining and `overpaid` > 0; such a member cannot repay anything more.
//
// Invariant (tested): sum of all remaining + unnamedOpening = computeKasBalances(...).piutang.
import { assertPositiveInt, DomainError } from './money';
import type { Account, LedgerEntryType, Rupiah } from './types';

/** The fields of a stored entry that loan balances are computed from. */
export interface LoanEntry {
  id: string;
  type: LedgerEntryType;
  amount: Rupiah;
  memberId: string | null;
  account: Account | null;
  toAccount: Account | null;
  reversesEntryId: string | null;
}

export interface LoanBalance {
  memberId: string;
  lent: Rupiah;
  repaid: Rupiah;
  /** lent - repaid. Positive = still owes; 0 = settled; negative = old data repaid more than was lent. */
  remaining: Rupiah;
  /** Amount repaid above the loan (0 unless remaining is negative). */
  overpaid: Rupiah;
}

export interface LoanOverview {
  /** Every member with any loan activity, in no particular order (screens sort A-Z by name). */
  members: LoanBalance[];
  /** Old opening balance in Piutang without a member (net of corrections). Cannot be repaid. */
  unnamedOpening: Rupiah;
  /** Members that can repay (remaining > 0). */
  openCount: number;
  /** Sum of remaining over those members. */
  openRemaining: Rupiah;
}

export type LoanErrorCode = 'no_loan' | 'above_remaining' | 'reversal_below_zero';

/** A loan rule was broken. The code and numbers let a screen build a precise message; message stays English. */
export class LoanError extends DomainError {
  constructor(
    public readonly code: LoanErrorCode,
    message: string,
    public readonly remaining: Rupiah,
    /** Total the member repaid so far (reversal_below_zero). */
    public readonly repaid: Rupiah = 0,
  ) {
    super(message);
    this.name = 'LoanError';
  }
}

type Bucket = 'lent' | 'repaid' | 'unnamed';

/** Where an ORIGINAL entry counts, or null when it has nothing to do with loans. */
function bucketOf(e: Pick<LoanEntry, 'type' | 'memberId' | 'account'>): Bucket | null {
  if (e.type === 'loan') return 'lent';
  if (e.type === 'loan_repayment') return 'repaid';
  if (e.type === 'opening_balance' && e.account === 'piutang') return e.memberId ? 'lent' : 'unnamed';
  return null;
}

/** True for the entries that make up a member's loan history (originals only, not their reversals). */
export function isLoanEntry(e: Pick<LoanEntry, 'type' | 'memberId' | 'account'>): boolean {
  return bucketOf(e) !== null;
}

/** Loan balances of every member plus the unnamed opening Piutang, from all entries of all periods. */
export function computeLoanBalances(entries: readonly LoanEntry[]): LoanOverview {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const lent = new Map<string, Rupiah>();
  const repaid = new Map<string, Rupiah>();
  let unnamedOpening = 0;

  const add = (map: Map<string, Rupiah>, id: string, delta: Rupiah) => map.set(id, (map.get(id) ?? 0) + delta);

  for (const e of entries) {
    let source: LoanEntry = e;
    let sign = 1;
    if (e.type === 'reversal') {
      const original = e.reversesEntryId ? byId.get(e.reversesEntryId) : undefined;
      if (!original) continue; // cannot tell what it cancels
      source = original;
      sign = -1;
    }
    const bucket = bucketOf(source);
    if (bucket === null) continue;
    const delta = sign * e.amount;
    if (bucket === 'unnamed') unnamedOpening += delta;
    else if (source.memberId) add(bucket === 'lent' ? lent : repaid, source.memberId, delta);
  }

  const ids = new Set([...lent.keys(), ...repaid.keys()]);
  const members: LoanBalance[] = [...ids].map((memberId) => makeBalance(memberId, lent.get(memberId) ?? 0, repaid.get(memberId) ?? 0));
  const open = members.filter((m) => m.remaining > 0);
  return {
    members,
    unnamedOpening,
    openCount: open.length,
    openRemaining: open.reduce((t, m) => t + m.remaining, 0),
  };
}

function makeBalance(memberId: string, lent: Rupiah, repaid: Rupiah): LoanBalance {
  const remaining = lent - repaid;
  return { memberId, lent, repaid, remaining, overpaid: remaining < 0 ? -remaining : 0 };
}

/** Balance of one member (all zero when the member never borrowed). */
export function loanBalanceOf(overview: LoanOverview, memberId: string): LoanBalance {
  return overview.members.find((m) => m.memberId === memberId) ?? makeBalance(memberId, 0, 0);
}

/**
 * A repayment must belong to a member who still owes something, and may not be more than the remaining loan.
 * Any positive amount up to the remaining is fine (partial repayments allowed; no multiple of Rp15.000 here).
 */
export function assertRepaymentWithinLoan(amount: Rupiah, remaining: Rupiah): void {
  assertPositiveInt(amount, 'amount');
  if (remaining <= 0) throw new LoanError('no_loan', 'the member has no outstanding loan to repay', remaining);
  if (amount > remaining) {
    throw new LoanError('above_remaining', `repayment ${amount} is above the remaining loan ${remaining}`, remaining);
  }
}

/**
 * Correcting a loan (or a named Piutang opening balance) takes `amount` away from what was lent, so it is refused
 * when the member's remaining would go below zero. Correcting a repayment is always fine, and so is an unnamed
 * opening balance (no member to go negative).
 */
export function assertLoanReversalAllowed(
  original: Pick<LoanEntry, 'type' | 'memberId' | 'account' | 'amount'>,
  balance: LoanBalance,
): void {
  if (bucketOf(original) !== 'lent' || !original.memberId) return;
  if (balance.remaining - original.amount < 0) {
    throw new LoanError(
      'reversal_below_zero',
      `loan cannot be corrected: the member already repaid ${balance.repaid}; correct the repayment first`,
      balance.remaining,
      balance.repaid,
    );
  }
}
