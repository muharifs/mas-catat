// Cash-flow classification of ledger entries (Riwayat). Pure functions, integer rupiah only.
// ONE sign rule (cashFlowSign) is used by the row sign in Riwayat / the entry detail AND by the monthly summary,
// so a row shown with "+" or "-" and the summary can never disagree (except the documented opening balance case).
import { assertRupiah, DomainError } from './money';
import type { Account, IsoDate, LedgerEntryType, Rupiah } from './types';

export interface FlowSignInput {
  direction: 'in' | 'out';
  account: Account | null;
  toAccount: Account | null;
  type?: LedgerEntryType;
}

/**
 * "+" for money that enters Tunai or Debit, "-" for money that leaves one, "" when no cash balance really gains or
 * loses: a move between pos (transfer, loan, repayment), a write-off (no balance change), an entry without a pos,
 * and an entry in Piutang (an old loan, not cash).
 */
export function cashFlowSign(e: FlowSignInput): '+' | '-' | '' {
  if (e.type === 'debt_writeoff' || e.account === null || e.account === 'piutang' || e.toAccount) return '';
  return e.direction === 'in' ? '+' : '-';
}

export interface FlowSummaryEntry extends FlowSignInput {
  id: string;
  type: LedgerEntryType;
  date: IsoDate;
  amount: Rupiah;
  reversesEntryId: string | null;
}

export interface MonthSummary {
  moneyIn: Rupiah;
  moneyOut: Rupiah;
}

/**
 * Types that carry a row sign but are NOT counted in the summary. An opening balance is a starting point, not income
 * (its row still shows a green "+"); a reversal is left out together with the entry it cancels.
 */
const NOT_COUNTED: readonly LedgerEntryType[] = ['opening_balance', 'reversal'];

/** "YYYY-MM" of an ISO date, taken from the text itself (no Date object, so no timezone drift). */
export function monthOfDate(date: IsoDate): string {
  return date.slice(0, 7);
}

/**
 * Pemasukan and Pengeluaran of one calendar month ("YYYY-MM"). Takes ALL entries, because a correction made in another
 * month cancels its original in the original's own month. A corrected entry and its reversal are both left out.
 * The entry date counts (not the creation time). Sign "+" counts as moneyIn, "-" as moneyOut.
 */
export function summarizeMonth(entries: readonly FlowSummaryEntry[], month: string): MonthSummary {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new DomainError(`month must be YYYY-MM, got ${month}`);
  const reversedIds = new Set<string>();
  for (const e of entries) if (e.type === 'reversal' && e.reversesEntryId) reversedIds.add(e.reversesEntryId);

  let moneyIn = 0;
  let moneyOut = 0;
  for (const e of entries) {
    if (monthOfDate(e.date) !== month) continue;
    if (NOT_COUNTED.includes(e.type) || reversedIds.has(e.id)) continue;
    const sign = cashFlowSign(e);
    if (sign === '') continue;
    assertRupiah(e.amount, 'amount');
    if (sign === '+') moneyIn += e.amount;
    else moneyOut += e.amount;
  }
  return { moneyIn, moneyOut };
}
