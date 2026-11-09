// Indonesian display text for the report screens (M6). Display only: no money is computed here, every number comes
// from src/domain/report.ts. The UI never uses the word "kredit": member credit is "titipan".
import { ACCOUNT_LABELS } from '@/domain/kas';
import type { WeekState } from '@/domain/payment-preview';
import type { HistoryEvent, HistoryEventKind, HistoryLoan } from '@/domain/report';
import type { WeekCredit } from '@/domain/types';
import { formatRupiah } from './format';

export const EVENT_LABELS: Record<HistoryEventKind, string> = {
  payment: 'Pembayaran iuran',
  host_payout: 'Menerima pembayaran tuan rumah',
  host_offset: 'Dipotong dari bayaran tuan rumah',
  titipan_carry_in: 'Titipan dibawa dari periode sebelumnya',
  titipan_carry_out: 'Titipan dibawa ke periode berikutnya',
  titipan_settle: 'Titipan dipakai melunasi tunggakan',
  writeoff: 'Penghapusan tunggakan',
  refund: 'Pengembalian titipan',
};

export const LOAN_LABELS: Record<HistoryLoan['kind'], string> = {
  loan: 'Pinjaman',
  opening_loan: 'Pinjaman yang sudah ada sebelum memakai aplikasi',
  loan_repayment: 'Pelunasan pinjaman',
};

export const WEEK_STATE_LABELS: Record<WeekState, string> = {
  paid: 'Lunas',
  offset: 'Lunas lewat potongan tuan rumah',
  credited: 'Lunas lewat titipan',
  partial_offset: 'Sebagian lewat potongan tuan rumah',
  partial_credited: 'Sebagian lewat titipan',
  partial: 'Kurang',
  unpaid: 'Belum bayar',
};

/** True for a week state that counts as settled (shown in the "ok" colour). */
export function isSettledState(state: WeekState): boolean {
  return state === 'paid' || state === 'offset' || state === 'credited';
}

export const MEETING_STATUS_LABELS = { open: 'Terbuka', closed: 'Ditutup' } as const;

/** "pertemuan 1 (Rp15.000), pertemuan 2 (Rp5.000)". Empty text for no meetings. */
export function settledText(settled: readonly WeekCredit[]): string {
  return settled.map((s) => `pertemuan ${s.week} (${formatRupiah(s.amount)})`).join(', ');
}

/** Second and following lines of a history event (the title is EVENT_LABELS). Never includes the correction text. */
export function eventLines(e: HistoryEvent): string[] {
  const lines: string[] = [];
  switch (e.kind) {
    case 'payment':
      if (e.settled.length > 0) lines.push(`Melunasi: ${settledText(e.settled)}`);
      if (e.credit > 0) lines.push(`Menjadi titipan: ${formatRupiah(e.credit)}`);
      if (e.settled.length === 0 && e.credit === 0 && !e.reversed) lines.push('Tidak melunasi pertemuan.');
      break;
    case 'host_payout':
      if (e.week !== null) lines.push(`Pertemuan ${e.week}`);
      if (e.account) lines.push(`Keluar dari ${ACCOUNT_LABELS[e.account]}`);
      break;
    case 'host_offset':
      if (e.week !== null) lines.push(`Pertemuan ${e.week}`);
      if (e.settled.length > 0) lines.push(`Melunasi: ${settledText(e.settled)}`);
      break;
    case 'titipan_carry_in':
      if (e.otherPeriodName) lines.push(`Dari ${e.otherPeriodName}`);
      if (e.settled.length > 0) lines.push(`Melunasi: ${settledText(e.settled)}`);
      break;
    case 'titipan_carry_out':
      if (e.otherPeriodName) lines.push(`Ke ${e.otherPeriodName}`);
      break;
    case 'titipan_settle':
      if (e.settled.length > 0) lines.push(`Melunasi: ${settledText(e.settled)}`);
      break;
    case 'writeoff':
      lines.push('Ditanggung kas saat periode berakhir. Tidak mengubah saldo kas.');
      break;
    case 'refund':
      if (e.account) lines.push(`Uang keluar dari ${ACCOUNT_LABELS[e.account]}`);
      break;
  }
  return lines;
}

/** Text shown on a corrected item, or null when the item is in force. */
export function correctionText(item: { reversed: boolean; reversalReason: string | null }): string | null {
  if (!item.reversed) return null;
  return item.reversalReason ? `Dikoreksi: ${item.reversalReason}` : 'Dikoreksi';
}

/** Short note for a corrected total: corrected items are listed but never counted. */
export const CORRECTED_NOT_COUNTED = 'Item yang dikoreksi tetap ditampilkan tetapi tidak dihitung dalam total.';

/** Names of the lines of the expected kas formula. */
export const EXPECTED_LABELS = {
  actual: 'Kas nyata (Tunai + Debit)',
  outstanding: 'Tunggakan iuran',
  titipan: 'Titipan anggota',
  titipanAvailable: 'Titipan belum dipakai',
  titipanCarried: 'Titipan dibawa ke pertemuan yang belum ditutup',
  expected: 'Kas seharusnya',
  prepaid: 'Dibayar di muka',
  unpaidPayout: 'Payout belum dibayar',
} as const;

/** Reads "kas seharusnya = kas nyata + tunggakan - titipan anggota" for the formula caption. */
export const EXPECTED_FORMULA = 'Kas seharusnya = kas nyata + tunggakan iuran - titipan anggota';

/** Info line text for "Payout belum dibayar": count of closed meetings. */
export function unpaidPayoutText(count: number): string {
  return count === 0 ? 'Semua pertemuan yang ditutup sudah dibayar.' : `${count} pertemuan yang sudah ditutup belum dibayar ke tuan rumah.`;
}
