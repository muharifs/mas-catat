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
