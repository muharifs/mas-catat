// Preview of a member payment BEFORE it is saved. Pure functions.
//
// The repository saves a payment with the very same function (previewPayment), so what the form shows
// is exactly what gets stored. The UI only displays these numbers; it never computes money itself.
import { allocatePayments } from './allocation';
import { assertDuesMultiple, assertIsoDate, DomainError } from './money';
import { isRealDate } from './schedule';
import type { Allocation, IsoDate, Payment, Rupiah, WeekCredit, WeekStatus } from './types';

export interface PaymentPreview {
  amount: Rupiah;
  /** Weeks this payment fills, oldest first. Same rows that will be stored in `allocations`. */
  allocations: Allocation[];
  /** Part of the amount applied to weekly dues. */
  allocatedAmount: Rupiah;
  /** Part beyond the remaining dues of the period: becomes member credit (0 if none). */
  creditAmount: Rupiah;
  /** Weeks that are fully settled once this payment is saved (only weeks this payment touched). */
  settledWeeks: number[];
  /** A touched week that stays partly unpaid afterwards (possible after a capped host offset), or null. */
  partialWeek: number | null;
}

/**
 * Validates a payment date: a real calendar date, in the past or today (never in the future).
 * `today` is the device date as ISO; the caller supplies it so this stays pure.
 */
export function assertPaymentDate(date: IsoDate, today: IsoDate): void {
  assertIsoDate(date, 'payment date');
  if (!isRealDate(date)) throw new DomainError(`payment date is not a real calendar date: ${date}`);
  assertIsoDate(today, 'today');
  if (date > today) throw new DomainError(`payment date is in the future: ${date}`);
}

/**
 * What saving `payment` would do, given the member's current per-week state (stored payments and host
 * offsets already included in `statuses`). Throws DomainError if the amount is not a positive multiple of 15.000.
 */
export function previewPayment(payment: Payment, statuses: readonly WeekStatus[]): PaymentPreview {
  assertDuesMultiple(payment.amount, 'payment amount');
  const credits: WeekCredit[] = statuses.map((s) => ({ week: s.week, amount: s.paid + s.offset }));
  const result = allocatePayments([payment], statuses.length, credits);

  const touched = new Set(result.allocations.map((a) => a.week));
  const settledWeeks: number[] = [];
  let partialWeek: number | null = null;
  for (const w of result.weeks) {
    if (!touched.has(w.week)) continue;
    if (w.outstanding === 0) settledWeeks.push(w.week);
    else partialWeek = w.week;
  }
  return {
    amount: payment.amount,
    allocations: result.allocations,
    allocatedAmount: payment.amount - result.credit,
    creditAmount: result.credit,
    settledWeeks,
    partialWeek,
  };
}

/** Display state of one week of one member. */
export type WeekState = 'paid' | 'offset' | 'partial_offset' | 'partial' | 'unpaid';

/**
 * paid = settled by payments; offset = settled completely by the host payout offset;
 * partial_offset = offset plus something still open; partial = some payment but still open; unpaid = nothing.
 */
export function weekState(s: WeekStatus): WeekState {
  if (s.outstanding === 0) return s.offset > 0 && s.paid === 0 ? 'offset' : 'paid';
  if (s.offset > 0) return 'partial_offset';
  if (s.paid > 0) return 'partial';
  return 'unpaid';
}

/**
 * Turns text typed in the amount field into integer rupiah, or null when it is empty or not whole digits.
 * Dots, commas and spaces are accepted as thousands separators ("45.000"). No floating point is used.
 */
export function parseRupiahInput(text: string): Rupiah | null {
  const cleaned = text.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(cleaned) || cleaned.length > 12) return null;
  return Number(cleaned);
}
