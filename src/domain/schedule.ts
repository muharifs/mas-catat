// Pure rules for the meeting schedule: date arithmetic, which meetings can be given a host, who can be picked,
// how estimated dates shift, and the automatic last meeting. No React, Expo or SQLite imports.
// Dates are ISO calendar dates ("YYYY-MM-DD"). In code a meeting is still called a "week".
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

export interface MeetingDatePreviewRow {
  /** 1-based meeting (week) number. */
  week: number;
  date: IsoDate;
}

/** Estimated dates for a new period: meeting 1 on startDate, every next meeting 7 days later. */
export function previewMeetingDates(startDate: IsoDate, meetingCount: number): MeetingDatePreviewRow[] {
  if (!isRealDate(startDate)) throw new DomainError(`startDate is not a real calendar date: ${startDate}`);
  return Array.from({ length: Math.max(0, meetingCount) }, (_, i) => ({ week: i + 1, date: addDays(startDate, 7 * i) }));
}

/** The minimum a schedule rule needs to know about one meeting. */
export interface ScheduleWeek {
  number: number;
  date: IsoDate;
  /** NULL = "Belum ditentukan". */
  hostMemberId: string | null;
  status: 'open' | 'closed';
}

/** Final host and date of one meeting after a change. */
export interface WeekChange {
  number: number;
  hostMemberId: string | null;
  date: IsoDate;
}

const byNumber = (weeks: readonly ScheduleWeek[]): ScheduleWeek[] => [...weeks].sort((a, b) => a.number - b.number);

/** Meetings that may get a host or a new date: the current (oldest open) meeting and the next open one. */
export function selectableWeekNumbers(weeks: readonly ScheduleWeek[]): number[] {
  return byNumber(weeks)
    .filter((w) => w.status === 'open')
    .slice(0, 2)
    .map((w) => w.number);
}

/** Members who may still be picked: everyone who has not hosted a CLOSED meeting yet. */
export function eligibleHostIds(weeks: readonly ScheduleWeek[], memberIds: readonly string[]): string[] {
  const hosted = new Set(weeks.filter((w) => w.status === 'closed' && w.hostMemberId !== null).map((w) => w.hostMemberId));
  return memberIds.filter((id) => !hosted.has(id));
}

/** Date offered by default: 7 days after the previous meeting; for meeting 1 its own current date. */
export function defaultMeetingDate(weeks: readonly ScheduleWeek[], number: number): IsoDate {
  const week = weeks.find((w) => w.number === number);
  if (!week) throw new DomainError(`week ${number} not found`);
  const previous = weeks.find((w) => w.number === number - 1);
  return previous ? addDays(previous.date, 7) : week.date;
}

export type MeetingDateProblem =
  | { kind: 'not_real' }
  | { kind: 'not_after_previous'; limit: IsoDate }
  | { kind: 'not_before_next'; limit: IsoDate };

/**
 * Why `date` cannot be the date of meeting `number`, or null when it is fine. A date must be a real date, later
 * than the previous meeting's date, and (when the next meeting already has a host or is closed, so its date is
 * fixed) earlier than that date. The UI turns the kind into Indonesian text.
 */
export function meetingDateProblem(
  weeks: readonly ScheduleWeek[],
  number: number,
  date: string,
): MeetingDateProblem | null {
  if (!isRealDate(date)) return { kind: 'not_real' };
  const previous = weeks.find((w) => w.number === number - 1);
  if (previous && date <= previous.date) return { kind: 'not_after_previous', limit: previous.date };
  const next = weeks.find((w) => w.number === number + 1);
  if (next && (next.hostMemberId !== null || next.status === 'closed') && date >= next.date) {
    return { kind: 'not_before_next', limit: next.date };
  }
  return null;
}

function assertMeetingDate(weeks: readonly ScheduleWeek[], number: number, date: string): void {
  const problem = meetingDateProblem(weeks, number, date);
  if (!problem) return;
  if (problem.kind === 'not_real') throw new DomainError(`meeting date is not a real calendar date: ${date}`);
  if (problem.kind === 'not_after_previous') {
    throw new DomainError(`meeting date must be later than the previous meeting date (${problem.limit})`);
  }
  throw new DomainError(`meeting date must be earlier than the next meeting date (${problem.limit})`);
}

/**
 * Open meetings after the last meeting that has a host keep ESTIMATED dates: 7 days apart, counted from that
 * last chosen date. Meetings before it, closed meetings and meetings with a host are never shifted.
 */
function shiftEstimates(state: ScheduleWeek[]): void {
  const anchor = [...state].reverse().find((w) => w.hostMemberId !== null);
  if (!anchor) return;
  for (const w of state) {
    if (w.number > anchor.number && w.status === 'open') w.date = addDays(anchor.date, 7 * (w.number - anchor.number));
  }
}

/** Last meeting: when exactly one open meeting has no host, the one member without a meeting takes it. */
function assignLast(state: ScheduleWeek[], memberIds: readonly string[]): void {
  const unassigned = state.filter((w) => w.status === 'open' && w.hostMemberId === null);
  if (unassigned.length !== 1) return;
  const used = new Set(state.map((w) => w.hostMemberId));
  const free = memberIds.filter((id) => !used.has(id));
  const last = unassigned[0];
  if (free.length === 1 && last) last.hostMemberId = free[0] ?? null;
}

/**
 * Hosts that must be set automatically for a fresh schedule (a period with one member, or any state with exactly
 * one meeting and one member left). Empty when nothing is automatic.
 */
export function planAutoAssignment(weeks: readonly ScheduleWeek[], memberIds: readonly string[]): WeekChange[] {
  const state = weeks.map((w) => ({ ...w }));
  assignLast(state, memberIds);
  return diff(weeks, state);
}

function diff(before: readonly ScheduleWeek[], after: readonly ScheduleWeek[]): WeekChange[] {
  const changes: WeekChange[] = [];
  for (const w of after) {
    const old = before.find((b) => b.number === w.number);
    if (old && (old.hostMemberId !== w.hostMemberId || old.date !== w.date)) {
      changes.push({ number: w.number, hostMemberId: w.hostMemberId, date: w.date });
    }
  }
  return changes;
}

export interface AssignmentInput {
  weeks: readonly ScheduleWeek[];
  /** The N members of the period. */
  memberIds: readonly string[];
  number: number;
  memberId: string;
  date: string;
}

/**
 * Everything that changes when `memberId` is picked as host of meeting `number` on `date`.
 *  - Only the current (oldest open) and the next open meeting can be changed.
 *  - Members who hosted a closed meeting cannot be picked.
 *  - If the member already holds ANOTHER open meeting, the two hosts are exchanged (the other meeting gets this
 *    meeting's previous host, possibly none). This keeps old, fully scheduled periods usable.
 *  - Dates of later unassigned meetings are re-estimated, and the last meeting is assigned automatically.
 * Returns only the meetings that actually change (empty = nothing to do). Throws DomainError when not allowed.
 */
export function planAssignment(input: AssignmentInput): WeekChange[] {
  const { memberIds, number, memberId, date } = input;
  const weeks = byNumber(input.weeks);
  const target = weeks.find((w) => w.number === number);
  if (!target) throw new DomainError(`week ${number} not found`);
  if (target.status === 'closed') throw new DomainError(`week ${number} is closed; its host cannot be changed`);
  if (!selectableWeekNumbers(weeks).includes(number)) {
    throw new DomainError(`week ${number} is outside the selectable window (the current and the next week only)`);
  }
  if (!memberIds.includes(memberId)) throw new DomainError(`member ${memberId} not found in this period`);
  if (!eligibleHostIds(weeks, memberIds).includes(memberId)) {
    throw new DomainError(`member ${memberId} already hosted a closed week`);
  }
  assertMeetingDate(weeks, number, date);

  const state = weeks.map((w) => ({ ...w }));
  const targetState = state.find((w) => w.number === number) as ScheduleWeek; // exists: found above
  const holder = state.find((w) => w.status === 'open' && w.number !== number && w.hostMemberId === memberId);
  if (holder) holder.hostMemberId = targetState.hostMemberId;
  targetState.hostMemberId = memberId;
  targetState.date = date;
  shiftEstimates(state);
  assignLast(state, memberIds);

  for (let i = 1; i < state.length; i += 1) {
    if ((state[i] as ScheduleWeek).date <= (state[i - 1] as ScheduleWeek).date) {
      throw new DomainError('meeting dates must stay in order, each later than the one before');
    }
  }
  return diff(weeks, state);
}
