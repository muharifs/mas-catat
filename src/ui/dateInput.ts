// Pure helpers behind DateField: auto-hyphen formatting, reading the typed text and the shortcut buttons.
// Which dates are ALLOWED (not in the future, after the previous meeting, ...) stays in the domain and repositories;
// this file only formats text and moves dates by days.
import { addDays, isRealDate } from '@/domain/schedule';

/**
 * Keeps digits only (max 8) and inserts the hyphens: "20260104" becomes "2026-01-04", "202601" becomes "2026-01".
 * Pasting "2026-01-04" works too. A numeric keyboard has no "-" key, which is why the hyphens are automatic.
 */
export function formatDateInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export type DateReading = 'empty' | 'incomplete' | 'invalid' | 'valid';

/** What the typed text is: nothing, still being typed, a full but impossible date (2026-02-31), or a real date. */
export function readDateInput(value: string): DateReading {
  if (value.length === 0) return 'empty';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'incomplete';
  return isRealDate(value) ? 'valid' : 'invalid';
}

export type DateShortcut = 'today' | 'yesterday' | 'week_ago' | 'minus_day' | 'plus_day' | 'plus_week';

export const SHORTCUT_LABELS: Record<DateShortcut, string> = {
  today: 'Hari ini',
  yesterday: 'Kemarin',
  week_ago: '7 hari lalu',
  minus_day: '-1 hari',
  plus_day: '+1 hari',
  plus_week: '+7 hari',
};

/** Shortcuts for most date fields. */
export const BASIC_SHORTCUTS: readonly DateShortcut[] = ['today', 'yesterday', 'week_ago'];
/** Meeting date: the basic ones plus moving the date that is already in the field. */
export const MEETING_SHORTCUTS: readonly DateShortcut[] = [...BASIC_SHORTCUTS, 'minus_day', 'plus_day', 'plus_week'];

/**
 * The date a shortcut produces. "Hari ini", "Kemarin" and "7 hari lalu" count from `today`; "-1 hari", "+1 hari"
 * and "+7 hari" count from the date currently in the field (or from `today` when the field has no real date yet).
 */
export function shortcutDate(shortcut: DateShortcut, today: string, current: string): string {
  const base = isRealDate(current) ? current : today;
  switch (shortcut) {
    case 'today':
      return today;
    case 'yesterday':
      return addDays(today, -1);
    case 'week_ago':
      return addDays(today, -7);
    case 'minus_day':
      return addDays(base, -1);
    case 'plus_day':
      return addDays(base, 1);
    case 'plus_week':
      return addDays(base, 7);
  }
}
