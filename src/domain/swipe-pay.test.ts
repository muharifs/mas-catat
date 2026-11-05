import { WEEKLY_DUE } from './money';
import { canSwipePay, SWIPE_PAYMENT_AMOUNT } from './swipe-pay';

describe('swipe payment', () => {
  it('records exactly one meeting of dues', () => {
    expect(SWIPE_PAYMENT_AMOUNT).toBe(15_000);
    expect(SWIPE_PAYMENT_AMOUNT).toBe(WEEKLY_DUE);
  });

  it('is allowed for a member in arrears in an active period', () => {
    expect(canSwipePay({ arrears: 15_000, periodActive: true, paidToday: false })).toBe(true);
    expect(canSwipePay({ arrears: 45_000, periodActive: true, paidToday: false })).toBe(true);
  });

  it('is allowed when only a non-multiple remainder is owed', () => {
    expect(canSwipePay({ arrears: 5_000, periodActive: true, paidToday: false })).toBe(true);
  });

  it('is disabled without arrears, so a repeat swipe cannot become an advance payment', () => {
    expect(canSwipePay({ arrears: 0, periodActive: true, paidToday: false })).toBe(false);
  });

  it('is disabled when the period has ended', () => {
    expect(canSwipePay({ arrears: 30_000, periodActive: false, paidToday: false })).toBe(false);
    expect(canSwipePay({ arrears: 0, periodActive: false, paidToday: false })).toBe(false);
  });

  it('is disabled once the member has paid today, even with old arrears left', () => {
    expect(canSwipePay({ arrears: 15_000, periodActive: true, paidToday: true })).toBe(false);
    expect(canSwipePay({ arrears: 45_000, periodActive: true, paidToday: true })).toBe(false);
  });
});
