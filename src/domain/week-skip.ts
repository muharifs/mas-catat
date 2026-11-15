// Skipping the last meeting of a period (decision 33). Pure rules, no React, Expo or SQLite imports.
//
// The last meeting (number = member count) of the ACTIVE period may be skipped when it is the oldest open meeting,
// every earlier meeting is closed and its host paid, and no host payout of the meeting stands. A skipped meeting has
// no dues, no payout, no offset and writes no ledger entry. Dues already paid for it become member credit. The skip
// can be undone (with a reason) until the period is closed. The repository checks the same rules again inside the
// write transaction; the migration triggers are the last line of defence.
import { DomainError } from './money';
import type { Rupiah } from './types';

export type WeekSkipErrorCode =
  | 'reason_required'
  | 'period_ended'
  | 'too_few_members'
  | 'not_last'
  | 'already_skipped'
  | 'not_skipped'
  | 'week_closed'
  | 'earlier_open'
  | 'host_unpaid'
  | 'payout_stands';

/** A skip rule was broken. `code` lets the UI pick the text; `weeks` lists meetings the owner can act on. */
export class WeekSkipError extends DomainError {
  constructor(
    public readonly code: WeekSkipErrorCode,
    message: string,
    public readonly weeks: readonly number[] = [],
  ) {
    super(message);
    this.name = 'WeekSkipError';
  }
}

/** What the skip rules need to know about one meeting. */
export interface SkipWeekInfo {
  number: number;
  /** Stored status. A skipped meeting is still 'open' here until its period closes. */
  status: 'open' | 'closed';
  /** A skip is in force for this meeting. */
  skipped: boolean;
  /** A host payout is in force (recorded and not corrected). */
  hasActivePayout: boolean;
}

export interface WeekSkipContext {
  periodId: string;
  periodStatus: 'active' | 'closed';
  memberCount: number;
  weeks: readonly SkipWeekInfo[];
}

/** Smallest period that may skip its last meeting. Provisional (decision 33): with one member nothing would be left. */
export const MIN_MEMBERS_TO_SKIP = 2;

export interface WeekSkipBlocker {
  code: WeekSkipErrorCode;
  message: string;
  /** Meetings behind the block (for host_unpaid: the closed meetings whose host is not paid). */
  weeks: readonly number[];
}

const blocker = (code: WeekSkipErrorCode, message: string, weeks: readonly number[] = []): WeekSkipBlocker => ({
  code,
  message,
  weeks,
});

/** Why the last meeting cannot be skipped now (reason text not checked), or null when it can. */
export function weekSkipBlocker(ctx: WeekSkipContext, number: number = ctx.memberCount): WeekSkipBlocker | null {
  if (ctx.periodStatus !== 'active') return blocker('period_ended', `period ${ctx.periodId} has ended; a skip cannot be changed`);
  if (ctx.memberCount < MIN_MEMBERS_TO_SKIP) {
    return blocker('too_few_members', `a period needs at least ${MIN_MEMBERS_TO_SKIP} members to skip its last meeting`);
  }
  if (number !== ctx.memberCount) return blocker('not_last', 'only the last meeting can be skipped');
  const week = ctx.weeks.find((w) => w.number === number);
  if (!week) return blocker('not_last', `week ${number} not found; only the last meeting can be skipped`);
  if (week.skipped) return blocker('already_skipped', `week ${number} is already skipped`);
  if (week.status !== 'open') return blocker('week_closed', `week ${number} is closed; it cannot be skipped`);
  const earlier = ctx.weeks.filter((w) => w.number < number);
  const oldestOpen = ctx.weeks.filter((w) => w.status === 'open').reduce((min, w) => Math.min(min, w.number), Infinity);
  if (earlier.some((w) => w.status !== 'closed') || oldestOpen !== number) {
    return blocker('earlier_open', `week ${number} is not the oldest open meeting; it cannot be skipped`);
  }
  const unpaid = earlier.filter((w) => !w.hasActivePayout).map((w) => w.number);
  if (unpaid.length > 0) {
    return blocker('host_unpaid', 'cannot skip: closed meetings have no host payout in force', unpaid);
  }
  if (week.hasActivePayout) return blocker('payout_stands', `week ${number} has a standing host payout; it cannot be skipped`, [number]);
  return null;
}

/** Throws WeekSkipError when the last meeting cannot be skipped (reason required too). */
export function assertWeekSkippable(ctx: WeekSkipContext, reason: string): void {
  if (reason.trim().length === 0) throw new WeekSkipError('reason_required', 'skip reason is required');
  const b = weekSkipBlocker(ctx);
  if (b) throw new WeekSkipError(b.code, b.message, b.weeks);
}

/** Throws WeekSkipError when the skip of meeting `number` cannot be undone (reason required too). */
export function assertSkipUndoable(ctx: WeekSkipContext, number: number, reason: string): void {
  if (reason.trim().length === 0) throw new WeekSkipError('reason_required', 'skip cancel reason is required');
  if (ctx.periodStatus !== 'active') {
    throw new WeekSkipError('period_ended', `period ${ctx.periodId} has ended; a skip cannot be changed`);
  }
  const week = ctx.weeks.find((w) => w.number === number);
  if (!week || !week.skipped) throw new WeekSkipError('not_skipped', `week ${number} is not skipped`);
  if (week.status !== 'open') throw new WeekSkipError('week_closed', `week ${number} is closed; its skip cannot be undone`);
}

/** Member amount settled on the meeting that is about to be skipped (it becomes member credit). */
export interface PrepaidMember {
  memberId: string;
  amount: Rupiah;
}

export interface WeekSkipPreview {
  /** The meeting that would be skipped (= member count). */
  number: number;
  eligible: boolean;
  /** Why not (null when eligible). */
  blocker: WeekSkipBlocker | null;
  /** Total already settled for the meeting; becomes member credit (Titipan). */
  prepaidTotal: Rupiah;
  /** Members with something settled for it. */
  prepaidMembers: number;
}

/** What the skip dialog shows. Pure: the repository supplies the per-member settled amounts. */
export function previewWeekSkip(ctx: WeekSkipContext, prepaid: readonly PrepaidMember[]): WeekSkipPreview {
  const withAmount = prepaid.filter((p) => p.amount > 0);
  const b = weekSkipBlocker(ctx);
  return {
    number: ctx.memberCount,
    eligible: b === null,
    blocker: b,
    prepaidTotal: withAmount.reduce((sum, p) => sum + p.amount, 0),
    prepaidMembers: withAmount.length,
  };
}

/**
 * The member whose turn to host was lost because the last meeting was skipped: the one member of the period who is
 * not the host of any meeting that took place. The host kept on the skipped meeting does not count. Null when the
 * period has no skipped meeting or when it is not exactly one member (nothing is guessed).
 */
export function skippedTurnMember(
  memberIds: readonly string[],
  weeks: readonly { hostMemberId: string | null; skipped: boolean }[],
): string | null {
  if (!weeks.some((w) => w.skipped)) return null;
  const hosted = new Set(weeks.filter((w) => !w.skipped && w.hostMemberId !== null).map((w) => w.hostMemberId));
  const left = memberIds.filter((id) => !hosted.has(id));
  return left.length === 1 ? (left[0] ?? null) : null;
}
