import { assertPaymentCorrectable, PaymentHostPayoutStandsError } from './payment-correction';
import { DomainError } from './money';

describe('assertPaymentCorrectable', () => {
  it('allows a correction when the member has no standing host payout', () => {
    expect(() => assertPaymentCorrectable([])).not.toThrow();
  });

  it('rejects when the member has a standing host payout, naming the first meeting', () => {
    let error: unknown;
    try {
      assertPaymentCorrectable([3, 2]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(PaymentHostPayoutStandsError);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as PaymentHostPayoutStandsError).weekNumber).toBe(2);
    expect((error as Error).name).toBe('PaymentHostPayoutStandsError');
  });
});
