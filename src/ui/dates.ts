// Display helpers for ISO dates. Not money, so UI-side formatting is fine.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Today in the device local time as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-01-04" becomes "4 Jan 2026". Returns the input unchanged if it is not an ISO date. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : iso;
}

/** "2026-01-04" becomes "4 Jan" (no year). Returns the input unchanged if it is not an ISO date. */
export function formatDayMonth(iso: string): string {
  const full = formatDate(iso);
  return full === iso ? iso : full.replace(/ \d{4}$/, '');
}

// ---------------------------------------------------------------------------------------------------------------
// Recorded-at ("Dicatat") display. `created_at` is an ISO UTC timestamp written by the app; the clock and the day shown
// are the device local ones. Built from Date getters, not Intl, so the output does not depend on the JS engine or locale.
// Every helper takes an optional `offsetMinutes` (minutes EAST of UTC, WIB = 420) so tests do not depend on the machine
// time zone. The app never passes it: it then uses the device time zone.
// ---------------------------------------------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function localParts(d: Date, offsetMinutes?: number): LocalParts {
  if (offsetMinutes === undefined) {
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
  }
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Clock time with a dot, 24 hours, two digits: "19.42", "08.15", "00.05". */
export function formatTime(d: Date, offsetMinutes?: number): string {
  const p = localParts(d, offsetMinutes);
  return `${pad2(p.hour)}.${pad2(p.minute)}`;
}

// Strict: date, time and an explicit zone (Z or +hh:mm). A date-only string or a zone-less one is rejected, because JS
// would read it as UTC midnight (or local time) and show a made-up clock time.
// Groups: 1 year, 2 month, 3 day, 4 hour, 5 minute, 6 second (optional), 7 zone (Z or offset), 8/9 offset hour/minute.
const CREATED_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/;

/**
 * Parses a stored created-at timestamp. Returns null when it is empty, malformed, without a zone, or not a real instant.
 * V8 rolls impossible values over (30 Feb becomes 2 Mar, 24:00 becomes the next day), so every field is range-checked
 * and the calendar date is round-trip checked.
 */
export function parseCreatedAt(createdAt: string | null | undefined): Date | null {
  if (typeof createdAt !== 'string') return null;
  const m = CREATED_AT.exec(createdAt);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (m[8] !== undefined && (Number(m[8]) > 23 || Number(m[9]) > 59)) return null;
  // Round trip: a real calendar date survives Date.UTC unchanged.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Display text of when an entry was recorded. Empty string when `createdAt` is not valid (callers then render nothing).
 * - long: always the full date and time, "18 Nov 2026, 19.42" (detail screen, value of the "Dicatat pada" row).
 * - same local day as the entry date: "Dicatat 19.42".
 * - other day: "Dicatat 18 Nov, 19.42"; with the year ("Dicatat 2 Jan 2027, 08.15") when it differs from the entry date's year.
 */
export function recordedAtLabel(createdAt: string | null | undefined, txDate: string, long = false, offsetMinutes?: number): string {
  const d = parseCreatedAt(createdAt);
  if (!d) return '';
  const p = localParts(d, offsetMinutes);
  const iso = `${String(p.year).padStart(4, '0')}-${pad2(p.month)}-${pad2(p.day)}`;
  const time = formatTime(d, offsetMinutes);
  if (long) return `${formatDate(iso)}, ${time}`;
  if (iso === txDate) return `Dicatat ${time}`;
  const sameYear = iso.slice(0, 4) === txDate.slice(0, 4);
  return `Dicatat ${sameYear ? formatDayMonth(iso) : formatDate(iso)}, ${time}`;
}
