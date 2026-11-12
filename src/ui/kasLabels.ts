// Indonesian display text for ledger entries. Display only: no money is computed here.
import { cashFlowSign } from '@/domain/flow';
import { ACCOUNT_LABELS, type KasKind } from '@/domain/kas';
import { DIRECTLY_REVERSIBLE_TYPES } from '@/domain/reversal';
import type { Account, LedgerEntryType } from '@/domain/types';

export const TYPE_LABELS: Record<LedgerEntryType, string> = {
  member_payment: 'Iuran anggota',
  host_payout: 'Pembayaran tuan rumah',
  host_offset: 'Dipotong dari bayaran tuan rumah',
  opening_balance: 'Saldo awal',
  transfer: 'Pindah saldo',
  loan: 'Pinjaman ke anggota',
  loan_repayment: 'Pelunasan pinjaman',
  shared_goal: 'Pengeluaran bersama',
  debt_writeoff: 'Penghapusan tunggakan',
  credit_refund: 'Pengembalian titipan anggota',
  reversal: 'Koreksi',
};

/** Title of an entry: an opening balance in Piutang is an old loan, so it says so. */
export function entryTitle(e: { type: LedgerEntryType; account: Account | null }): string {
  if (e.type === 'opening_balance' && e.account === 'piutang') return 'Saldo awal: pinjaman lama';
  return TYPE_LABELS[e.type];
}

/** Button and screen names of the kas actions. */
export const KIND_LABELS: Record<KasKind, string> = {
  opening_balance: 'Saldo awal',
  transfer: 'Pindah saldo Tunai / Debit',
  loan: 'Pinjaman ke anggota',
  loan_repayment: 'Pelunasan pinjaman',
  shared_goal: 'Pengeluaran bersama',
};

/** Types whose note is typed by the owner (the others carry system text that is not shown). */
const OWNER_NOTE_TYPES: readonly LedgerEntryType[] = ['opening_balance', 'transfer', 'loan', 'loan_repayment', 'shared_goal'];

export function visibleNote(entry: { type: LedgerEntryType; note: string }): string {
  return OWNER_NOTE_TYPES.includes(entry.type) ? entry.note : '';
}

interface FlowEntry {
  direction: 'in' | 'out';
  account: Account | null;
  toAccount: Account | null;
  type?: LedgerEntryType;
}

/**
 * True for an entry that has no pos by mistake of history (before pos existed). A write-off has no pos on purpose:
 * it never changes a balance, so it gets no warning.
 */
export function showsNoPosWarning(e: { type: LedgerEntryType; account: Account | null }): boolean {
  return e.account === null && e.type !== 'debt_writeoff';
}

/** "Tunai ke Debit" for a move, "Masuk ke Tunai" / "Keluar dari Debit" otherwise, "Belum ada tempat uang" without a pos. */
export function flowText(e: FlowEntry): string {
  if (e.type === 'debt_writeoff') return 'Tidak mengubah saldo kas';
  if (e.account === null) return 'Belum ada tempat uang';
  if (e.toAccount) return `${ACCOUNT_LABELS[e.account]} ke ${ACCOUNT_LABELS[e.toAccount]}`;
  return e.direction === 'in' ? `Masuk ke ${ACCOUNT_LABELS[e.account]}` : `Keluar dari ${ACCOUNT_LABELS[e.account]}`;
}

/**
 * "+" for money that enters Tunai or Debit, "-" for money that leaves one, "" when no cash balance really changes.
 * One shared rule (cashFlowSign in the domain), also used by the Riwayat row and the monthly summary. The text
 * "Masuk ke / Keluar dari" stays next to it, so the meaning never depends on colour or sign alone.
 */
export function amountSign(e: FlowEntry): '+' | '-' | '' {
  return cashFlowSign(e);
}

export type CorrectionRoute =
  | 'direct' // reverse from the kas detail screen
  | 'payment' // use the member screen (also undoes allocations)
  | 'payout' // use the payout screen (payout + offset together)
  | 'already_corrected'
  | 'is_reversal'
  | 'not_correctable' // write-off and refund: never corrected
  | 'period_ended';

/**
 * Where an entry can be corrected. Mirrors the repository rules so the screen shows the right button.
 * Kas-type entries (saldo awal, pindah saldo, pinjaman, pelunasan, pengeluaran bersama) can be corrected even in an
 * ended period; payments and payouts only in an active one; write-offs and refunds never.
 */
export function correctionRoute(entry: { type: LedgerEntryType; reversedById: string | null }, periodActive: boolean): CorrectionRoute {
  if (entry.type === 'reversal') return 'is_reversal';
  if (entry.reversedById) return 'already_corrected';
  if (entry.type === 'debt_writeoff' || entry.type === 'credit_refund') return 'not_correctable';
  if (DIRECTLY_REVERSIBLE_TYPES.includes(entry.type)) return 'direct';
  if (!periodActive) return 'period_ended';
  if (entry.type === 'member_payment') return 'payment';
  if (entry.type === 'host_payout' || entry.type === 'host_offset') return 'payout';
  return 'is_reversal';
}
