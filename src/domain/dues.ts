// Weekly dues, host payout, kas and per-member balance. Pure functions.
import { assertPositiveInt, DomainError, HOST_PAYOUT_PER_MEMBER, KAS_PER_MEMBER, WEEKLY_DUE } from './money';
import type { Rupiah, UnpaidWeek, WeekStatus } from './types';

/** Total collected in one week: 15.000 x N (every member pays, host included). */
export function weeklyTotalCollected(memberCount: number): Rupiah {
  assertPositiveInt(memberCount, 'memberCount');
  return WEEKLY_DUE * memberCount;
}

/** Host payout for one week: 10.000 x N, independent of who has paid. */
export function hostPayoutAmount(memberCount: number): Rupiah {
  assertPositiveInt(memberCount, 'memberCount');
  return HOST_PAYOUT_PER_MEMBER * memberCount;
}

/** Kas increase for one week: 5.000 x N. */
export function kasIncrease(memberCount: number): Rupiah {
  assertPositiveInt(memberCount, 'memberCount');
  return KAS_PER_MEMBER * memberCount;
}

/** A period lasts N weeks (every member hosts once). */
export function periodWeekCount(memberCount: number): number {
  assertPositiveInt(memberCount, 'memberCount');
  return memberCount;
}

/** Weeks up to and including throughWeek that still have an outstanding amount, oldest first. */
export function unpaidWeeksThrough(statuses: readonly WeekStatus[], throughWeek: number): UnpaidWeek[] {
  assertPositiveInt(throughWeek, 'throughWeek');
  return statuses
    .filter((s) => s.week <= throughWeek && s.outstanding > 0)
    .map((s) => ({ week: s.week, amount: s.outstanding }));
}

export interface MemberBalance {
  /** Dues for weeks 1..throughWeek. */
  dueToDate: Rupiah;
  /** Paid or offset amount covering weeks 1..throughWeek. */
  settledToDate: Rupiah;
  /** Debt: unpaid dues of weeks 1..throughWeek. */
  outstanding: Rupiah;
  /** Paid or offset amount already covering weeks after throughWeek (advance). */
  prepaid: Rupiah;
}

export function memberBalance(statuses: readonly WeekStatus[], throughWeek: number): MemberBalance {
  assertPositiveInt(throughWeek, 'throughWeek');
  if (throughWeek > statuses.length) {
    throw new DomainError(`throughWeek ${throughWeek} is beyond the ${statuses.length} weeks of the period`);
  }
  let dueToDate = 0;
  let settledToDate = 0;
  let outstanding = 0;
  let prepaid = 0;
  for (const s of statuses) {
    const settled = s.paid + s.offset;
    if (s.week <= throughWeek) {
      dueToDate += s.due;
      settledToDate += settled;
      outstanding += s.outstanding;
    } else {
      prepaid += settled;
    }
  }
  return { dueToDate, settledToDate, outstanding, prepaid };
}
