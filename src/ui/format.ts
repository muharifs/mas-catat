// Display helper for integer rupiah. It only formats; it never computes money.

/** 15000 becomes "Rp15.000". Non-integer input is shown as received (money is always integer in this app). */
export function formatRupiah(amount: number): string {
  if (!Number.isSafeInteger(amount)) return String(amount);
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp${digits}`;
}

/**
 * Amount with an explicit sign for lists: "+" or "-" in front of the absolute value ("-Rp15.000"), or the plain
 * formatRupiah text (a negative amount keeps its minus) when the sign is "".
 */
export function formatSigned(amount: number, sign: '+' | '-' | ''): string {
  if (sign === '') return formatRupiah(amount);
  return `${sign}${formatRupiah(Math.abs(amount))}`;
}

export type MoneyTone = 'positive' | 'negative' | 'neutral';

/** Colour meaning of an amount: "+" green, "-" red; without a sign, a negative balance is red and the rest neutral. */
export function moneyTone(amount: number, sign: '+' | '-' | ''): MoneyTone {
  if (sign === '+') return 'positive';
  if (sign === '-') return 'negative';
  return amount < 0 ? 'negative' : 'neutral';
}
