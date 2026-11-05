import { DomainError } from './money';
import {
  addDays,
  defaultMeetingDate,
  eligibleHostIds,
  isRealDate,
  meetingDateProblem,
  planAssignment,
  planAutoAssignment,
  previewMeetingDates,
  selectableWeekNumbers,
  type ScheduleWeek,
} from './schedule';

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-25', 7)).toBe('2026-02-01');
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

describe('previewMeetingDates', () => {
  it('lists the estimated date of every meeting, 7 days apart', () => {
    expect(previewMeetingDates('2026-01-04', 3)).toEqual([
      { week: 1, date: '2026-01-04' },
      { week: 2, date: '2026-01-11' },
      { week: 3, date: '2026-01-18' },
    ]);
  });

  it('is empty without members and rejects an impossible date', () => {
    expect(previewMeetingDates('2026-01-04', 0)).toEqual([]);
    expect(() => previewMeetingDates('2026-02-31', 1)).toThrow(DomainError);
  });
});

/** A fresh schedule of `n` meetings from 2026-01-04, weekly, no hosts. `hosts` fills hosts from meeting 1. */
function schedule(n: number, hosts: (string | null)[] = [], closed = 0): ScheduleWeek[] {
  return Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    date: addDays('2026-01-04', 7 * i),
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
  it('defaults to 7 days after the previous meeting, and to its own date for meeting 1', () => {
    const weeks = schedule(3, ['a']);
    expect(defaultMeetingDate(weeks, 1)).toBe('2026-01-04');
    expect(defaultMeetingDate([{ ...weeks[0], date: '2026-01-09' } as ScheduleWeek, ...weeks.slice(1)], 2)).toBe('2026-01-16');
    expect(() => defaultMeetingDate(weeks, 9)).toThrow(DomainError);
  });

  it('rejects non-dates and dates not later than the previous meeting', () => {
    const weeks = schedule(3);
    expect(meetingDateProblem(weeks, 2, '2026-02-31')).toEqual({ kind: 'not_real' });
    expect(meetingDateProblem(weeks, 2, 'besok')).toEqual({ kind: 'not_real' });
    expect(meetingDateProblem(weeks, 2, '2026-01-04')).toEqual({ kind: 'not_after_previous', limit: '2026-01-04' });
    expect(meetingDateProblem(weeks, 2, '2026-01-05')).toBeNull();
    expect(meetingDateProblem(weeks, 1, '2020-01-01')).toBeNull(); // meeting 1 has no previous meeting
  });

  it('rejects a date on or after a next meeting whose date is fixed (has a host)', () => {
    const weeks = schedule(3, ['a', 'b']);
    expect(meetingDateProblem(weeks, 1, '2026-01-11')).toEqual({ kind: 'not_before_next', limit: '2026-01-11' });
    expect(meetingDateProblem(weeks, 1, '2026-01-10')).toBeNull();
    // the next meeting is only an estimate: no upper limit (its estimate shifts instead)
    expect(meetingDateProblem(schedule(3, ['a']), 1, '2026-03-01')).toBeNull();
  });
});

describe('planAssignment', () => {
  const plan = (weeks: ScheduleWeek[], number: number, memberId: string, date: string, members = MEMBERS) =>
    planAssignment({ weeks, memberIds: members, number, memberId, date });

  it('sets host and date of the current meeting and shifts the later estimates 7 days apart', () => {
    expect(plan(schedule(4), 1, 'a', '2026-01-06')).toEqual([
      { number: 1, hostMemberId: 'a', date: '2026-01-06' },
      { number: 2, hostMemberId: null, date: '2026-01-13' },
      { number: 3, hostMemberId: null, date: '2026-01-20' },
      { number: 4, hostMemberId: null, date: '2026-01-27' },
    ]);
  });

  it('shifts from the LAST chosen date when the next meeting is chosen too', () => {
    const weeks = schedule(4, ['a']);
    expect(plan(weeks, 2, 'b', '2026-02-01')).toEqual([
      { number: 2, hostMemberId: 'b', date: '2026-02-01' },
      { number: 3, hostMemberId: null, date: '2026-02-08' },
      { number: 4, hostMemberId: null, date: '2026-02-15' },
    ]);
  });

  it('returns nothing to do when host and date are unchanged', () => {
    expect(plan(schedule(4, ['a']), 1, 'a', '2026-01-04')).toEqual([]);
  });

  it('only allows the current and the next meeting', () => {
    expect(() => plan(schedule(4), 3, 'a', '2026-01-18')).toThrow(/outside the selectable window/);
    expect(() => plan(schedule(4, ['a'], 1), 4, 'b', '2026-01-25')).toThrow(/outside the selectable window/);
    expect(() => plan(schedule(4, ['a'], 1), 1, 'b', '2026-01-04')).toThrow(/closed/);
    expect(() => plan(schedule(4), 9, 'a', '2026-01-04')).toThrow(/not found/);
  });

  it('rejects members who hosted a closed meeting, and unknown members', () => {
    const weeks = schedule(4, ['a', 'b'], 1);
    expect(() => plan(weeks, 2, 'a', '2026-01-11')).toThrow(/already hosted a closed week/);
    expect(() => plan(weeks, 2, 'zzz', '2026-01-11')).toThrow(/not found/);
  });

  it('checks the date: real, later than the previous meeting, before a fixed next meeting', () => {
    expect(() => plan(schedule(4), 2, 'a', '2026-02-31')).toThrow(/not a real calendar date/);
    expect(() => plan(schedule(4), 2, 'a', '2026-01-04')).toThrow(/later than the previous/);
    expect(() => plan(schedule(4, ['a', 'b']), 1, 'c', '2026-01-11')).toThrow(/earlier than the next/);
  });

  it('exchanges hosts with the open meeting the member already holds', () => {
    // fully scheduled (old) period: a b c d
    expect(plan(schedule(4, ['a', 'b', 'c', 'd']), 1, 'd', '2026-01-04')).toEqual([
      { number: 1, hostMemberId: 'd', date: '2026-01-04' },
      { number: 4, hostMemberId: 'a', date: '2026-01-25' },
    ]);
  });

  it('moves the member and leaves the other meeting undecided when the target had no host', () => {
    const weeks = schedule(4, [null, 'b']); // meeting 2 chosen first, meeting 1 still undecided
    expect(plan(weeks, 1, 'b', '2026-01-04')).toEqual([
      { number: 1, hostMemberId: 'b', date: '2026-01-04' },
      { number: 2, hostMemberId: null, date: '2026-01-11' },
    ]);
    // and the other way round: re-picking a host for a meeting that already has one exchanges with the holder
    expect(plan(schedule(4, ['a', 'b']), 1, 'b', '2026-01-04').find((c) => c.number === 2)?.hostMemberId).toBe('a');
  });

  it('assigns the last meeting automatically when one meeting and one member are left', () => {
    const changes = plan(schedule(3, ['a']), 2, 'b', '2026-01-11', ['a', 'b', 'c']);
    expect(changes).toEqual([
      { number: 2, hostMemberId: 'b', date: '2026-01-11' },
      { number: 3, hostMemberId: 'c', date: '2026-01-18' },
    ]);
  });

  it('does not assign automatically while two members are still free', () => {
    // only meeting 1 changes; meetings 2 and 3 stay undecided
    expect(plan(schedule(3), 1, 'a', '2026-01-04', ['a', 'b', 'c']).map((c) => c.number)).toEqual([1]);
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

describe('planAutoAssignment', () => {
  it('assigns the single meeting of a one-member period', () => {
    expect(planAutoAssignment(schedule(1), ['a'])).toEqual([{ number: 1, hostMemberId: 'a', date: '2026-01-04' }]);
  });

  it('does nothing when more than one meeting is undecided', () => {
    expect(planAutoAssignment(schedule(2), ['a', 'b'])).toEqual([]);
  });
});
