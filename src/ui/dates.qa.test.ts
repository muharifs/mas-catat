import { formatTime, parseCreatedAt, recordedAtLabel } from './dates';

// QA additions for the "Dicatat" display. Explicit offsets keep the tests independent of the machine time zone.
const WIB = 420;

describe('recordedAtLabel: midnight boundaries (WIB)', () => {
  it('23.59 and 00.00 fall on different local days', () => {
    // 2026-11-17 16:59 UTC = 23:59 WIB on the 17th; 17:00 UTC = 00:00 WIB on the 18th.
    expect(recordedAtLabel('2026-11-17T16:59:59.999Z', '2026-11-17', false, WIB)).toBe('Dicatat 23.59');
    expect(recordedAtLabel('2026-11-17T17:00:00.000Z', '2026-11-17', false, WIB)).toBe('Dicatat 18 Nov, 00.00');
    expect(recordedAtLabel('2026-11-17T17:00:00.000Z', '2026-11-18', false, WIB)).toBe('Dicatat 00.00');
  });

  it('backdated entry recorded just after midnight shows the new day, not the entry date', () => {
    expect(recordedAtLabel('2026-11-17T17:05:00.000Z', '2026-11-12', false, WIB)).toBe('Dicatat 18 Nov, 00.05');
  });

  it('year rollover: recorded 1 Jan 00.05 for an entry dated 31 Dec shows the year', () => {
    expect(recordedAtLabel('2026-12-31T17:05:00.000Z', '2026-12-31', false, WIB)).toBe('Dicatat 1 Jan 2027, 00.05');
  });

  it('entry dated AFTER the recorded day (future-dated) still renders a day label', () => {
    expect(recordedAtLabel('2026-11-17T12:42:00.000Z', '2026-11-24', false, WIB)).toBe('Dicatat 17 Nov, 19.42');
  });

  it('leap day and long form', () => {
    expect(recordedAtLabel('2028-02-29T00:30:00.000Z', '2028-02-29', true, WIB)).toBe('29 Feb 2028, 07.30');
  });
});

describe('parseCreatedAt: strictness', () => {
  it('rejects padded, lowercase-t and space-separated values', () => {
    expect(parseCreatedAt(' 2026-11-17T12:42:00.000Z')).toBeNull();
    expect(parseCreatedAt('2026-11-17 12:42:00')).toBeNull();
    expect(parseCreatedAt('2026-11-17t12:42:00z')).toBeNull();
    expect(parseCreatedAt('1700000000000')).toBeNull();
  });

  it('rejects an out-of-range clock or offset', () => {
    expect(parseCreatedAt('2026-11-17T23:59:60Z')).toBeNull();
    expect(parseCreatedAt('2026-11-17T10:00:00+99:99')).toBeNull();
  });

  // V8 rolls impossible dates over instead of returning NaN, so parseCreatedAt range-checks the fields itself.
  // The app writes toISOString(), so this only matters for a hand-edited or damaged backup.
  it('rejects a calendar-impossible date (30 Feb) and 24:00', () => {
    expect(parseCreatedAt('2026-02-30T10:00:00Z')).toBeNull();
    expect(parseCreatedAt('2026-11-17T24:00:00Z')).toBeNull();
  });
});

describe('formatTime', () => {
  it('is stable at the edges of the day', () => {
    expect(formatTime(new Date('2026-11-17T17:00:00.000Z'), WIB)).toBe('00.00');
    expect(formatTime(new Date('2026-11-17T16:59:00.000Z'), WIB)).toBe('23.59');
  });
});
