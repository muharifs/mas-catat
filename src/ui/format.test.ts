import { formatRupiah, formatSigned, moneyTone } from './format';

describe('formatRupiah', () => {
  it('groups thousands with dots and keeps the minus of a negative balance', () => {
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(15_000)).toBe('Rp15.000');
    expect(formatRupiah(1_045_000)).toBe('Rp1.045.000');
    expect(formatRupiah(-5_000)).toBe('-Rp5.000');
  });
});

describe('formatSigned', () => {
  it('puts the explicit sign in front of the absolute amount', () => {
    expect(formatSigned(15_000, '+')).toBe('+Rp15.000');
    expect(formatSigned(15_000, '-')).toBe('-Rp15.000');
    expect(formatSigned(-15_000, '-')).toBe('-Rp15.000');
  });

  it('falls back to plain formatting without a sign', () => {
    expect(formatSigned(15_000, '')).toBe('Rp15.000');
    expect(formatSigned(-15_000, '')).toBe('-Rp15.000');
  });
});

describe('moneyTone', () => {
  it('colours by sign, and a negative balance is red', () => {
    expect(moneyTone(10, '+')).toBe('positive');
    expect(moneyTone(10, '-')).toBe('negative');
    expect(moneyTone(-10, '')).toBe('negative');
    expect(moneyTone(10, '')).toBe('neutral');
    expect(moneyTone(0, '')).toBe('neutral');
  });
});
