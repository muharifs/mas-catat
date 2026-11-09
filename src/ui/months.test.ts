import { formatMonth, shiftMonth } from './months';

describe('shiftMonth', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-11', -1)).toBe('2026-10');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });
});

describe('formatMonth', () => {
  it('writes the Indonesian month name and year', () => {
    expect(formatMonth('2026-11')).toBe('November 2026');
    expect(formatMonth('2026-08')).toBe('Agustus 2026');
  });
  it('returns a non-month unchanged', () => {
    expect(formatMonth('x')).toBe('x');
    expect(formatMonth('2026-13')).toBe('2026-13');
  });
});
