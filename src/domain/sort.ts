// Display order of people. Pure. Only for lists on screen: stored order (period_members.initial_order) and
// anything relying on it are untouched.

/** Case-insensitive name comparison; ties fall back to the exact spelling so the order is stable. */
export function compareNames(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x < y) return -1;
  if (x > y) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A new array sorted A-Z by `nameOf(item)`, ignoring case. The input is not changed; equal names keep input order. */
export function sortByName<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((p, q) => compareNames(nameOf(p), nameOf(q)));
}
