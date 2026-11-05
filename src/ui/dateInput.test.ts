import { BASIC_SHORTCUTS, formatDateInput, MEETING_SHORTCUTS, readDateInput, shortcutDate } from './dateInput';

describe('formatDateInput', () => {
  it('adds the hyphens while digits are typed', () => {
    expect(formatDateInput('')).toBe('');
    expect(formatDateInput('2026')).toBe('2026');
    expect(formatDateInput('20260')).toBe('2026-0');
    expect(formatDateInput('202601')).toBe('2026-01');
    expect(formatDateInput('2026010')).toBe('2026-01-0');
    expect(formatDateInput('20260104')).toBe('2026-01-04');
  });

  it('accepts an already formatted or pasted date and drops anything else', () => {
    expect(formatDateInput('2026-01-04')).toBe('2026-01-04');
    expect(formatDateInput('2026/01/04')).toBe('2026-01-04');
    expect(formatDateInput('2026-01-04 ')).toBe('2026-01-04');
    expect(formatDateInput('abc2026')).toBe('2026');
  });

  it('caps at 8 digits', () => {
    expect(formatDateInput('202601049999')).toBe('2026-01-04');
  });

  it('lets the owner delete back through a hyphen', () => {
    // Deleting the last digit of "2026-0" leaves "2026-": the hyphen disappears with it.
    expect(formatDateInput('2026-')).toBe('2026');
  });
});

describe('readDateInput', () => {
  it('tells empty, incomplete, invalid and valid apart', () => {
    expect(readDateInput('')).toBe('empty');
    expect(readDateInput('2026-01')).toBe('incomplete');
    expect(readDateInput('2026-02-31')).toBe('invalid');
    expect(readDateInput('2026-13-01')).toBe('invalid');
    expect(readDateInput('2026-01-04')).toBe('valid');
    expect(readDateInput('2028-02-29')).toBe('valid');
    expect(readDateInput('2027-02-29')).toBe('invalid');
  });
});

describe('shortcutDate', () => {
  const today = '2026-03-01';
  it('counts today, yesterday and 7 days ago from today, whatever is in the field', () => {
    expect(shortcutDate('today', today, '2026-01-01')).toBe('2026-03-01');
    expect(shortcutDate('yesterday', today, '2026-01-01')).toBe('2026-02-28');
    expect(shortcutDate('week_ago', today, '')).toBe('2026-02-22');
  });

  it('moves the date in the field for the relative shortcuts, across month and year ends', () => {
    expect(shortcutDate('minus_day', today, '2026-01-01')).toBe('2025-12-31');
    expect(shortcutDate('plus_day', today, '2026-01-31')).toBe('2026-02-01');
    expect(shortcutDate('plus_week', today, '2026-01-04')).toBe('2026-01-11');
  });

  it('falls back to today when the field holds no real date', () => {
    expect(shortcutDate('plus_week', today, '2026-0')).toBe('2026-03-08');
    expect(shortcutDate('minus_day', today, '2026-02-31')).toBe('2026-02-28');
  });

  it('offers the three basic shortcuts everywhere and six on the meeting screen', () => {
    expect(BASIC_SHORTCUTS).toEqual(['today', 'yesterday', 'week_ago']);
    expect(MEETING_SHORTCUTS).toEqual(['today', 'yesterday', 'week_ago', 'minus_day', 'plus_day', 'plus_week']);
  });
});
