// Rule for correcting a member payment (owner decision 2026-11-13, B3). Same pattern as the host change rule (F1).
import { DomainError } from './money';

/** Thrown when a member payment is corrected while that member's own host payout stands. The UI maps it to Indonesian text. */
export class PaymentHostPayoutStandsError extends DomainError {
  constructor(public readonly weekNumber: number) {
    super(`member has a host payout in force (week ${weekNumber}); correct the host payout before correcting a payment`);
    this.name = 'PaymentHostPayoutStandsError';
  }
}

/**
 * A payment of a member cannot be corrected while that member has a standing host payout in the payment's period:
 * the correction would re-open arrears that the payout no longer offsets (they would end up written off into kas).
 * Simple rule on purpose: ANY standing payout of the member as host in that period blocks, whatever weeks the payment
 * paid. `standingHostWeeks` = meetings hosted by this member whose payout is recorded and not corrected.
 */
export function assertPaymentCorrectable(standingHostWeeks: readonly number[]): void {
  const first = [...standingHostWeeks].sort((a, b) => a - b)[0];
  if (first !== undefined) throw new PaymentHostPayoutStandsError(first);
}
