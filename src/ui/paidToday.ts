// "Sudah bayar hari ini" row on Beranda: initials circles. Pure and display only.
import { sortByName } from '@/domain/sort';

/** Most circles shown before the "+N" circle. */
export const MAX_INITIALS = 7;

/** Up to two letters: first letters of the first two words, or the first two letters of a single word. Upper case. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w !== '');
  const first = words[0];
  if (!first) return '?';
  const second = words[1];
  const letters = second ? `${first.charAt(0)}${second.charAt(0)}` : first.slice(0, 2);
  return letters.toUpperCase();
}

export interface PaidTodayView {
  initials: { key: string; text: string }[];
  /** People beyond MAX_INITIALS, shown as "+N"; 0 when all fit. */
  extra: number;
  /** Same wording as the Pembayaran screen. */
  summary: string;
  /** For screen readers: the summary and the names, A-Z (the circles alone would not say who paid). */
  accessibilityLabel: string;
}

/** `paid` = members who paid today (id and name); `total` = members of the period. */
export function paidTodayView(paid: readonly { id: string; name: string }[], total: number): PaidTodayView {
  const sorted = sortByName(paid, (p) => p.name);
  const summary = `Sudah bayar hari ini: ${sorted.length} dari ${total}`;
  const names = sorted.map((p) => p.name).join(', ');
  return {
    initials: sorted.slice(0, MAX_INITIALS).map((p) => ({ key: p.id, text: initialsOf(p.name) })),
    extra: Math.max(0, sorted.length - MAX_INITIALS),
    summary,
    accessibilityLabel: sorted.length === 0 ? `${summary}. Belum ada yang bayar hari ini.` : `${summary}. ${names}.`,
  };
}
