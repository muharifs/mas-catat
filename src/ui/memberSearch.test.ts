import { filterByQuery, matchesName, MEMBER_SEARCH_MIN, normalizeQuery, shouldShowMemberSearch } from './memberSearch';

const id = (s: string) => s;

describe('memberSearch', () => {
  it('empty and whitespace-only queries match everything', () => {
    const names = ['Siti', 'Budi', 'Ani'];
    expect(filterByQuery(names, id, '')).toEqual({ items: names, matchCount: 3 });
    expect(filterByQuery(names, id, '   ')).toEqual({ items: names, matchCount: 3 });
  });

  it('ignores letter case', () => {
    expect(matchesName('Siti Aminah', 'SITI')).toBe(true);
    expect(matchesName('SITI', 'siti')).toBe(true);
  });

  it('ignores leading and trailing spaces in the query', () => {
    expect(matchesName('Siti Aminah', '  siti  ')).toBe(true);
  });

  it('collapses repeated spaces in query and name', () => {
    expect(matchesName('Siti  Aminah', 'siti   aminah')).toBe(true);
    expect(normalizeQuery(' A \t\n B ')).toBe('a b');
  });

  it('matches in the middle of a name', () => {
    expect(matchesName('Siti Aminah', 'min')).toBe(true);
    expect(matchesName('Muhammad Ahmad', 'ahma')).toBe(true);
  });

  it('needs every piece, in any order', () => {
    expect(matchesName('Muhammad Arif', 'arif muh')).toBe(true);
    expect(matchesName('Muhammad Arif', 'arif budi')).toBe(false);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterByQuery(['Siti'], id, 'xyz')).toEqual({ items: [], matchCount: 0 });
  });

  it('treats punctuation and regex characters as plain text', () => {
    expect(matchesName("Rina O'Brien", "o'brien")).toBe(true);
    expect(matchesName('Ani-ani', 'ani-ani')).toBe(true);
    for (const q of ['(', '[', '.', '*', '\\', '+', '?']) {
      expect(() => matchesName('Siti (Ani) [x]', q)).not.toThrow();
    }
    expect(matchesName('Siti (Ani)', '(ani')).toBe(true);
    expect(matchesName('Siti', '.')).toBe(false);
  });

  it('keeps input order and does not mutate the input', () => {
    const input = ['Budi', 'Ani', 'Citra', 'Bani'];
    const copy = [...input];
    expect(filterByQuery(input, id, 'ni').items).toEqual(['Ani', 'Bani']);
    expect(input).toEqual(copy);
  });

  it('keeps a non-matching row at its original position without counting it', () => {
    const input = ['Ani', 'Budi', 'Bani'];
    const result = filterByQuery(input, id, 'ani', (n) => n === 'Budi');
    expect(result.items).toEqual(['Ani', 'Budi', 'Bani']);
    expect(result.matchCount).toBe(2);
  });

  it('does not duplicate a row that matches and is kept', () => {
    const result = filterByQuery(['Ani', 'Budi'], id, 'ani', (n) => n === 'Ani');
    expect(result).toEqual({ items: ['Ani'], matchCount: 1 });
  });

  it('handles an empty list', () => {
    expect(filterByQuery([], id, 'a')).toEqual({ items: [], matchCount: 0 });
  });

  it('does not throw on a very long name or query', () => {
    const longName = 'Siti Nurhaliza Rahmawati binti Abdurrahman '.repeat(50);
    expect(() => matchesName(longName, 'x'.repeat(5000))).not.toThrow();
    expect(matchesName(longName, 'abdurrahman')).toBe(true);
  });

  it('shouldShowMemberSearch uses the threshold', () => {
    expect(MEMBER_SEARCH_MIN).toBe(8);
    for (const n of [0, 1, 8]) expect(shouldShowMemberSearch(n)).toBe(false);
    for (const n of [9, 19]) expect(shouldShowMemberSearch(n)).toBe(true);
  });

  it('keeps duplicate names in input order', () => {
    const input = [
      { id: 1, name: 'Siti' },
      { id: 2, name: 'Siti' },
    ];
    const result = filterByQuery(input, (m) => m.name, 'siti');
    expect(result.items.map((m) => m.id)).toEqual([1, 2]);
    expect(result.matchCount).toBe(2);
  });
});
