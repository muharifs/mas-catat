// Corrections of the append-only ledger: a reversal entry cancels an earlier entry; the original is never touched.
// The "new, correct entry" is then entered again through the normal form. Pure.
import { assertIsoDate, DomainError } from './money';
import type { Account, IsoDate, LedgerEntry, LedgerEntryType, Rupiah } from './types';

/** The fields of a stored entry that a reversal is built from. */
export interface ReversibleEntry {
  id: string;
  type: LedgerEntryType;
  direction: 'in' | 'out';
  amount: Rupiah;
  memberId: string | null;
  week: number | null;
  account: Account | null;
  toAccount: Account | null;
}

export interface Reversal extends LedgerEntry {
  type: 'reversal';
  reversesEntryId: string;
  correctionReason: string;
}

/** Kas entry types that can be reversed directly from the kas detail screen. */
export const DIRECTLY_REVERSIBLE_TYPES: readonly LedgerEntryType[] = [
  'opening_balance',
  'transfer',
  'loan',
  'loan_repayment',
  'shared_goal',
];

/** Trims the reason and requires it to be non-empty. */
export function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new DomainError('correction reason is required');
  return trimmed;
}

/**
 * Builds the reversal of `original`: same amount, opposite effect.
 * - Plain entry: direction flipped (in becomes out, out becomes in), same pos.
 * - Move entry (toAccount set): source and destination swapped; direction stays 'out'.
 * - Member, week and pos are copied, so the entry still shows up in the same member/week/pos reports.
 * - reversesEntryId points at the original; correctionReason is required.
 * A reversal itself cannot be reversed (enter the entry again instead). Whether the original was already
 * reversed is checked by the repository and by a unique index in the database.
 */
export function buildReversal(original: ReversibleEntry, input: { reason: string; date: IsoDate }): Reversal {
  if (original.type === 'reversal') throw new DomainError('a reversal cannot be reversed');
  assertIsoDate(input.date, 'reversal date');
  const correctionReason = requireReason(input.reason);
  const isMove = original.toAccount !== null;
  return {
    type: 'reversal',
    direction: isMove ? original.direction : original.direction === 'in' ? 'out' : 'in',
    date: input.date,
    amount: original.amount,
    memberId: original.memberId,
    week: original.week,
    note: '',
    account: isMove ? original.toAccount : original.account,
    toAccount: isMove ? original.account : null,
    reversesEntryId: original.id,
    correctionReason,
  };
}
