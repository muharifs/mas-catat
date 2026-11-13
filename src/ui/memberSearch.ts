// Pure helpers for the member search field (docs/specs/member-search-spec.md). Display concern only: no money rules,
// so this lives in src/ui and not in src/domain. No regex is built from user text, so special characters are safe.

/** The search field shows only when the list on screen has MORE members than this. */
export const MEMBER_SEARCH_MIN = 8;

export function shouldShowMemberSearch(count: number): boolean {
  return count > MEMBER_SEARCH_MIN;
}

/** Trim, lower case, and collapse runs of whitespace into one space. */
export function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Every space-separated piece of the query must appear somewhere in the name (any order). Empty query matches all. */
export function matchesName(name: string, query: string): boolean {
  const q = normalizeQuery(query);
  if (q === '') return true;
  const n = normalizeQuery(name);
  return q.split(' ').every((piece) => n.includes(piece));
}

/**
 * Keeps the input order and never mutates the input. `keep` marks rows that must stay visible even without a match
 * (selected or being edited). `matchCount` counts real matches only.
 */
export function filterByQuery<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  query: string,
  keep?: (item: T) => boolean,
): { items: T[]; matchCount: number } {
  const result: T[] = [];
  let matchCount = 0;
  for (const item of items) {
    const matched = matchesName(nameOf(item), query);
    if (matched) matchCount += 1;
    if (matched || keep?.(item)) result.push(item);
  }
  return { items: result, matchCount };
}
