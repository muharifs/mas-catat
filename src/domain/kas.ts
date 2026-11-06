// Kas (group cash) across pos: Tunai, Debit and Piutang. Pure functions, integer rupiah only.
//
// ONE function (computeKasBalances) turns ledger entries into balances, and every screen uses it. Balances are
// global: they sum all entries of all periods.
//
// Entry shapes:
// - Plain entry: direction 'in' adds to `account`, 'out' subtracts from it.
// - Move entry (transfer, loan, loan_repayment): ONE entry with direction 'out', `account` = source and
//   `toAccount` = destination. The amount leaves the source and arrives at the destination.
// - An entry whose `account` is null (written before pos existed) never changes a balance.
import { assertRepaymentWithinLoan } from './loans';
import { assertPositiveInt, assertIsoDate, DomainError } from './money';
import { isRealDate } from './schedule';
import type { Account, IsoDate, LedgerEntry, Rupiah } from './types';

export interface KasBalances {
  tunai: Rupiah;
  debit: Rupiah;
  /** Money lent to members that has not come back yet. */
  piutang: Rupiah;
  /** Actual kas = Tunai + Debit (Piutang is not in hand). */
  actual: Rupiah;
}

/** The fields of a ledger entry that matter for balances. */
export interface BalanceEntry {
  direction: 'in' | 'out';
  amount: Rupiah;
  account: Account | null;
  toAccount?: Account | null;
}

export const ACCOUNTS: readonly Account[] = ['tunai', 'debit', 'piutang'];
export const ACCOUNT_LABELS: Record<Account, string> = { tunai: 'Tunai', debit: 'Debit', piutang: 'Piutang' };

/** Change one entry makes to each pos (zero for pos it does not touch). */
export function entryEffects(entry: BalanceEntry): Record<Account, Rupiah> {
  const effects: Record<Account, Rupiah> = { tunai: 0, debit: 0, piutang: 0 };
  if (entry.account === null) return effects; // no pos: balances ignore it
  if (entry.toAccount) {
    effects[entry.account] -= entry.amount;
    effects[entry.toAccount] += entry.amount;
  } else {
    effects[entry.account] += entry.direction === 'in' ? entry.amount : -entry.amount;
  }
  return effects;
}

function toBalances(sums: Record<Account, Rupiah>): KasBalances {
  return { tunai: sums.tunai, debit: sums.debit, piutang: sums.piutang, actual: sums.tunai + sums.debit };
}

/** Balances of all pos from all entries (reversals are entries too, so a corrected entry nets to zero). */
export function computeKasBalances(entries: readonly BalanceEntry[]): KasBalances {
  const sums: Record<Account, Rupiah> = { tunai: 0, debit: 0, piutang: 0 };
  for (const e of entries) {
    const effects = entryEffects(e);
    for (const a of ACCOUNTS) sums[a] += effects[a];
  }
  return toBalances(sums);
}

/** Balances after applying `entry` on top of `before` (used for warnings before saving). */
export function applyEntry(before: KasBalances, entry: BalanceEntry): KasBalances {
  const effects = entryEffects(entry);
  return toBalances({
    tunai: before.tunai + effects.tunai,
    debit: before.debit + effects.debit,
    piutang: before.piutang + effects.piutang,
  });
}

/** Pos that would be below zero after `entry`. Only pos the entry touches count (an old negative stays quiet). */
export function negativeAfter(before: KasBalances, entry: BalanceEntry): Account[] {
  const after = applyEntry(before, entry);
  const effects = entryEffects(entry);
  return ACCOUNTS.filter((a) => effects[a] < 0 && after[a] < 0);
}

/** True for a cash entry that has no pos: it is shown with a "tanpa pos" warning and does not change balances. */
export function hasNoPos(entry: { account: Account | null }): boolean {
  return entry.account === null;
}

/**
 * Entry date for kas entries and payouts: a real calendar date, today or earlier. `today` is the device date
 * as ISO; the caller supplies it so this stays pure.
 */
export function assertEntryDate(date: IsoDate, today: IsoDate): void {
  assertIsoDate(date, 'entry date');
  if (!isRealDate(date)) throw new DomainError(`entry date is not a real calendar date: ${date}`);
  assertIsoDate(today, 'today');
  if (date > today) throw new DomainError(`entry date is in the future: ${date}`);
}

export type KasKind = 'opening_balance' | 'transfer' | 'loan' | 'loan_repayment' | 'shared_goal';

export const KAS_KINDS: readonly KasKind[] = ['opening_balance', 'transfer', 'loan', 'loan_repayment', 'shared_goal'];

export interface KasEntryInput {
  kind: KasKind;
  date: IsoDate;
  amount: Rupiah;
  /** Source pos (opening_balance: the pos that is filled). Ignored for loan_repayment (always Piutang). */
  account?: Account | null;
  /** Destination pos. Only transfer uses it; loan and repayment have a fixed destination. */
  toAccount?: Account | null;
  /** Required for loan, loan_repayment and an opening balance in Piutang (an old loan). Ignored for other opening balances. */
  memberId?: string | null;
  /** Required for shared_goal. */
  note?: string;
}

const isCashPos = (a: Account | null | undefined): a is 'tunai' | 'debit' => a === 'tunai' || a === 'debit';

/**
 * Builds the ONE ledger entry for a kas action and checks its shape. Amounts may be any positive integer
 * (the multiple-of-15.000 rule is only for member payments). No interest or deadline exists for loans.
 */
export function buildKasEntry(input: KasEntryInput): LedgerEntry {
  assertPositiveInt(input.amount, 'amount');
  assertIsoDate(input.date, 'entry date');
  const note = (input.note ?? '').trim();
  const memberId = input.memberId ?? null;
  const base = { date: input.date, amount: input.amount, week: null, note };

  switch (input.kind) {
    case 'opening_balance': {
      if (!input.account || !ACCOUNTS.includes(input.account)) throw new DomainError('opening balance needs a pos');
      // In Piutang an opening balance is an old loan and must name the member. Tunai and Debit never have a member.
      if (input.account === 'piutang' && !memberId) throw new DomainError('an opening balance in piutang needs a member');
      const openingMember = input.account === 'piutang' ? memberId : null;
      return { ...base, type: 'opening_balance', direction: 'in', memberId: openingMember, account: input.account, toAccount: null };
    }

    case 'transfer':
      if (!isCashPos(input.account) || !isCashPos(input.toAccount) || input.account === input.toAccount) {
        throw new DomainError('transfer must go between tunai and debit');
      }
      return { ...base, type: 'transfer', direction: 'out', memberId: null, account: input.account, toAccount: input.toAccount };

    case 'loan':
      if (!isCashPos(input.account)) throw new DomainError('a loan must be paid from tunai or debit');
      if (!memberId) throw new DomainError('a loan needs a member');
      return { ...base, type: 'loan', direction: 'out', memberId, account: input.account, toAccount: 'piutang' };

    case 'loan_repayment':
      if (!memberId) throw new DomainError('a loan repayment needs a member');
      return { ...base, type: 'loan_repayment', direction: 'out', memberId, account: 'piutang', toAccount: 'tunai' };

    case 'shared_goal':
      if (!isCashPos(input.account)) throw new DomainError('shared goal spending must come from tunai or debit');
      if (note.length === 0) throw new DomainError('shared goal needs a note');
      return { ...base, type: 'shared_goal', direction: 'out', memberId: null, account: input.account, toAccount: null };
  }
}

export interface KasEntryPreview {
  entry: LedgerEntry;
  before: KasBalances;
  after: KasBalances;
  /** Pos that would end below zero. A warning, never a block. */
  negativeAccounts: Account[];
  /** The member's remaining loan before / after this entry; null when the entry does not touch a member's loan. */
  loanRemainingBefore: Rupiah | null;
  loanRemainingAfter: Rupiah | null;
}

/**
 * What saving a kas entry would do to the balances. `memberRemaining` is the member's remaining loan right now
 * (from computeLoanBalances); a repayment is checked against it here, so the check is the same wherever it is used.
 */
export function previewKasEntry(input: KasEntryInput, before: KasBalances, memberRemaining: Rupiah = 0): KasEntryPreview {
  const entry = buildKasEntry(input);
  if (entry.type === 'loan_repayment') assertRepaymentWithinLoan(entry.amount, memberRemaining);
  const be: BalanceEntry = {
    direction: entry.direction,
    amount: entry.amount,
    account: entry.account ?? null,
    toAccount: entry.toAccount ?? null,
  };
  // Loans and named old loans add to what the member owes; a repayment takes away from it.
  let loanDelta: Rupiah | null = null;
  if (entry.memberId) {
    if (entry.type === 'loan' || (entry.type === 'opening_balance' && entry.account === 'piutang')) loanDelta = entry.amount;
    else if (entry.type === 'loan_repayment') loanDelta = -entry.amount;
  }
  return {
    entry,
    before,
    after: applyEntry(before, be),
    negativeAccounts: negativeAfter(before, be),
    loanRemainingBefore: loanDelta === null ? null : memberRemaining,
    loanRemainingAfter: loanDelta === null ? null : memberRemaining + loanDelta,
  };
}
