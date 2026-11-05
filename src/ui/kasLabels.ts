// Indonesian display text for ledger entries. Display only: no money is computed here.
import { ACCOUNT_LABELS, type KasKind } from '@/domain/kas';
import { DIRECTLY_REVERSIBLE_TYPES } from '@/domain/reversal';
import type { Account, LedgerEntryType } from '@/domain/types';

export const TYPE_LABELS: Record<LedgerEntryType, string> = {
  member_payment: 'Iuran anggota',
  host_payout: 'Pembayaran tuan rumah',
  host_offset: 'Potongan tunggakan tuan rumah',
  opening_balance: 'Saldo awal',
  transfer: 'Pindah saldo',
  loan: 'Pinjaman ke anggota',
  loan_repayment: 'Pelunasan pinjaman',
  shared_goal: 'Pengeluaran bersama',
  reversal: 'Koreksi',
};

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
}

/** "Tunai -> Debit" for a move, "Masuk ke Tunai" / "Keluar dari Debit" otherwise, "Tanpa pos" without a pos. */
export function flowText(e: FlowEntry): string {
  if (e.account === null) return 'Tanpa pos';
  if (e.toAccount) return `${ACCOUNT_LABELS[e.account]} -> ${ACCOUNT_LABELS[e.toAccount]}`;
  return e.direction === 'in' ? `Masuk ke ${ACCOUNT_LABELS[e.account]}` : `Keluar dari ${ACCOUNT_LABELS[e.account]}`;
}

export type CorrectionRoute =
  | 'direct' // reverse from the kas detail screen
  | 'payment' // use the member screen (also undoes allocations)
  | 'payout' // use the payout screen (payout + offset together)
  | 'already_corrected'
  | 'is_reversal'
  | 'period_ended';

/** Where an entry can be corrected. Mirrors the repository rules so the screen shows the right button. */
export function correctionRoute(entry: { type: LedgerEntryType; reversedById: string | null }, periodActive: boolean): CorrectionRoute {
  if (entry.type === 'reversal') return 'is_reversal';
  if (entry.reversedById) return 'already_corrected';
  if (!periodActive) return 'period_ended';
  if (entry.type === 'member_payment') return 'payment';
  if (entry.type === 'host_payout' || entry.type === 'host_offset') return 'payout';
  return DIRECTLY_REVERSIBLE_TYPES.includes(entry.type) ? 'direct' : 'is_reversal';
}
