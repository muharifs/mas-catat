import { DomainError } from './money';
import { addDays, isRealDate, moveItem, previewSchedule } from './schedule';

describe('moveItem', () => {
  it('moves an item up and down without touching the input', () => {
    const input = ['a', 'b', 'c'];
    expect(moveItem(input, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(input, 1, 1)).toEqual(['a', 'c', 'b']);
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('ignores moves past either end or out of range', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, -1)).toEqual(['a', 'b']);
  });
});

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-25', 7)).toBe('2026-02-01');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2028-02-22', 7)).toBe('2028-02-29');
  });

  it('detects real calendar dates', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2026-02-31')).toBe(false);
    expect(isRealDate('2026-2-3')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
});

describe('previewSchedule', () => {
  it('lists week number, weekly date and host in order', () => {
    expect(previewSchedule('2026-01-04', ['x', 'y', 'z'])).toEqual([
      { week: 1, date: '2026-01-04', memberId: 'x' },
      { week: 2, date: '2026-01-11', memberId: 'y' },
      { week: 3, date: '2026-01-18', memberId: 'z' },
    ]);
  });

  it('is empty without members and rejects an impossible date', () => {
    expect(previewSchedule('2026-01-04', [])).toEqual([]);
    expect(() => previewSchedule('2026-02-31', ['x'])).toThrow(DomainError);
  });
});
