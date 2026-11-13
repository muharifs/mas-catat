// QA: independent edge cases for the member search matcher (docs/specs/member-search-spec.md).
import { filterByQuery, MEMBER_SEARCH_MIN, matchesName, normalizeQuery, shouldShowMemberSearch } from './memberSearch';

const names = ['Ani', 'Anita', 'Aniq', 'Budi', 'Muhammad Arif', 'José'];
const run = (q: string, keep?: (n: string) => boolean) => filterByQuery(names, (n) => n, q, keep);

describe('member search QA', () => {
  it('shared prefix: "ani" matches Ani, Anita, Aniq (substring by spec); "anit" only Anita', () => {
    expect(run('ani').items).toEqual(['Ani', 'Anita', 'Aniq']);
    expect(run('anit').items).toEqual(['Anita']);
    expect(run('aniq').items).toEqual(['Aniq']);
  });
  it('tabs, newlines and mixed whitespace collapse', () => {
    expect(normalizeQuery(' \t Muhammad \n  ARIF  ')).toBe('muhammad arif');
    expect(matchesName('Muhammad Arif', 'arif\tmuhammad')).toBe(true);
  });
  it('no accent folding: "jose" does not match "José"; "josé" does', () => {
    expect(matchesName('José', 'jose')).toBe(false);
    expect(matchesName('José', 'JOSÉ')).toBe(true);
  });
  it('keep never hides a kept row even when query matches nothing; matchCount stays 0', () => {
    const r = run('zzz', (n) => n === 'Budi' || n === 'Aniq');
    expect(r.items).toEqual(['Aniq', 'Budi']);
    expect(r.matchCount).toBe(0);
  });
  it('no result: empty items and matchCount 0', () => {
    expect(run('qqq')).toEqual({ items: [], matchCount: 0 });
  });
  it('whitespace-only query returns all with full matchCount', () => {
    expect(run('   \t ')).toEqual({ items: names, matchCount: names.length });
  });
  it('threshold is 8: 8 hides, 9 shows', () => {
    expect(MEMBER_SEARCH_MIN).toBe(8);
    expect(shouldShowMemberSearch(8)).toBe(false);
    expect(shouldShowMemberSearch(9)).toBe(true);
  });
});
