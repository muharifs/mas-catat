import { appendAmountDigits, checkPaymentAmount, deleteLastDigit, groupDigits, MAX_AMOUNT_DIGITS, type AmountKey } from './amount-input';
import { parseRupiahInput } from './payment-preview';

function type(keys: AmountKey[]): string {
  return keys.reduce((text, key) => appendAmountDigits(text, key), '');
}

describe('appendAmountDigits', () => {
  test('typing 4, 5, 000 gives 45000', () => {
    expect(type(['4', '5', '000'])).toBe('45000');
  });

  test('0 and 000 on an empty amount stay empty (no leading zeros)', () => {
    expect(appendAmountDigits('', '0')).toBe('');
    expect(appendAmountDigits('', '000')).toBe('');
    expect(type(['0', '0', '0', '7'])).toBe('7');
  });

  test('zeros after a digit are kept', () => {
    expect(type(['1', '0'])).toBe('10');
    expect(type(['1', '000', '000'])).toBe('1000000');
  });

  test('stops at 12 digits and ignores a key that would not fit', () => {
    const eleven = '12345678901';
    expect(appendAmountDigits(eleven, '2')).toHaveLength(MAX_AMOUNT_DIGITS);
    const twelve = '123456789012';
    expect(appendAmountDigits(twelve, '3')).toBe(twelve);
    expect(appendAmountDigits('1234567890', '000')).toBe('1234567890'); // would be 13 digits
    expect(appendAmountDigits('123456789', '000')).toBe('123456789000'); // exactly 12 fits
  });

  test('what the keypad builds is always readable by parseRupiahInput', () => {
    expect(parseRupiahInput(type(['4', '5', '000']))).toBe(45_000);
    expect(parseRupiahInput(appendAmountDigits('123456789', '000'))).toBe(123_456_789_000);
  });
});

describe('deleteLastDigit', () => {
  test('removes one digit at a time', () => {
    expect(deleteLastDigit('45000')).toBe('4500');
    expect(deleteLastDigit('4')).toBe('');
  });

  test('empty stays empty', () => {
    expect(deleteLastDigit('')).toBe('');
  });
});

describe('groupDigits', () => {
  test('puts dots every three digits', () => {
    expect(groupDigits('')).toBe('');
    expect(groupDigits('5')).toBe('5');
    expect(groupDigits('999')).toBe('999');
    expect(groupDigits('1000')).toBe('1.000');
    expect(groupDigits('45000')).toBe('45.000');
    expect(groupDigits('1045000')).toBe('1.045.000');
    expect(groupDigits('123456789012')).toBe('123.456.789.012');
  });

  test('text that is not plain digits is returned as received', () => {
    expect(groupDigits('45.000')).toBe('45.000');
    expect(groupDigits('abc')).toBe('abc');
  });
});

describe('checkPaymentAmount', () => {
  test('nothing typed (or zero) is empty', () => {
    expect(checkPaymentAmount(null)).toBe('empty');
    expect(checkPaymentAmount(0)).toBe('empty');
  });

  test('positive multiples of 15.000 are ok', () => {
    expect(checkPaymentAmount(15_000)).toBe('ok');
    expect(checkPaymentAmount(30_000)).toBe('ok');
    expect(checkPaymentAmount(45_000)).toBe('ok');
  });

  test('partial amounts and other non-multiples are rejected', () => {
    expect(checkPaymentAmount(1)).toBe('not_multiple');
    expect(checkPaymentAmount(10_000)).toBe('not_multiple');
    expect(checkPaymentAmount(14_999)).toBe('not_multiple');
    expect(checkPaymentAmount(15_001)).toBe('not_multiple');
    expect(checkPaymentAmount(20_000)).toBe('not_multiple');
  });

  test('a very large multiple is ok (excess becomes credit, warned before saving)', () => {
    expect(checkPaymentAmount(15_000 * 1_000)).toBe('ok');
  });

  test('every amount the keypad can build is classified without throwing', () => {
    for (const text of ['1', '15000', '150000', '999999999999']) {
      expect(['ok', 'not_multiple']).toContain(checkPaymentAmount(parseRupiahInput(text)));
    }
  });
});
