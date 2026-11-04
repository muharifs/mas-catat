// Pure helpers for the host schedule: moving members in the host order and previewing week dates.
// No React, Expo or SQLite imports. Dates are ISO calendar dates ("YYYY-MM-DD").
import { assertIsoDate, DomainError } from './money';
import type { IsoDate } from './types';

/** Calendar date arithmetic on ISO dates (UTC, so no timezone or DST surprises). */
export function addDays(iso: IsoDate, days: number): IsoDate {
  assertIsoDate(iso, 'date');
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

/** True when the string is a real calendar date (rejects "2026-02-31"). */
export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return addDays(iso, 0) === iso;
}

/** Returns a new array with the item at `index` moved one step up (-1) or down (+1). Out of range = unchanged copy. */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const copy = [...items];
  const target = index + direction;
  if (index < 0 || index >= copy.length || target < 0 || target >= copy.length) return copy;
  const moving = copy[index] as T;
  copy[index] = copy[target] as T;
  copy[target] = moving;
  return copy;
}

export interface SchedulePreviewRow {
  /** 1-based week number. */
  week: number;
  date: IsoDate;
  memberId: string;
}

/** Week 1 is on startDate, every next week 7 days later; hostOrder[0] hosts week 1. */
export function previewSchedule(startDate: IsoDate, hostOrder: readonly string[]): SchedulePreviewRow[] {
  if (!isRealDate(startDate)) throw new DomainError(`startDate is not a real calendar date: ${startDate}`);
  return hostOrder.map((memberId, i) => ({ week: i + 1, date: addDays(startDate, 7 * i), memberId }));
}
