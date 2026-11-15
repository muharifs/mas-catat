// Indonesian texts that are built from numbers the repositories and domain already computed (dialogs, toasts,
// chip labels). Display only: nothing here calculates money. Kept out of the screens so the wording is tested.
import { daysBetween } from '@/domain/schedule';
import type { PaymentChoice, PaymentPreview } from '@/domain/payment-preview';
import { formatDate, formatDayMonth } from './dates';
import { formatRupiah } from './format';

/**
 * Title of the payment confirmation dialog. When nothing of the payment settles dues, the whole amount becomes
 * titipan and the title must not say "Sebagian" (the dialog body already says the whole payment is titipan).
 */
export function paymentConfirmTitle(preview: Pick<PaymentPreview, 'amount' | 'allocatedAmount' | 'creditAmount'>): string {
  const amount = formatRupiah(preview.amount);
  if (preview.creditAmount > 0 && preview.allocatedAmount === 0) return `${amount} menjadi titipan`;
  if (preview.creditAmount > 0) return `Sebagian menjadi titipan - ${amount}`;
  return `Konfirmasi pembayaran ${amount}`;
}

interface ArrearsLike {
  membersInArrears: number;
  totalArrears: number;
}

/**
 * Body of the "Tutup pertemuan" dialog. Arrears are only a warning, never a block (owner decision).
 * `arrears` is the repository's getArrearsSummary: it counts through the current (oldest open) meeting, which is
 * the one being closed.
 */
export function closeWeekMessage(number: number, date: string, arrears: ArrearsLike | null): string {
  const head = `Tutup pertemuan ${number} (${formatDate(date)})?`;
  const tail = 'Tuan rumah dan tanggal tidak bisa diubah lagi dan penutupan tidak bisa dibatalkan.';
  if (!arrears || arrears.membersInArrears === 0) return `${head} ${tail}`;
  return `${head} ${arrears.membersInArrears} anggota belum lunas sampai pertemuan ini: total ${formatRupiah(arrears.totalArrears)}. ${tail}`;
}

/**
 * Notice on Home when the date of the running (still open) meeting is already past, or null otherwise.
 * There is no "libur" button: during a break the owner just leaves the meeting open and moves its date later.
 */
export function overdueNotice(meetingNumber: number, meetingDate: string, today: string): string | null {
  const days = daysBetween(meetingDate, today);
  if (days < 1) return null;
  return `Pertemuan ${meetingNumber} (${formatDayMonth(meetingDate)}) sudah lewat ${days} hari. Jika libur, biarkan terbuka dan ubah tanggalnya saat pertemuan jadi dilaksanakan.`;
}

/** Label of a quick-amount chip. The amount comes from the domain's paymentChoices. */
export function paymentChoiceLabel(choice: PaymentChoice, arrearsIsPartial: boolean): string {
  if (choice.kind === 'weeks') return `${choice.weeks} pertemuan ${formatRupiah(choice.amount)}`;
  // When part of the arrears cannot be paid on its own the chip is not a full settlement, so it must not say "Lunasi".
  return arrearsIsPartial ? `Tunggakan ${formatRupiah(choice.amount)}` : `Lunasi tunggakan ${formatRupiah(choice.amount)}`;
}

/** Explains the part of the arrears that no valid payment can settle alone, or null when there is none. */
export function arrearsRemainderNote(remainder: number): string | null {
  if (remainder <= 0) return null;
  return `Sisa tunggakan ${formatRupiah(remainder)} tidak bisa dibayar sendiri karena pembayaran harus kelipatan Rp15.000. Pembayaran berikutnya melunasinya lebih dulu.`;
}

/** "pertemuan 2", "pertemuan 1 sampai 3", or "pertemuan 1, 3" when the meetings are not consecutive. */
export function describeWeeks(weeks: readonly number[]): string {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  if (first === undefined || last === undefined) return '';
  if (weeks.length === 1) return `pertemuan ${first}`;
  const consecutive = last - first + 1 === weeks.length;
  return consecutive ? `pertemuan ${first} sampai ${last}` : `pertemuan ${weeks.join(', ')}`;
}

/**
 * Toast after a swipe payment, built from the payment preview so it only says what really happened: which meetings
 * were settled, a meeting that is only partly paid, and any part that became member credit.
 */
export function swipePaymentToast(memberName: string, preview: PaymentPreview): string {
  const parts: string[] = [];
  if (preview.settledWeeks.length > 0) parts.push(`melunasi ${describeWeeks(preview.settledWeeks)}`);
  if (preview.partialWeek !== null) {
    parts.push(
      preview.settledWeeks.length > 0
        ? `dan sebagian pertemuan ${preview.partialWeek}`
        : `masuk ke pertemuan ${preview.partialWeek}, baru terbayar sebagian`,
    );
  }
  if (preview.creditAmount > 0) {
    parts.push(
      preview.allocatedAmount === 0
        ? 'menjadi titipan'
        : `(${formatRupiah(preview.creditAmount)} menjadi titipan)`,
    );
  }
  return `${memberName}: ${formatRupiah(preview.amount)} ${parts.join(' ')}`.trimEnd();
}

// Success toasts, shown after every save.
export const toasts = {
  payment: (amount: number, memberName: string) => `Pembayaran ${formatRupiah(amount)} dari ${memberName} tersimpan`,
  payout: (amount: number, hostName: string) => `Pembayaran tuan rumah ${formatRupiah(amount)} untuk ${hostName} tersimpan`,
  kas: (kindLabel: string, amount: number) => `${kindLabel} ${formatRupiah(amount)} tersimpan`,
  weekClosed: (number: number) => `Pertemuan ${number} ditutup`,
  weekSkipped: (number: number) => `Pertemuan ${number} dilewati. Periode sudah bisa diakhiri.`,
  skipCancelled: (number: number) => `Pelewatan pertemuan ${number} dibatalkan`,
  host: (number: number, hostName: string) => `Tuan rumah pertemuan ${number} disimpan: ${hostName}`,
  periodSaved: (name: string) => `Periode "${name}" tersimpan`,
  periodClosed: (name: string) => `Periode "${name}" berakhir`,
  refund: (amount: number, memberName: string) => `Titipan ${formatRupiah(amount)} dikembalikan ke ${memberName}`,
};
