// Preview of a member payment BEFORE it is saved. Pure functions.
//
// The repository saves a payment with the very same function (previewPayment), so what the form shows
// is exactly what gets stored. The UI only displays these numbers; it never computes money itself.
import { allocatePayments } from './allocation';
import { assertDuesMultiple, assertIsoDate, assertRupiah, DomainError, WEEKLY_DUE } from './money';
import { isRealDate } from './schedule';
import type { Allocation, IsoDate, Payment, Rupiah, WeekCredit, WeekStatus } from './types';

export interface PaymentPreview {
  amount: Rupiah;
  /** Weeks this payment fills, oldest first. Same rows that will be stored in `allocations`. */
  allocations: Allocation[];
  /** Number of weeks (pertemuan) this payment touches, fully or partly. */
  weekCount: number;
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
  const credited: WeekCredit[] = statuses.filter((s) => s.credited > 0).map((s) => ({ week: s.week, amount: s.credited }));
  const result = allocatePayments([payment], statuses.length, credits, credited);

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
    weekCount: touched.size,
    allocatedAmount: payment.amount - result.credit,
    creditAmount: result.credit,
    settledWeeks,
    partialWeek,
  };
}

/** Display state of one week of one member. */
export type WeekState = 'paid' | 'offset' | 'credited' | 'partial_offset' | 'partial_credited' | 'partial' | 'unpaid';

/**
 * paid = settled by payments; offset = settled completely by the host payout offset; credited = settled completely
 * by member credit (carry-over or close); partial_* = that kind plus something still open; partial = some payment
 * but still open; unpaid = nothing.
 */
export function weekState(s: WeekStatus): WeekState {
  if (s.outstanding === 0) {
    if (s.paid > 0) return 'paid';
    if (s.offset > 0) return 'offset';
    return s.credited > 0 ? 'credited' : 'paid';
  }
  if (s.offset > 0) return 'partial_offset';
  if (s.credited > 0) return 'partial_credited';
  if (s.paid > 0) return 'partial';
  return 'unpaid';
}

/** Message shown when the amount text is not plain digits or correctly grouped thousands. */
export const AMOUNT_FORMAT_HINT = 'Tulis jumlah tanpa koma, misalnya 45000 atau 45.000.';

const PLAIN_DIGITS = /^\d+$/;
const DOT_GROUPED = /^\d{1,3}(\.\d{3})+$/;

/**
 * Turns text typed in the amount field into integer rupiah, or null when it is empty or not a clean number.
 * Accepted: plain digits ("45000") or dots as correctly grouped thousands ("45.000", "1.045.000").
 * Rejected: commas, decimals ("15.00", "15000,00"), wrong grouping ("1.5000"), spaces inside, letters, signs.
 * Spaces around the whole text are ignored (phone keyboards add them). No floating point is used.
 */
export function parseRupiahInput(text: string): Rupiah | null {
  const trimmed = text.trim();
  if (!PLAIN_DIGITS.test(trimmed) && !DOT_GROUPED.test(trimmed)) return null;
  const digits = trimmed.replace(/\./g, '');
  if (digits.length > 12) return null;
  return Number(digits);
}

/** One quick-amount chip on the payment form. The amount is ALWAYS a valid payment (positive multiple of 15.000). */
export type PaymentChoice = { kind: 'weeks'; weeks: number; amount: Rupiah } | { kind: 'arrears'; amount: Rupiah };

export interface PaymentChoices {
  choices: PaymentChoice[];
  /**
   * Part of the arrears that NO valid payment can settle on its own (arrears modulo 15.000; 0 when the arrears is a
   * multiple). It exists after a capped host offset or a partly settled week. The chip then covers the largest valid
   * amount below the arrears (rounded DOWN, so a chip never creates member credit by surprise); the next payment
   * settles this remainder first, because payments fill the oldest open week first.
   */
  arrearsRemainder: Rupiah;
}

/** How many whole meetings the fixed chips offer (1, 2 and 3 meetings). */
const FIXED_CHIP_WEEKS = [1, 2, 3] as const;

/**
 * Quick amounts for the payment form: 1, 2 and 3 meetings, plus the member's arrears when there is any.
 * Pure: the UI shows these numbers and never computes them. A fixed chip with the same amount as the arrears
 * chip is dropped (one chip per amount). When the arrears is smaller than one meeting (only a non-multiple
 * remainder), no arrears chip is offered.
 */
export function paymentChoices(arrears: Rupiah): PaymentChoices {
  assertRupiah(arrears, 'arrears');
  const arrearsRemainder = arrears % WEEKLY_DUE;
  const arrearsAmount = arrears - arrearsRemainder;
  const choices: PaymentChoice[] = [];
  for (const weeks of FIXED_CHIP_WEEKS) {
    const amount = weeks * WEEKLY_DUE;
    if (amount === arrearsAmount) continue; // shown as the "Lunasi tunggakan" chip instead
    choices.push({ kind: 'weeks', weeks, amount });
  }
  if (arrearsAmount > 0) choices.push({ kind: 'arrears', amount: arrearsAmount });
  return { choices, arrearsRemainder };
}
