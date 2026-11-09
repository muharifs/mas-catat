// Pure helpers behind DateField (the native Android calendar). ISO text <-> Date, and the text on the field.
// Which dates are ALLOWED (not in the future, after the previous meeting, ...) stays in the domain and repositories;
// the calendar only hands back the day the owner tapped.
import { isRealDate } from '@/domain/schedule';
import { formatDate, todayIso } from './dates';

/**
 * The Date the calendar opens on. Noon local time, so a daylight-saving shift can never move it to another day.
 * Text that is not a real calendar date opens on `today` instead.
 */
export function isoToPickerDate(iso: string, today: string): Date {
  const source = isRealDate(iso) ? iso : today;
  const [y, m, d] = source.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** The ISO day of a Date chosen in the calendar, in the phone's local time (what the owner saw on screen). */
export function pickerDateToIso(date: Date): string {
  return todayIso(date);
}

/** Text on the field: "Hari ini, 9 Nov 2026" for today, otherwise "4 Jan 2026". Not a real date: "Pilih tanggal". */
export function dateFieldText(iso: string, today: string): string {
  if (!isRealDate(iso)) return 'Pilih tanggal';
  return iso === today ? `Hari ini, ${formatDate(iso)}` : formatDate(iso);
}
