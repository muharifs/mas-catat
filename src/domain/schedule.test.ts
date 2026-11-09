import { DomainError } from './money';
import {
  addDays,
  daysBetween,
  defaultMeetingDate,
  assertNoStandingPayout,
  eligibleHostIds,
  HostPayoutStandsError,
  isRealDate,
  MEETING_WEEKDAY,
  meetingDateProblem,
  nearestMeetingDayOnOrAfter,
  nextMeetingDate,
  planAssignment,
  planAutoAssignment,
  previewMeetingDates,
  selectableWeekNumbers,
  type ScheduleWeek,
  weekdayOf,
} from './schedule';

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-27', 7)).toBe('2026-02-03');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2028-02-22', 7)).toBe('2028-02-29');
  });

  it('detects real calendar dates', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2026-02-31')).toBe(false);
    expect(isRealDate('2026-2-3')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
});

describe('Tuesday meetings', () => {
  it('uses Tuesday as the meeting weekday', () => {
    expect(MEETING_WEEKDAY).toBe(2);
    expect(weekdayOf('2026-11-03')).toBe(2); // Tuesday
    expect(weekdayOf('2026-11-08')).toBe(0); // Sunday
  });

  it('finds the nearest Tuesday on or after a date', () => {
    expect(nearestMeetingDayOnOrAfter('2026-11-03')).toBe('2026-11-03'); // already Tuesday
    expect(nearestMeetingDayOnOrAfter('2026-11-04')).toBe('2026-11-10'); // Wednesday
    expect(nearestMeetingDayOnOrAfter('2026-11-02')).toBe('2026-11-03'); // Monday
    expect(nearestMeetingDayOnOrAfter('2026-11-06')).toBe('2026-11-10'); // Friday
    expect(nearestMeetingDayOnOrAfter('2026-12-30')).toBe('2027-01-05'); // across the year end
  });

  it('is 7 days after a Tuesday, 6 after a Wednesday, 8 after a Monday, 10 after a Saturday', () => {
    expect(nextMeetingDate('2026-11-03')).toBe('2026-11-10'); // Tue
    expect(nextMeetingDate('2026-11-04')).toBe('2026-11-10'); // Wed: +6
    expect(nextMeetingDate('2026-11-02')).toBe('2026-11-10'); // Mon: +8
    expect(nextMeetingDate('2026-11-07')).toBe('2026-11-17'); // Sat: +10
  });

  it('always lands on a Tuesday after the previous date, for every weekday', () => {
    const expectedDays = [9, 8, 7, 6, 5, 4, 10]; // Sunday..Saturday
    for (let i = 0; i < 7; i += 1) {
      const previous = addDays('2026-11-01', i); // 2026-11-01 is a Sunday
      const next = nextMeetingDate(previous);
      expect(weekdayOf(next)).toBe(MEETING_WEEKDAY);
      expect(daysBetween(previous, next)).toBe(expectedDays[i]);
    }
  });

  it('keeps the whole preview on Tuesdays across month and year ends', () => {
    const rows = previewMeetingDates('2026-12-15', 4);
    expect(rows.map((r) => r.date)).toEqual(['2026-12-15', '2026-12-22', '2026-12-29', '2027-01-05']);
    expect(rows.every((r) => weekdayOf(r.date) === MEETING_WEEKDAY)).toBe(true);
    const feb = previewMeetingDates('2028-02-15', 3); // leap year
    expect(feb.map((r) => r.date)).toEqual(['2028-02-15', '2028-02-22', '2028-02-29']);
  });

  it('returns to Tuesday after a start date that is not a Tuesday', () => {
    // Wednesday start: next is Tuesday (+6), then Tuesdays 7 days apart
    expect(previewMeetingDates('2026-11-04', 3).map((r) => r.date)).toEqual(['2026-11-04', '2026-11-10', '2026-11-17']);
  });

  it('re-estimates later meetings back to Tuesday after a meeting was moved to Wednesday', () => {
    const changes = planAssignment({
      weeks: [
        { number: 1, date: '2026-11-03', hostMemberId: null, status: 'open' },
        { number: 2, date: '2026-11-10', hostMemberId: null, status: 'open' },
        { number: 3, date: '2026-11-17', hostMemberId: null, status: 'open' },
      ],
      memberIds: ['a', 'b', 'c'],
      number: 1,
      memberId: 'a',
      date: '2026-11-11', // Wednesday, a week later than planned
    });
    // meeting 2 is 6 days later (Tuesday again), meeting 3 is 7 days after that
    expect(changes.map((c) => c.date)).toEqual(['2026-11-11', '2026-11-17', '2026-11-24']);
  });
});

describe('previewMeetingDates', () => {
  it('lists the estimated date of every meeting, a Tuesday 7 days apart', () => {
    expect(previewMeetingDates('2026-01-06', 3)).toEqual([
      { week: 1, date: '2026-01-06' },
      { week: 2, date: '2026-01-13' },
      { week: 3, date: '2026-01-20' },
    ]);
  });

  it('is empty without members and rejects an impossible date', () => {
    expect(previewMeetingDates('2026-01-06', 0)).toEqual([]);
    expect(() => previewMeetingDates('2026-02-31', 1)).toThrow(DomainError);
  });
});

/** A fresh schedule of `n` meetings from Tuesday 2026-01-06, weekly, no hosts. `hosts` fills hosts from meeting 1. */
function schedule(n: number, hosts: (string | null)[] = [], closed = 0): ScheduleWeek[] {
  return Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    date: addDays('2026-01-06', 7 * i),
    hostMemberId: hosts[i] ?? null,
    status: i < closed ? ('closed' as const) : ('open' as const),
  }));
}
const MEMBERS = ['a', 'b', 'c', 'd'];

describe('selectableWeekNumbers', () => {
  it('is the oldest open meeting and the next one', () => {
    expect(selectableWeekNumbers(schedule(4))).toEqual([1, 2]);
    expect(selectableWeekNumbers(schedule(4, ['a', 'b'], 1))).toEqual([2, 3]);
    expect(selectableWeekNumbers(schedule(4, ['a', 'b', 'c'], 3))).toEqual([4]);
    expect(selectableWeekNumbers(schedule(2, ['a', 'b'], 2))).toEqual([]);
  });
});

describe('eligibleHostIds', () => {
  it('excludes only members who hosted a closed meeting', () => {
    expect(eligibleHostIds(schedule(4), MEMBERS)).toEqual(MEMBERS);
    expect(eligibleHostIds(schedule(4, ['a', 'b', 'c', 'd'], 2), MEMBERS)).toEqual(['c', 'd']);
    // an OPEN meeting does not use up a turn
    expect(eligibleHostIds(schedule(4, ['a', 'b'], 0), MEMBERS)).toEqual(MEMBERS);
  });
});

describe('defaultMeetingDate and meetingDateProblem', () => {
  it('defaults to the Tuesday closest to 7 days after the previous meeting, and to its own date for meeting 1', () => {
    const weeks = schedule(3, ['a']);
    expect(defaultMeetingDate(weeks, 1)).toBe('2026-01-06');
    expect(defaultMeetingDate([{ ...weeks[0], date: '2026-01-09' } as ScheduleWeek, ...weeks.slice(1)], 2)).toBe('2026-01-13');
    // a Friday meeting is followed by the Tuesday 4 days later, not by the Friday after
    expect(() => defaultMeetingDate(weeks, 9)).toThrow(DomainError);
  });

  it('rejects non-dates and dates not later than the previous meeting', () => {
    const weeks = schedule(3);
    expect(meetingDateProblem(weeks, 2, '2026-02-31')).toEqual({ kind: 'not_real' });
    expect(meetingDateProblem(weeks, 2, 'besok')).toEqual({ kind: 'not_real' });
    expect(meetingDateProblem(weeks, 2, '2026-01-06')).toEqual({ kind: 'not_after_previous', limit: '2026-01-06' });
    expect(meetingDateProblem(weeks, 2, '2026-01-07')).toBeNull();
    expect(meetingDateProblem(weeks, 1, '2020-01-01')).toBeNull(); // meeting 1 has no previous meeting
  });

  it('rejects a date on or after a next meeting whose date is fixed (has a host)', () => {
    const weeks = schedule(3, ['a', 'b']);
    expect(meetingDateProblem(weeks, 1, '2026-01-13')).toEqual({ kind: 'not_before_next', limit: '2026-01-13' });
    expect(meetingDateProblem(weeks, 1, '2026-01-12')).toBeNull();
    // the next meeting is only an estimate: no upper limit (its estimate shifts instead)
    expect(meetingDateProblem(schedule(3, ['a']), 1, '2026-03-01')).toBeNull();
  });
});

describe('planAssignment', () => {
  const plan = (weeks: ScheduleWeek[], number: number, memberId: string, date: string, members = MEMBERS) =>
    planAssignment({ weeks, memberIds: members, number, memberId, date });

  it('sets host and date of the current meeting and shifts the later estimates to Tuesdays 7 days apart', () => {
    expect(plan(schedule(4), 1, 'a', '2026-01-13')).toEqual([
      { number: 1, hostMemberId: 'a', date: '2026-01-13' },
      { number: 2, hostMemberId: null, date: '2026-01-20' },
      { number: 3, hostMemberId: null, date: '2026-01-27' },
      { number: 4, hostMemberId: null, date: '2026-02-03' },
    ]);
  });

  it('keeps unchanged estimates out of the result', () => {
    expect(plan(schedule(4), 1, 'a', '2026-01-06')).toEqual([
      { number: 1, hostMemberId: 'a', date: '2026-01-06' },
    ]);
  });

  it('shifts from the LAST chosen date when the next meeting is chosen too', () => {
    const weeks = schedule(4, ['a']);
    expect(plan(weeks, 2, 'b', '2026-02-03')).toEqual([
      { number: 2, hostMemberId: 'b', date: '2026-02-03' },
      { number: 3, hostMemberId: null, date: '2026-02-10' },
      { number: 4, hostMemberId: null, date: '2026-02-17' },
    ]);
  });

  it('returns nothing to do when host and date are unchanged', () => {
    expect(plan(schedule(4, ['a']), 1, 'a', '2026-01-06')).toEqual([]);
  });

  it('only allows the current and the next meeting', () => {
    expect(() => plan(schedule(4), 3, 'a', '2026-01-20')).toThrow(/outside the selectable window/);
    expect(() => plan(schedule(4, ['a'], 1), 4, 'b', '2026-01-27')).toThrow(/outside the selectable window/);
    expect(() => plan(schedule(4, ['a'], 1), 1, 'b', '2026-01-06')).toThrow(/closed/);
    expect(() => plan(schedule(4), 9, 'a', '2026-01-06')).toThrow(/not found/);
  });

  it('rejects members who hosted a closed meeting, and unknown members', () => {
    const weeks = schedule(4, ['a', 'b'], 1);
    expect(() => plan(weeks, 2, 'a', '2026-01-13')).toThrow(/already hosted a closed week/);
    expect(() => plan(weeks, 2, 'zzz', '2026-01-13')).toThrow(/not found/);
  });

  it('checks the date: real, later than the previous meeting, before a fixed next meeting', () => {
    expect(() => plan(schedule(4), 2, 'a', '2026-02-31')).toThrow(/not a real calendar date/);
    expect(() => plan(schedule(4), 2, 'a', '2026-01-06')).toThrow(/later than the previous/);
    expect(() => plan(schedule(4, ['a', 'b']), 1, 'c', '2026-01-13')).toThrow(/earlier than the next/);
  });

  it('exchanges hosts with the open meeting the member already holds', () => {
    // fully scheduled (old) period: a b c d
    expect(plan(schedule(4, ['a', 'b', 'c', 'd']), 1, 'd', '2026-01-06')).toEqual([
      { number: 1, hostMemberId: 'd', date: '2026-01-06' },
      { number: 4, hostMemberId: 'a', date: '2026-01-27' },
    ]);
  });

  it('moves the member and leaves the other meeting undecided when the target had no host', () => {
    const weeks = schedule(4, [null, 'b']); // meeting 2 chosen first, meeting 1 still undecided
    expect(plan(weeks, 1, 'b', '2026-01-06')).toEqual([
      { number: 1, hostMemberId: 'b', date: '2026-01-06' },
      { number: 2, hostMemberId: null, date: '2026-01-13' },
    ]);
    // and the other way round: re-picking a host for a meeting that already has one exchanges with the holder
    expect(plan(schedule(4, ['a', 'b']), 1, 'b', '2026-01-06').find((c) => c.number === 2)?.hostMemberId).toBe('a');
  });

  it('assigns the last meeting automatically when one meeting and one member are left', () => {
    const changes = plan(schedule(3, ['a']), 2, 'b', '2026-01-13', ['a', 'b', 'c']);
    expect(changes).toEqual([
      { number: 2, hostMemberId: 'b', date: '2026-01-13' },
      { number: 3, hostMemberId: 'c', date: '2026-01-20' },
    ]);
  });

  it('does not assign automatically while two members are still free', () => {
    // only meeting 1 changes; meetings 2 and 3 stay undecided
    expect(plan(schedule(3), 1, 'a', '2026-01-06', ['a', 'b', 'c']).map((c) => c.number)).toEqual([1]);
  });

  it('never touches a closed meeting', () => {
    const weeks = schedule(4, ['a', 'b'], 1);
    const changes = plan(weeks, 2, 'b', '2026-03-01');
    expect(changes.map((c) => c.number)).toEqual([2, 3, 4]);
    expect(changes.find((c) => c.number === 1)).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const weeks = schedule(4);
    const copy = JSON.parse(JSON.stringify(weeks));
    plan(weeks, 1, 'a', '2026-01-09');
    expect(weeks).toEqual(copy);
  });
});

describe('standing host payout locks the host (owner decision 2026-11-10)', () => {
  const withPayout = (weeks: ScheduleWeek[], ...numbers: number[]) =>
    weeks.map((w) => ({ ...w, payoutStands: numbers.includes(w.number) }));
  const pick = (weeks: ScheduleWeek[], number: number, memberId: string) =>
    planAssignment({ weeks, memberIds: MEMBERS, number, memberId, date: addDays('2026-01-06', 7 * (number - 1)) });

  it('rejects a new host for a meeting whose payout stands', () => {
    const weeks = withPayout(schedule(4, ['a', 'b']), 1);
    expect(() => pick(weeks, 1, 'c')).toThrow(HostPayoutStandsError);
    expect(() => pick(weeks, 1, 'c')).toThrow(DomainError);
  });

  it('allows the host again once the payout is reversed (flag false)', () => {
    const weeks = withPayout(schedule(4, ['a', 'b']));
    expect(pick(weeks, 1, 'c').find((c) => c.number === 1)?.hostMemberId).toBe('c');
  });

  it('rejects an exchange when the OTHER meeting has a standing payout', () => {
    const weeks = withPayout(schedule(4, ['a', 'b']), 1);
    const error = (() => {
      try {
        pick(weeks, 2, 'a'); // a holds meeting 1 (paid): meeting 2 would take a, meeting 1 would get b
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(HostPayoutStandsError);
    expect((error as HostPayoutStandsError).weekNumber).toBe(1);
  });

  it('does not block an unpaid meeting or re-picking the same host (date only)', () => {
    const weeks = withPayout(schedule(4, ['a', 'b']), 1);
    expect(pick(weeks, 2, 'c').find((c) => c.number === 2)?.hostMemberId).toBe('c');
    expect(() => planAssignment({ weeks, memberIds: MEMBERS, number: 1, memberId: 'a', date: '2026-01-06' })).not.toThrow();
  });

  it('assertNoStandingPayout checks only the given meetings', () => {
    const weeks = withPayout(schedule(3, ['a', 'b', 'c']), 2);
    expect(() => assertNoStandingPayout(weeks, [1, 3])).not.toThrow();
    expect(() => assertNoStandingPayout(weeks, [1, 2])).toThrow(HostPayoutStandsError);
  });
});

describe('planAutoAssignment', () => {
  it('assigns the single meeting of a one-member period', () => {
    expect(planAutoAssignment(schedule(1), ['a'])).toEqual([{ number: 1, hostMemberId: 'a', date: '2026-01-06' }]);
  });

  it('does nothing when more than one meeting is undecided', () => {
    expect(planAutoAssignment(schedule(2), ['a', 'b'])).toEqual([]);
  });
});

describe('daysBetween', () => {
  it('counts calendar days, across month and year ends and leap days', () => {
    expect(daysBetween('2026-01-04', '2026-01-04')).toBe(0);
    expect(daysBetween('2026-01-04', '2026-01-16')).toBe(12);
    expect(daysBetween('2025-12-30', '2026-01-02')).toBe(3);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-01-16', '2026-01-04')).toBe(-12);
  });

  it('rejects text that is not an ISO date', () => {
    expect(() => daysBetween('4 Jan', '2026-01-04')).toThrow(DomainError);
  });
});
