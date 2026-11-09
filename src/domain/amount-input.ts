// Pure helpers behind the amount keypad (AmountKeypad / AmountDisplay). The amount being typed is a plain STRING of
// digits; nothing here uses floating point. Which amounts are VALID stays with the domain rules in money.ts:
// checkPaymentAmount only wraps assertDuesMultiple so the UI never does `% 15000` itself. The repository checks the
// same rule again when saving, so nothing is loosened.
import { assertDuesMultiple, DomainError } from './money';
import type { Rupiah } from './types';

/** Same limit as parseRupiahInput (12 digits), so a typed amount can always be parsed. */
export const MAX_AMOUNT_DIGITS = 12;

export type AmountKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000';

/**
 * Adds a key to the digits typed so far. Leading zeros never appear: "0" or "000" on an empty amount changes
 * nothing. A key that would make the amount longer than 12 digits is ignored as a whole (no partial "000").
 */
export function appendAmountDigits(current: string, key: AmountKey): string {
  if (current === '' && (key === '0' || key === '000')) return '';
  const next = current + key;
  return next.length > MAX_AMOUNT_DIGITS ? current : next;
}

/** Removes the last digit (backspace). An empty amount stays empty. */
export function deleteLastDigit(current: string): string {
  return current.slice(0, -1);
}

/** "45000" becomes "45.000" (dots every three digits), for display. Non-digit text is returned as received. */
export function groupDigits(text: string): string {
  if (!/^\d+$/.test(text)) return text;
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export type PaymentAmountCheck = 'ok' | 'empty' | 'not_multiple';

/**
 * Is this amount a valid member payment? `null` (nothing typed) and 0 are 'empty'. Anything else must be a positive
 * multiple of Rp15.000 (assertDuesMultiple), otherwise 'not_multiple'. An amount ABOVE the remaining dues is still
 * 'ok': the excess becomes member credit and the form warns before saving.
 */
export function checkPaymentAmount(amount: Rupiah | null): PaymentAmountCheck {
  if (amount === null || amount === 0) return 'empty';
  try {
    assertDuesMultiple(amount, 'payment amount');
    return 'ok';
  } catch (e) {
    if (e instanceof DomainError) return 'not_multiple';
    throw e;
  }
}
