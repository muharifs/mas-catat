import { csvRecordedAt, formatTime, parseCreatedAt, recordedAtLabel } from './dates';

// Every case passes an explicit offset (minutes east of UTC), so the tests do not depend on the machine time zone.
const WIB = 420;

describe('formatTime', () => {
  it('uses a dot, 24 hours and two digits', () => {
    expect(formatTime(new Date('2026-11-17T12:42:00.000Z'), WIB)).toBe('19.42');
    expect(formatTime(new Date('2026-11-17T01:15:00.000Z'), WIB)).toBe('08.15');
    expect(formatTime(new Date('2026-11-16T17:05:00.000Z'), WIB)).toBe('00.05');
  });
});

describe('parseCreatedAt', () => {
  it('accepts ISO timestamps with a zone', () => {
    expect(parseCreatedAt('2026-11-17T12:42:00.000Z')?.toISOString()).toBe('2026-11-17T12:42:00.000Z');
    expect(parseCreatedAt('2026-11-17T19:42:00+07:00')?.toISOString()).toBe('2026-11-17T12:42:00.000Z');
    expect(parseCreatedAt('2026-11-17T12:42Z')?.toISOString()).toBe('2026-11-17T12:42:00.000Z');
  });

  it('rejects empty, garbage, date-only, zone-less and impossible values', () => {
    expect(parseCreatedAt('')).toBeNull();
    expect(parseCreatedAt('abc')).toBeNull();
    expect(parseCreatedAt('2026-01-04')).toBeNull();
    expect(parseCreatedAt('2026-01-04T10:00:00')).toBeNull();
    expect(parseCreatedAt('2026-13-45T10:00:00Z')).toBeNull();
    expect(parseCreatedAt(null)).toBeNull();
    expect(parseCreatedAt(undefined)).toBeNull();
  });
});

describe('recordedAtLabel', () => {
  it('same local day as the entry date: only the time', () => {
    expect(recordedAtLabel('2026-11-17T12:42:00.000Z', '2026-11-17', false, WIB)).toBe('Dicatat 19.42');
  });

  it('00.05 keeps the leading zeros', () => {
    expect(recordedAtLabel('2026-11-16T17:05:00.000Z', '2026-11-17', false, WIB)).toBe('Dicatat 00.05');
  });

  it('another day, same year: day and month without the year', () => {
    expect(recordedAtLabel('2026-11-18T12:42:00.000Z', '2026-11-12', false, WIB)).toBe('Dicatat 18 Nov, 19.42');
  });

  it('another year than the entry date: the year is shown', () => {
    expect(recordedAtLabel('2027-01-01T18:15:00.000Z', '2026-12-29', false, WIB)).toBe('Dicatat 2 Jan 2027, 01.15');
    expect(recordedAtLabel('2027-01-02T01:15:00.000Z', '2026-12-29', false, WIB)).toBe('Dicatat 2 Jan 2027, 08.15');
  });

  it('UTC date that is the NEXT local day (late evening in WIB)', () => {
    // 2026-11-17 18:30 UTC = 2026-11-18 01:30 WIB
    expect(recordedAtLabel('2026-11-17T18:30:00.000Z', '2026-11-17', false, WIB)).toBe('Dicatat 18 Nov, 01.30');
    expect(recordedAtLabel('2026-11-17T18:30:00.000Z', '2026-11-18', false, WIB)).toBe('Dicatat 01.30');
  });

  it('UTC date that is the PREVIOUS local day (west of UTC)', () => {
    // 2026-11-18 02:30 UTC = 2026-11-17 21:30 at UTC-5
    expect(recordedAtLabel('2026-11-18T02:30:00.000Z', '2026-11-17', false, -300)).toBe('Dicatat 21.30');
    expect(recordedAtLabel('2026-11-18T02:30:00.000Z', '2026-11-18', false, -300)).toBe('Dicatat 17 Nov, 21.30');
  });

  it('long form is always the full date and time', () => {
    expect(recordedAtLabel('2026-11-17T12:42:00.000Z', '2026-11-17', true, WIB)).toBe('17 Nov 2026, 19.42');
    expect(recordedAtLabel('2026-11-18T12:42:00.000Z', '2026-11-12', true, WIB)).toBe('18 Nov 2026, 19.42');
  });

  it('empty, garbage and date-only created-at give nothing and do not throw', () => {
    for (const bad of ['', 'abc', '2026-01-04', '2026-01-04T10:00:00', null, undefined]) {
      expect(recordedAtLabel(bad, '2026-01-04', false, WIB)).toBe('');
      expect(recordedAtLabel(bad, '2026-01-04', true, WIB)).toBe('');
    }
  });

  it('without an offset it uses the device zone and still returns a well-formed label', () => {
    const label = recordedAtLabel('2026-11-17T12:42:00.000Z', '2026-11-17');
    expect(label).toMatch(/^Dicatat (\d{2}\.\d{2}|\d{1,2} [A-Z][a-z]{2}( \d{4})?, \d{2}\.\d{2})$/);
  });
});

describe('csvRecordedAt', () => {
  it('gives "YYYY-MM-DD HH:mm" in the given zone, with the local day (not the UTC day)', () => {
    expect(csvRecordedAt('2026-11-18T12:42:00.000Z', WIB)).toBe('2026-11-18 19:42');
    expect(csvRecordedAt('2026-11-17T18:30:00.000Z', WIB)).toBe('2026-11-18 01:30');
    expect(csvRecordedAt('2026-11-16T17:05:00.000Z', WIB)).toBe('2026-11-17 00:05');
    expect(csvRecordedAt('2026-11-18T02:30:00.000Z', -300)).toBe('2026-11-17 21:30');
  });

  it('empty, garbage and zone-less values give an empty cell and do not throw', () => {
    for (const bad of ['', 'abc', '2026-01-04', '2026-01-04T10:00:00', null, undefined]) {
      expect(csvRecordedAt(bad, WIB)).toBe('');
    }
  });

  it('without an offset it matches the device local clock, whatever the machine zone', () => {
    const iso = '2026-11-18T12:42:00.000Z';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(csvRecordedAt(iso)).toBe(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
  });
});
