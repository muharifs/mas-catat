// Pure helpers of the entry detail screen (kas/[entryId]). Display decisions only: which status the entry has,
// whether the member's remaining loan is shown, and the lines for the meetings a payment paid. No money is computed.
import { isLoanEntry } from '@/domain/loans';
import type { Account, Allocation, LedgerEntryType } from '@/domain/types';
import { todayIso } from './dates';
import type { BadgeTone } from './components/Badge';

export interface EntryStatus {
  label: 'Tercatat' | 'Dikoreksi' | 'Koreksi';
  tone: BadgeTone;
}

/** Tercatat = in force; Dikoreksi = an original that was cancelled; Koreksi = the reversal entry itself. */
export function entryStatus(e: { type: LedgerEntryType; reversedById: string | null }): EntryStatus {
  if (e.type === 'reversal') return { label: 'Koreksi', tone: 'warn' };
  if (e.reversedById) return { label: 'Dikoreksi', tone: 'error' };
  return { label: 'Tercatat', tone: 'neutral' };
}

interface LoanProbe {
  type: LedgerEntryType;
  memberId: string | null;
  account: Account | null;
}

/**
 * Member whose remaining loan the detail shows, or null. A loan, a repayment and a Piutang opening balance that names
 * a member qualify; a reversal counts by its original's type (the same rule as the loan balance itself).
 */
export function loanMemberOf(e: LoanProbe, original: LoanProbe | null): string | null {
  const source = e.type === 'reversal' ? original : e;
  if (!source || !isLoanEntry(source)) return null;
  return e.memberId ?? source.memberId;
}

/** "Pertemuan 3" lines of a payment: one per allocation, oldest week first. */
export function paidMeetingRows(allocations: readonly Allocation[]): { week: number; amount: number; label: string }[] {
  return [...allocations]
    .sort((a, b) => a.week - b.week)
    .map((a) => ({ week: a.week, amount: a.amount, label: `Pertemuan ${a.week}` }));
}

/** Local calendar date on which an entry was written, from its created-at timestamp. */
export function createdDate(createdAt: string): string {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? createdAt : todayIso(d);
}
