// Rules for the one-gesture payment on the payment list (swipe a member row to the right). Pure functions.
import { WEEKLY_DUE } from './money';
import type { Rupiah } from './types';

/** The amount one swipe records: exactly one meeting's dues, into Tunai. Never typed or computed by the UI. */
export const SWIPE_PAYMENT_AMOUNT: Rupiah = WEEKLY_DUE;

export interface SwipePayInput {
  /** Unpaid dues of the meetings up to the current one (MemberPaymentBalance.arrears). */
  arrears: Rupiah;
  /** True while the period is active; an ended period accepts no payments. */
  periodActive: boolean;
}

/**
 * Whether a swipe may record a payment. Only a member who owes something through the current meeting, in an active
 * period: otherwise a repeated swipe would silently become an advance payment, which belongs in the full form.
 */
export function canSwipePay({ arrears, periodActive }: SwipePayInput): boolean {
  return periodActive && arrears > 0;
}
