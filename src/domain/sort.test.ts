import { compareNames, sortByName } from './sort';

describe('sortByName', () => {
  it('sorts A-Z ignoring case', () => {
    const names = ['budi', 'Citra', 'adi', 'Dewi', 'Bayu'];
    expect(sortByName(names, (n) => n)).toEqual(['adi', 'Bayu', 'budi', 'Citra', 'Dewi']);
  });

  it('does not change the input array', () => {
    const items = [{ name: 'b' }, { name: 'A' }];
    const sorted = sortByName(items, (i) => i.name);
    expect(items.map((i) => i.name)).toEqual(['b', 'A']);
    expect(sorted.map((i) => i.name)).toEqual(['A', 'b']);
  });

  it('is stable for equal names and handles an empty list', () => {
    const items = [
      { id: 1, name: 'Sari' },
      { id: 2, name: 'Sari' },
    ];
    expect(sortByName(items, (i) => i.name).map((i) => i.id)).toEqual([1, 2]);
    expect(sortByName([], (n: string) => n)).toEqual([]);
  });

  it('breaks case-only ties by exact spelling', () => {
    expect(compareNames('adi', 'Adi')).toBeGreaterThan(0);
    expect(compareNames('Adi', 'adi')).toBeLessThan(0);
    expect(compareNames('Adi', 'Adi')).toBe(0);
  });
});
