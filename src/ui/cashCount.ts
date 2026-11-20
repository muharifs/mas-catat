// Texts and small view helpers for "Cek kas" (decision 34). Pure: no React, no database, no money arithmetic (every
// number comes from src/domain/cash-count.ts). Same pattern as skipMeeting.ts: the screens only display what is built here.
import {
  countHints,
  type CountAccount,
  type CountHintCode,
  type CountLine,
  type CountStatus,
  type MeetingCountRow,
} from '@/domain/cash-count';
import { ACCOUNT_LABELS } from '@/domain/kas';
import { parseRupiahInput } from '@/domain/payment-preview';
import type { Rupiah } from '@/domain/types';
import { formatRupiah } from './format';

export type CountTone = 'ok' | 'warn' | 'neutral';

export const COUNT_STRINGS = {
  intro: 'Hitung uang yang ada di tangan lalu bandingkan dengan catatan. Cek kas tidak mengubah saldo kas.',
  expectedTitle: 'Menurut catatan',
  expectedHelp: 'Saldo dari semua catatan sampai sekarang.',
  tunaiLabel: 'Tunai di tangan (wajib)',
  debitLabel: 'Debit di rekening',
  debitSkipped: 'Debit tidak dicek',
  debitSkipButton: 'Lewati Debit',
  debitMissing: 'Isi jumlah Debit dulu (isi 0 bila kosong), atau pilih Lewati Debit.',
  debitCheckButton: 'Hitung Debit juga',
  noteLabel: 'Catatan (boleh kosong)',
  notePlaceholder: 'Contoh: dihitung di rumah tuan rumah',
  save: 'Simpan hitungan',
  saving: 'Menyimpan...',
  history: 'Lihat riwayat cek kas',
  tunaiMissing: 'Isi jumlah Tunai dulu. Isi 0 bila tidak ada uang tunai.',
  resultNone: 'Belum bisa cek kas',
  resultNoneMessage:
    'Cek kas dilakukan untuk periode yang sedang berjalan. Mulai periode dulu, atau tunggu sampai ada pertemuan yang bisa dicek.',
  allMatch: 'Uang yang dihitung sama dengan catatan.',
  differenceTitle: 'Ada selisih',
  differenceBody:
    'Cek kas tidak mengubah saldo kas. Bila ada catatan yang terlewat, tambahkan lewat catatan biasa. Bila hitungan salah, hitung ulang: riwayat menyimpan keduanya dan yang terbaru dipakai.',
  causesTitle: 'Kemungkinan penyebab',
  causesIntro: 'Ini hanya dugaan. Periksa dulu sebelum mencatat.',
  done: 'Selesai',
  recount: 'Hitung ulang',
  historyTitle: 'Riwayat cek kas',
  historyEmpty: 'Belum ada pertemuan di periode ini.',
  notChecked: 'Belum dicek',
  countNow: 'Cek kas sekarang',
} as const;

/** "Cocok", "Kurang Rp25.000" (counted less than the ledger) or "Lebih Rp15.000". Words carry the meaning, never a minus sign. */
export function differenceLabel(difference: Rupiah): { text: string; tone: 'ok' | 'warn' } {
  if (difference === 0) return { text: 'Cocok', tone: 'ok' };
  return difference < 0
    ? { text: `Kurang ${formatRupiah(-difference)}`, tone: 'warn' }
    : { text: `Lebih ${formatRupiah(difference)}`, tone: 'warn' };
}

/** One sentence for screen readers: "Tunai, menurut catatan Rp..., hasil hitung Rp..., kurang Rp...". */
export function lineSpoken(line: CountLine): string {
  const d = differenceLabel(line.difference).text.toLowerCase();
  return `${ACCOUNT_LABELS[line.account]}, menurut catatan ${formatRupiah(line.expected)}, hasil hitung ${formatRupiah(line.counted)}, ${d}`;
}

export const HINT_TEXT: Record<CountHintCode, string> = {
  member_payment: 'Pembayaran anggota mungkin belum dicatat.',
  host_payout: 'Pembayaran tuan rumah mungkin belum dicatat.',
  transfer: 'Pindah saldo antara Tunai dan Debit mungkin belum dicatat.',
  goal_spending: 'Pengeluaran bersama mungkin belum dicatat.',
};

export type HintTarget =
  | { kind: 'payments' }
  | { kind: 'payout' }
  | { kind: 'kas_new'; entryKind: 'transfer' | 'shared_goal' };

/** The screen that fixes a suspected cause, with its button label. Always a normal entry: a count never fixes anything itself. */
export function hintAction(code: CountHintCode): { label: string; target: HintTarget } {
  switch (code) {
    case 'member_payment':
      return { label: 'Catat pembayaran', target: { kind: 'payments' } };
    case 'host_payout':
      return { label: 'Bayar tuan rumah', target: { kind: 'payout' } };
    case 'transfer':
      return { label: 'Pindah saldo', target: { kind: 'kas_new', entryKind: 'transfer' } };
    case 'goal_spending':
      return { label: 'Catat pengeluaran bersama', target: { kind: 'kas_new', entryKind: 'shared_goal' } };
  }
}

export interface PosHints {
  account: CountAccount;
  difference: Rupiah;
  hints: CountHintCode[];
}

/** Hints per pos with a non-zero difference; the other pos' difference is passed so opposite amounts suggest a transfer. */
export function hintsForCount(lines: readonly CountLine[], memberCount: number): PosHints[] {
  return lines
    .filter((l) => l.difference !== 0)
    .map((l) => {
      const other = lines.find((o) => o.account !== l.account);
      return {
        account: l.account,
        difference: l.difference,
        hints: countHints({ difference: l.difference, memberCount, otherDifference: other ? other.difference : null }),
      };
    });
}

export function resultSummary(lines: readonly CountLine[]): { clean: boolean; notice: string } {
  const clean = lines.every((l) => l.difference === 0);
  return { clean, notice: clean ? COUNT_STRINGS.allMatch : COUNT_STRINGS.differenceBody };
}

export function countToast(clean: boolean): string {
  return clean ? 'Hitungan tersimpan. Kas cocok.' : 'Hitungan tersimpan. Ada selisih.';
}

/** Paragraph added to the "Tutup pertemuan" dialog when the meeting has no count. A warning, never a block. */
export function closeWeekCountWarning(hasCount: boolean): string | null {
  return hasCount
    ? null
    : 'Pertemuan ini belum dicek kasnya. Sebaiknya hitung uang dulu supaya selisih terlihat lebih awal. Menutup pertemuan tetap bisa.';
}

export const CHECK_FIRST_LABEL = 'Cek kas dulu';

export interface CountInputState {
  tunaiText: string;
  /** A key was pressed (also "0"). The keypad never keeps a leading zero, so "typed 0" and "nothing typed" differ only here. */
  tunaiTouched: boolean;
  debitChecked: boolean;
  /** Same meaning as tunaiTouched, for Debit. */
  debitTouched: boolean;
  debitText: string;
}

/** Typed digits to rupiah. Tunai must have been typed (0 is fine); Debit is null when it is not checked. */
export function parseCountInput(s: CountInputState): { tunai: Rupiah | null; debit: Rupiah | null; error: string | null } {
  const tunai = s.tunaiTouched ? (s.tunaiText === '' ? 0 : parseRupiahInput(s.tunaiText)) : null;
  if (tunai === null) return { tunai: null, debit: null, error: COUNT_STRINGS.tunaiMissing };
  if (s.debitChecked && !s.debitTouched) return { tunai, debit: null, error: COUNT_STRINGS.debitMissing };
  const debit = s.debitChecked ? (s.debitText === '' ? 0 : parseRupiahInput(s.debitText)) : null;
  if (s.debitChecked && debit === null) return { tunai, debit: null, error: 'Jumlah Debit tidak valid.' };
  return { tunai, debit, error: null };
}

export interface CountRowView {
  title: string;
  /** Per pos lines, e.g. "Tunai: Cocok". Empty when not counted. */
  lines: { account: CountAccount; label: string; text: string; tone: 'ok' | 'warn' | 'neutral' }[];
  badge: { label: string; tone: CountTone } | null;
  /** Row is highlighted (the first meeting of a run of differences). */
  tint: boolean;
  help: string | null;
}

/** View of one meeting in the history. `timesCounted` = how many counts were saved for it (history keeps them all). */
export function countRowView(row: MeetingCountRow, timesCounted: number): CountRowView {
  const title = `Pertemuan ${row.week}`;
  if (!row.counted) return { title, lines: [], badge: { label: COUNT_STRINGS.notChecked, tone: 'neutral' }, tint: false, help: null };
  const lines = (['tunai', 'debit'] as const).map((account) => {
    const own = row.lines.find((l) => l.account === account);
    if (!own) return { account, label: ACCOUNT_LABELS[account], text: 'tidak dicek', tone: 'neutral' as const };
    const d = differenceLabel(own.difference);
    return { account, label: ACCOUNT_LABELS[account], text: d.text, tone: d.tone };
  });
  const badge =
    row.flag === 'first'
      ? { label: 'Selisih mulai di sini', tone: 'warn' as const }
      : row.flag === 'continued'
        ? { label: 'Selisih berlanjut', tone: 'warn' as const }
        : null;
  return { title, lines, badge, tint: row.flag === 'first', help: timesCounted > 1 ? `Dihitung ${timesCounted} kali. Yang terbaru dipakai.` : null };
}

/** Notice on top of the history: the latest meeting where a difference started. Null when there is none. */
export function firstDifferenceNotice(rows: readonly MeetingCountRow[]): string | null {
  const first = [...rows].reverse().find((r) => r.flag === 'first');
  return first ? `Selisih pertama muncul di pertemuan ${first.week}. Periksa catatan di sekitar pertemuan itu.` : null;
}

/** Badge of the "Cek kas" row on Beranda: status of the latest counted meeting, with its number when it is another meeting. */
export function homeCountBadge(status: CountStatus, currentWeek: number): { label: string; tone: CountTone } {
  if (status.state === 'none' || status.week === null) return { label: COUNT_STRINGS.notChecked, tone: 'neutral' };
  const word = status.state === 'clean' ? 'Cocok' : 'Selisih';
  const label = status.week === currentWeek ? word : `Pertemuan ${status.week}: ${word}`;
  return { label, tone: status.state === 'clean' ? 'ok' : 'warn' };
}

export function homeCountSpoken(status: CountStatus): string {
  if (status.state === 'none' || status.week === null) return 'Cek kas. Belum ada hitungan.';
  return `Cek kas. Pertemuan ${status.week}: ${status.state === 'clean' ? 'cocok' : 'ada selisih'}.`;
}
