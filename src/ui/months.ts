// Month helpers for the Riwayat month switcher. Pure: months are "YYYY-MM" text, no Date objects (no timezone drift).
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** The month before or after a "YYYY-MM" month (delta -1 or +1, or more). */
export function shiftMonth(month: string, delta: number): string {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(mm).padStart(2, '0')}`;
}

/** "2026-11" becomes "November 2026". Returns the input unchanged if it is not a month. */
export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const name = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  return match && name ? `${name} ${match[1]}` : month;
}
