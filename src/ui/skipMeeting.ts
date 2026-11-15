// Words and small decisions for "Lewati pertemuan" (decision 33, spec docs/specs/skip-last-meeting.md). Pure: the
// repository (previewSkip) supplies every number and says whether skipping is allowed; nothing is computed here.
import type { WeekSkipBlocker, WeekSkipPreview } from '@/domain/week-skip';
import { formatRupiah } from './format';
import { describeWeeks } from './messages';

/** Default text of the reason field in the skip dialog. The owner can change it; the domain needs a non-empty reason. */
export const SKIP_DEFAULT_REASON = 'Tuan rumah tidak bisa menerima tamu';

/** The reason is cleared and the dialog is confirmed: ask again instead of saving nothing. */
export const SKIP_REASON_REQUIRED_TEXT = 'Alasan wajib diisi.';

export const SKIP_REASON_LABEL = 'Alasan (wajib)';

export const skipCardTitle = (number: number) => `Lewati pertemuan ${number}`;

export const SKIP_CARD_HELP =
  'Hanya pertemuan terakhir yang bisa dilewati, misalnya ketika tuan rumah giliran terakhir tidak bisa menerima tamu. Pertemuan yang dilewati tidak ada iuran dan tidak ada pembayaran tuan rumah. Ini bukan libur: saat libur pertemuan tetap terbuka.';

/**
 * Whether the screen needs previewSkip at all: only an active period whose OLDEST open meeting is the last one
 * (number = member count). One member is left out on purpose (the repository rejects it too).
 */
export function shouldLoadSkipPreview(input: {
  periodActive: boolean;
  memberCount: number;
  oldestOpenNumber: number | null;
}): boolean {
  return input.periodActive && input.memberCount >= 2 && input.oldestOpenNumber === input.memberCount;
}

/**
 * Why the skip button is disabled, from the blocker the repository returned. Null for any other blocker: the card is
 * then not shown at all (those cases are not about this meeting, see skipCard).
 */
export function skipDisabledReason(blocker: WeekSkipBlocker, number: number): string | null {
  switch (blocker.code) {
    case 'host_unpaid':
      return `Bayar dulu tuan rumah ${describeWeeks(blocker.weeks)}.`;
    case 'payout_stands':
      return `Pembayaran tuan rumah pertemuan ${number} sudah dicatat. Koreksi dulu pembayarannya.`;
    default:
      return null;
  }
}

export interface SkipCard {
  number: number;
  enabled: boolean;
  /** Shown under the disabled button; null when enabled. */
  reason: string | null;
}

/** What the "Lewati pertemuan" card shows, or null when the card is not rendered. */
export function skipCard(preview: WeekSkipPreview | null): SkipCard | null {
  if (!preview) return null;
  if (preview.eligible) return { number: preview.number, enabled: true, reason: null };
  const reason = preview.blocker ? skipDisabledReason(preview.blocker, preview.number) : null;
  return reason ? { number: preview.number, enabled: false, reason } : null;
}

/** Body of the skip dialog. The amount and member count are the repository's numbers (previewSkip). */
export function skipDialogMessage(number: number, preview: Pick<WeekSkipPreview, 'prepaidTotal' | 'prepaidMembers'>): string {
  const prepaid =
    preview.prepaidTotal > 0
      ? `Iuran yang dibayar di muka untuk pertemuan ini (${formatRupiah(preview.prepaidTotal)} dari ${preview.prepaidMembers} anggota) menjadi titipan dan dibawa ke periode berikutnya.`
      : 'Belum ada iuran yang dibayar di muka untuk pertemuan ini.';
  return [
    `Lewati pertemuan ${number}?`,
    'Pertemuan ini tidak diadakan: tidak ada iuran dan tidak ada pembayaran tuan rumah. Giliran tuan rumahnya pindah ke periode berikutnya.',
    prepaid,
    'Setelah ini periode bisa diakhiri. Pelewatan bisa dibatalkan sampai periode berakhir.',
  ].join('\n\n');
}

export const unskipTitle = (number: number) => `Batalkan pelewatan pertemuan ${number}`;

export const unskipDialogMessage = (number: number) =>
  `Pertemuan ${number} dibuka lagi. Iuran pertemuan ini dihitung lagi seperti biasa. Iuran di muka yang sudah tercatat untuk pertemuan ini kembali dihitung. Uang yang dibayar selama pelewatan tetap menjadi titipan sampai periode berakhir. Pertemuan bisa dilewati lagi nanti.`;

/** The five CorrectionForm texts for cancelling a skip (the defaults of the form are for payment corrections). */
export const unskipFormTexts = (number: number) => ({
  explain: `Pertemuan ${number} dibuka lagi dan iuran mulai dihitung lagi. Alasan disimpan sebagai catatan perubahan.`,
  reasonLabel: 'Alasan pembatalan (wajib)',
  placeholder: 'Contoh: tuan rumah ternyata bisa menerima tamu',
  requiredText: 'Alasan pembatalan wajib diisi.',
});

/** Help line on a skipped meeting row. Names the member whose turn moved when it is known. */
export function skippedRowHelp(turnMemberName: string | null): string {
  const first = 'Tidak ada iuran dan tidak ada pembayaran tuan rumah.';
  return turnMemberName
    ? `${first} Giliran ${turnMemberName} pindah ke periode berikutnya.`
    : `${first} Giliran tuan rumahnya pindah ke periode berikutnya.`;
}

/** Body text of the skipped-meeting screen (Atur pertemuan). */
export const SKIPPED_SCREEN_TEXT =
  'Pertemuan ini dilewati. Tidak ada iuran dan tidak ada pembayaran tuan rumah. Tuan rumah dan tanggal tidak bisa diubah selama pertemuan dilewati.';

export const SKIP_PERIOD_ENDED_TEXT = 'Periode sudah berakhir, pelewatan tidak bisa dibatalkan.';

export const SKIPPED_PAYOUT_TEXT = 'Pertemuan ini dilewati. Tidak ada pembayaran tuan rumah.';

/** "Pernah dilewati, dibatalkan: alasan" on a meeting that was skipped before and is open again. */
export const skipUndoneNote = (undoReason: string) => `Pernah dilewati, dibatalkan: ${undoReason}`;

/** "Pertemuan 19 dilewati." (several: "Pertemuan 18, 19 dilewati."). Empty text for none. */
export function skippedSentence(numbers: readonly number[]): string {
  if (numbers.length === 0) return '';
  return `Pertemuan ${numbers.join(', ')} dilewati.`;
}

/** Card "Akhiri periode" on Jadwal: sentence placed before the usual text, or '' when nothing was skipped. */
export function skippedClosePrefix(numbers: readonly number[]): string {
  if (numbers.length === 0) return '';
  return `Pertemuan ${numbers.join(', ')} dilewati, jadi tidak perlu ditutup. `;
}

/** Notice on the "Akhiri periode" screen, or null when nothing was skipped. */
export function skippedCloseNotice(numbers: readonly number[]): string | null {
  if (numbers.length === 0) return null;
  return `Pertemuan ${numbers.join(', ')} dilewati: tidak ada iuran dan tidak ada pembayaran tuan rumah. Iuran yang dibayar di muka menjadi titipan dan dibawa ke periode berikutnya. Pelewatan bisa dibatalkan di Jadwal sampai periode berakhir.`;
}

/** Last sentence of the second "Akhiri periode" dialog, or '' when nothing was skipped. */
export function skippedCloseDialogTail(numbers: readonly number[]): string {
  if (numbers.length === 0) return '';
  return ` Pelewatan pertemuan ${numbers.join(', ')} juga tidak bisa dibatalkan lagi.`;
}

/** Line under "Tunggakan dihitung sampai pertemuan N" on Pembayaran, or null when that meeting is not skipped. */
export function skippedPaymentsLine(throughWeek: number, skippedNumbers: readonly number[]): string | null {
  return skippedNumbers.includes(throughWeek) ? `Pertemuan ${throughWeek} dilewati: tidak ada iuran.` : null;
}

/** Hint under "Total iuran periode" on the period report: extra sentence when a meeting is skipped. */
export function totalDuesHint(anySkipped: boolean): string {
  return anySkipped ? 'Rp15.000 x anggota x pertemuan. Pertemuan yang dilewati tidak dihitung.' : 'Rp15.000 x anggota x pertemuan';
}

/** Notice on the report of a skipped meeting. */
export const SKIPPED_REPORT_NOTICE = 'Pertemuan ini dilewati. Tidak ada iuran dan tidak ada pembayaran tuan rumah.';

/** Hint for the new-period screens: the member who lost a turn to host. */
export function skippedTurnNotice(memberName: string, periodName: string, week: number): string {
  return `${memberName} belum sempat jadi tuan rumah di ${periodName} karena pertemuan ${week} dilewati.`;
}

/** New-period form: same fact plus what to do (selected) or that the member is not in the period (not selected). */
export function skippedTurnNewPeriodNotice(memberName: string, periodName: string, week: number, selected: boolean): string {
  const base = skippedTurnNotice(memberName, periodName, week);
  return selected
    ? `${base} Pilih ${memberName} sebagai tuan rumah pertemuan 1.`
    : `${base.slice(0, -1)}, tetapi tidak dipilih di periode ini.`;
}
