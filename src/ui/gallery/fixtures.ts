// Static mock data for the developer-only component gallery (docs/specs/component-gallery.md).
// Everything here is a constant: no database, no repository, no store, no real member. The only import from the
// data layer is a TYPE (erased at build time), so nothing of src/db runs when the gallery opens.
import type { LedgerListItem } from '@/db/ledger';
import type { Account, LedgerEntryType } from '@/domain/types';
import type { PaidTodayView } from '../paidToday';

// Long texts from docs/specs/ui-language-review.md (final glossary). Copied on purpose, not imported from screens.
export const T1_LABEL = 'Piutang (dipinjam anggota)';
export const T2_BUTTON = 'Lihat pembayaran tuan rumah';
export const T3_TITLE = 'Semua data akan diganti';
export const T4_TITLE = 'Semua data akan dihapus';
export const T5_ERROR =
  'Jumlah harus kelipatan Rp15.000, misalnya Rp15.000, Rp30.000, atau Rp45.000. Pembayaran sebagian tidak bisa dicatat.';
export const T6_LONG = 'Tunggakan yang tersisa dihapus dan ditanggung kas. Tidak mengubah saldo kas. Langkah ini tidak bisa dibatalkan.';
export const T7_VERY_LONG =
  'Berkas cadangan ini berasal dari HP lain. Semua data di HP ini akan diganti dengan isinya, dan salinan pengaman dibuat lebih dulu supaya bisa dikembalikan bila ada masalah.';
export const T8_MEMBER = 'Siti Nurhaliza Rahmawati binti Abdurrahman';

export const AMOUNT_MID = 1_250_000;
export const AMOUNT_BIG = 12_345_000;
export const AMOUNT_EXTREME = 123_456_789;

/** Fixed values, so the gallery looks the same on every day. */
export const FIXED_DATE = '2026-01-04';
export const MONTH_FIRST = '2026-01';
export const MONTH_LONGEST = '2026-09';

// ---- HistoryRow fixtures ----

function item(
  id: string,
  type: LedgerEntryType,
  direction: 'in' | 'out',
  amount: number,
  account: Account | null,
  extra: Partial<LedgerListItem> = {},
): LedgerListItem {
  return {
    id,
    periodId: 'gallery-period',
    createdAt: '2026-01-04T10:00:00.000Z',
    reversesEntryId: null,
    correctionReason: null,
    reversedById: null,
    toAccount: null,
    type,
    direction,
    date: FIXED_DATE,
    amount,
    memberId: 'gallery-member',
    week: null,
    note: '',
    account,
    ...extra,
  };
}

const payment = item('h-payment', 'member_payment', 'in', AMOUNT_MID, 'tunai');
const payout = item('h-payout', 'host_payout', 'out', AMOUNT_BIG, 'tunai', { week: 2 });
const offset = item('h-offset', 'host_offset', 'in', 45_000, null, { week: 2 });
const transfer = item('h-transfer', 'transfer', 'out', 500_000, 'tunai', { toAccount: 'debit', memberId: null, note: 'Setor ke rekening' });
const loan = item('h-loan', 'loan', 'out', AMOUNT_MID, 'tunai', { toAccount: 'piutang', note: 'Untuk biaya sekolah' });
const writeoff = item('h-writeoff', 'debt_writeoff', 'out', 30_000, null);
const refund = item('h-refund', 'credit_refund', 'out', 25_000, 'tunai');
const original = item('h-original', 'member_payment', 'in', 45_000, 'tunai', { reversedById: 'h-reversal' });
const reversal = item('h-reversal', 'reversal', 'out', 45_000, 'tunai', { reversesEntryId: 'h-original', correctionReason: 'Salah memilih anggota' });

const longNote = item('h-longnote', 'shared_goal', 'out', AMOUNT_BIG, 'debit', { memberId: null, note: T6_LONG });
const longName = item('h-longname', 'member_payment', 'in', AMOUNT_BIG, 'tunai');
const extreme = item('h-extreme', 'member_payment', 'in', AMOUNT_EXTREME, 'tunai');
const noPos = item('h-nopos', 'member_payment', 'in', 30_000, null);
const flatA = item('h-flat-a', 'member_payment', 'in', 15_000, 'tunai');
const flatB = item('h-flat-b', 'host_payout', 'out', AMOUNT_BIG, 'tunai', { week: 3 });

/** Normal rows in the order of the spec: payment, payout, offset, transfer, loan, write-off, refund, reversal. */
export const HISTORY_TYPES: readonly LedgerListItem[] = [payment, payout, offset, transfer, loan, writeoff, refund, reversal];
export const HISTORY_CORRECTED = original;
export const HISTORY_LONG_NOTE = longNote;
export const HISTORY_LONG_NAME = longName;
export const HISTORY_EXTREME = extreme;
export const HISTORY_NO_POS = noPos;
export const HISTORY_FLAT: readonly LedgerListItem[] = [flatA, flatB];

/** HistoryRow looks up the original of a reversal here. */
export const HISTORY_BY_ID: ReadonlyMap<string, LedgerListItem> = new Map(
  [...HISTORY_TYPES, original, longNote, longName, extreme, noPos, flatA, flatB].map((e) => [e.id, e]),
);

// ---- InitialsRow fixtures (same shape paidTodayView() returns) ----

function paidView(texts: string[], extra: number): PaidTodayView {
  return {
    initials: texts.map((text, i) => ({ key: `i${i}`, text })),
    extra,
    summary: `Sudah bayar hari ini: ${texts.length + extra} dari 12`,
    accessibilityLabel: `Sudah bayar hari ini: ${texts.length + extra} dari 12. Data tiruan.`,
  };
}

export const PAID_EMPTY = paidView([], 0);
export const PAID_THREE = paidView(['SN', 'AB', 'RK'], 0);
export const PAID_EIGHT_EXTRA = paidView(['SN', 'AB', 'RK', 'DW', 'MH', 'LP', 'YS', 'TA'], 4);
export const PAID_MANY = paidView(['SN', 'AB', 'RK', 'DW', 'MH', 'LP', 'YS', 'TA', 'NF', 'WG', 'HJ', 'QZ', 'BM', 'CX', 'VU', 'EO'], 0);
