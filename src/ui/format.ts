// Display helper for integer rupiah. It only formats; it never computes money.

/** 15000 becomes "Rp15.000". Non-integer input is shown as received (money is always integer in this app). */
export function formatRupiah(amount: number): string {
  if (!Number.isSafeInteger(amount)) return String(amount);
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp${digits}`;
}
