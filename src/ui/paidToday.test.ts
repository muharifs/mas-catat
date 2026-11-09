import { initialsOf, MAX_INITIALS, paidTodayView } from './paidToday';

describe('initialsOf', () => {
  it('uses the first letters of the first two words', () => {
    expect(initialsOf('Budi Santoso')).toBe('BS');
    expect(initialsOf('siti nur aini')).toBe('SN');
  });

  it('uses two letters of a single word and tolerates extra spaces', () => {
    expect(initialsOf('Dewi')).toBe('DE');
    expect(initialsOf('  A  ')).toBe('A');
  });

  it('never returns an empty string', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('paidTodayView', () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `Nama ${String.fromCharCode(65 + i)}` }));

  it('is empty and says nobody paid', () => {
    const v = paidTodayView([], 19);
    expect(v.initials).toEqual([]);
    expect(v.extra).toBe(0);
    expect(v.summary).toBe('Sudah bayar hari ini: 0 dari 19');
    expect(v.accessibilityLabel).toBe('Sudah bayar hari ini: 0 dari 19. Belum ada yang bayar hari ini.');
  });

  it('sorts A-Z and reads the names aloud', () => {
    const v = paidTodayView([{ id: '2', name: 'Siti' }, { id: '1', name: 'Budi' }], 5);
    expect(v.initials.map((i) => i.text)).toEqual(['BU', 'SI']);
    expect(v.accessibilityLabel).toBe('Sudah bayar hari ini: 2 dari 5. Budi, Siti.');
  });

  it('shows at most 7 circles and the rest as +N', () => {
    const v = paidTodayView(people(10), 19);
    expect(v.initials).toHaveLength(MAX_INITIALS);
    expect(v.extra).toBe(3);
    expect(paidTodayView(people(7), 19).extra).toBe(0);
  });
});
