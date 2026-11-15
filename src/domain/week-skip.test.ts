import { availableCredit, creditBalance, previewPeriodClose } from './close';
import { allocatePayments } from './allocation';
import { previewPayment, weekState } from './payment-preview';
import { buildMemberHistory, summarizeMeeting, summarizePeriod } from './report';
import { eligibleHostIds, planAssignment, selectableWeekNumbers } from './schedule';
import type { WeekStatus } from './types';
import {
  assertSkipUndoable,
  assertWeekSkippable,
  previewWeekSkip,
  skippedTurnMember,
  weekSkipBlocker,
  WeekSkipError,
  type SkipWeekInfo,
  type WeekSkipContext,
  type WeekSkipErrorCode,
} from './week-skip';

/** A period of n members where meetings 1..closedCount are closed and paid, the rest open. */
function ctx(n: number, closedCount: number, patch: Partial<WeekSkipContext> = {}, weekPatch: Record<number, Partial<SkipWeekInfo>> = {}): WeekSkipContext {
  const weeks: SkipWeekInfo[] = [];
  for (let i = 1; i <= n; i += 1) {
    const closed = i <= closedCount;
    weeks.push({ number: i, status: closed ? 'closed' : 'open', skipped: false, hasActivePayout: closed, ...(weekPatch[i] ?? {}) });
  }
  return { periodId: 'p1', periodStatus: 'active', memberCount: n, weeks, ...patch };
}

const codeOf = (fn: () => void): WeekSkipErrorCode | 'no error' => {
  try {
    fn();
    return 'no error';
  } catch (e) {
    if (e instanceof WeekSkipError) return e.code;
    throw e;
  }
};

describe('assertWeekSkippable', () => {
  it('accepts the last meeting when every earlier one is closed and paid', () => {
    expect(() => assertWeekSkippable(ctx(4, 3), 'host cannot receive guests')).not.toThrow();
    expect(weekSkipBlocker(ctx(4, 3))).toBeNull();
  });

  it('rejects an empty or blank reason', () => {
    expect(codeOf(() => assertWeekSkippable(ctx(4, 3), ''))).toBe('reason_required');
    expect(codeOf(() => assertWeekSkippable(ctx(4, 3), '   '))).toBe('reason_required');
  });

  it('rejects a period that has ended', () => {
    expect(codeOf(() => assertWeekSkippable(ctx(4, 3, { periodStatus: 'closed' }), 'x'))).toBe('period_ended');
  });

  it('rejects fewer than two members (provisional rule)', () => {
    expect(codeOf(() => assertWeekSkippable(ctx(1, 0), 'x'))).toBe('too_few_members');
    expect(codeOf(() => assertWeekSkippable(ctx(2, 1), 'x'))).toBe('no error');
  });

  it('rejects a meeting that is not the last one', () => {
    expect(weekSkipBlocker(ctx(4, 2), 3)?.code).toBe('not_last');
    expect(weekSkipBlocker(ctx(4, 0), 1)?.code).toBe('not_last');
  });

  it('rejects when an earlier meeting is still open', () => {
    expect(codeOf(() => assertWeekSkippable(ctx(4, 2), 'x'))).toBe('earlier_open');
    expect(codeOf(() => assertWeekSkippable(ctx(4, 0), 'x'))).toBe('earlier_open');
  });

  it('rejects when the host of an earlier meeting is not paid (a corrected payout counts as unpaid)', () => {
    const c = ctx(5, 4, {}, { 2: { hasActivePayout: false }, 4: { hasActivePayout: false } });
    const b = weekSkipBlocker(c);
    expect(b?.code).toBe('host_unpaid');
    expect(b?.weeks).toEqual([2, 4]);
    expect(codeOf(() => assertWeekSkippable(c, 'x'))).toBe('host_unpaid');
  });

  it('rejects when the host payout of the last meeting stands', () => {
    const c = ctx(4, 3, {}, { 4: { hasActivePayout: true } });
    expect(codeOf(() => assertWeekSkippable(c, 'x'))).toBe('payout_stands');
  });

  it('rejects a meeting that is already skipped', () => {
    expect(codeOf(() => assertWeekSkippable(ctx(4, 3, {}, { 4: { skipped: true } }), 'x'))).toBe('already_skipped');
  });

  it('rejects a closed last meeting', () => {
    expect(codeOf(() => assertWeekSkippable(ctx(4, 4), 'x'))).toBe('week_closed');
  });

  it('carries a code on the error and is a DomainError', () => {
    try {
      assertWeekSkippable(ctx(4, 2), 'x');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(WeekSkipError);
      expect((e as Error).name).toBe('WeekSkipError');
      expect((e as WeekSkipError).message).toMatch(/oldest open meeting/);
    }
  });
});

describe('assertSkipUndoable', () => {
  const skippedCtx = (patch: Partial<WeekSkipContext> = {}) => ctx(4, 3, patch, { 4: { skipped: true } });

  it('accepts an undo with a reason while the period is active', () => {
    expect(() => assertSkipUndoable(skippedCtx(), 4, 'host can host after all')).not.toThrow();
  });

  it('rejects a blank reason, an ended period and a meeting that is not skipped', () => {
    expect(codeOf(() => assertSkipUndoable(skippedCtx(), 4, ' '))).toBe('reason_required');
    expect(codeOf(() => assertSkipUndoable(skippedCtx({ periodStatus: 'closed' }), 4, 'x'))).toBe('period_ended');
    expect(codeOf(() => assertSkipUndoable(ctx(4, 3), 4, 'x'))).toBe('not_skipped');
    expect(codeOf(() => assertSkipUndoable(skippedCtx(), 3, 'x'))).toBe('not_skipped');
  });

  it('rejects an undo once the meeting is closed', () => {
    const closed = ctx(4, 3, {}, { 4: { skipped: true, status: 'closed' } });
    expect(codeOf(() => assertSkipUndoable(closed, 4, 'x'))).toBe('week_closed');
  });
});

describe('previewWeekSkip', () => {
  it('sums what is already settled for the meeting and counts the members', () => {
    const p = previewWeekSkip(ctx(4, 3), [
      { memberId: 'a', amount: 15_000 },
      { memberId: 'b', amount: 0 },
      { memberId: 'c', amount: 30_000 },
    ]);
    expect(p).toMatchObject({ number: 4, eligible: true, blocker: null, prepaidTotal: 45_000, prepaidMembers: 2 });
  });

  it('reports the blocker and keeps the numbers when not eligible', () => {
    const p = previewWeekSkip(ctx(4, 2), [{ memberId: 'a', amount: 15_000 }]);
    expect(p.eligible).toBe(false);
    expect(p.blocker?.code).toBe('earlier_open');
    expect(p.prepaidTotal).toBe(15_000);
  });
});

describe('allocatePayments with a skipped week', () => {
  it('flows past the skipped week into credit and reports it as nothing due', () => {
    const r = allocatePayments([{ id: 'a', memberId: 'm', date: '2026-01-01', amount: 75_000 }], 4, [], [], [4]);
    expect(r.allocations.map((a) => a.week)).toEqual([1, 2, 3]);
    expect(r.credit).toBe(30_000);
    expect(r.weeks[3]).toEqual({ week: 4, due: 0, paid: 0, offset: 0, credited: 0, outstanding: 0, skipped: true });
  });

  it('rejects an offset or credited amount on a skipped week', () => {
    expect(() => allocatePayments([], 4, [{ week: 4, amount: 5_000 }], [], [4])).toThrow(/skipped/);
    expect(() => allocatePayments([], 4, [], [{ week: 4, amount: 5_000 }], [4])).toThrow(/skipped/);
  });

  it('rejects a skipped week beyond the period', () => {
    expect(() => allocatePayments([], 4, [], [], [5])).toThrow(/beyond/);
  });
});

describe('payment preview and week state with a skipped week', () => {
  const statuses: WeekStatus[] = [
    { week: 1, due: 15_000, paid: 0, offset: 0, credited: 0, outstanding: 15_000 },
    { week: 2, due: 0, paid: 0, offset: 0, credited: 0, outstanding: 0, skipped: true },
  ];

  it('a payment above the remaining dues becomes credit, the skipped week takes nothing', () => {
    const p = previewPayment({ id: 'a', memberId: 'm', date: '2026-01-01', amount: 45_000 }, statuses);
    expect(p.allocations.map((a) => [a.week, a.amount])).toEqual([[1, 15_000]]);
    expect(p.creditAmount).toBe(30_000);
    expect(p.weekCount).toBe(1);
  });

  it('weekState says skipped', () => {
    expect(weekState(statuses[1] as WeekStatus)).toBe('skipped');
  });
});

describe('schedule rules with a skipped week', () => {
  it('planAssignment rejects a skipped meeting', () => {
    const weeks = [
      { number: 1, date: '2026-01-06', hostMemberId: 'a', status: 'closed' as const },
      { number: 2, date: '2026-01-13', hostMemberId: null, status: 'skipped' as const },
    ];
    expect(() => planAssignment({ weeks, memberIds: ['a', 'b'], number: 2, memberId: 'b', date: '2026-01-13' })).toThrow(/skipped/);
  });
});

describe('schedule helpers with a skipped meeting', () => {
  const weeks = [
    { number: 1, date: '2026-01-06', hostMemberId: 'a', status: 'closed' as const },
    { number: 2, date: '2026-01-13', hostMemberId: 'b', status: 'skipped' as const },
  ];

  it('a skipped meeting is not selectable and its stored host still counts as not hosted', () => {
    expect(selectableWeekNumbers(weeks)).toEqual([]);
    expect(eligibleHostIds(weeks, ['a', 'b'])).toEqual(['b']);
  });
});

describe('credit with a released offset', () => {
  it('adds the released offset to the credit', () => {
    expect(availableCredit({ received: 30_000, allocated: 30_000, applied: 0, refunded: 0, releasedOffset: 5_000 })).toBe(5_000);
    expect(creditBalance({ received: 0, allocated: 0, applied: 10_000, refunded: 0 })).toBe(-10_000);
  });

  it('still refuses a negative credit', () => {
    expect(() => availableCredit({ received: 0, allocated: 0, applied: 10_000, refunded: 0, releasedOffset: 5_000 })).toThrow(/negative/);
  });
});

describe('previewPeriodClose with a skipped week', () => {
  const st = (week: number, outstanding: number): WeekStatus => ({ week, due: 15_000, paid: 15_000 - outstanding, offset: 0, credited: 0, outstanding });
  const skippedStatus: WeekStatus = { week: 3, due: 0, paid: 0, offset: 0, credited: 0, outstanding: 0, skipped: true };

  it('a skipped open meeting neither blocks closing nor needs a payout and is never written off', () => {
    const p = previewPeriodClose({
      weeks: [
        { number: 1, status: 'closed', hasActivePayout: true },
        { number: 2, status: 'closed', hasActivePayout: true },
        { number: 3, status: 'open', skipped: true, hasActivePayout: false },
      ],
      members: [{ memberId: 'a', statuses: [st(1, 0), st(2, 15_000), skippedStatus], credit: 0 }],
    });
    expect(p.canClose).toBe(true);
    expect(p.openWeeks).toEqual([]);
    expect(p.unpaidHostWeeks).toEqual([]);
    expect(p.skippedWeeks).toEqual([3]);
    expect(p.writeoffs).toEqual([{ memberId: 'a', amount: 15_000 }]);
  });

  it('a normal open meeting still blocks', () => {
    const p = previewPeriodClose({
      weeks: [
        { number: 1, status: 'closed', hasActivePayout: true },
        { number: 2, status: 'open', hasActivePayout: false },
      ],
      members: [],
    });
    expect(p.canClose).toBe(false);
    expect(p.openWeeks).toEqual([2]);
    expect(p.skippedWeeks).toEqual([]);
  });
});

describe('reports with a skipped meeting', () => {
  const zero = (week: number): WeekStatus => ({ week, due: 0, paid: 0, offset: 0, credited: 0, outstanding: 0, skipped: true });

  it('summarizeMeeting does not throw and reports no dues, payout or kas contribution', () => {
    const s = summarizeMeeting({
      memberCount: 2,
      week: 2,
      date: '2026-01-13',
      hostMemberId: null,
      status: 'open',
      skipped: true,
      members: [
        { memberId: 'a', status: zero(2) },
        { memberId: 'b', status: zero(2) },
      ],
      payout: null,
      offset: 0,
    });
    expect(s).toMatchObject({ skipped: true, totalDues: 0, hostPayoutDue: 0, kasContribution: 0, unpaid: 0, hostPayout: null, fullyCovered: false });
    expect(s.members.map((m) => m.state)).toEqual(['skipped', 'skipped']);
  });

  it('summarizeMeeting refuses a skipped meeting that carries amounts', () => {
    expect(() =>
      summarizeMeeting({
        memberCount: 1,
        week: 1,
        date: '2026-01-06',
        hostMemberId: null,
        status: 'open',
        skipped: true,
        members: [{ memberId: 'a', status: { ...zero(1), paid: 15_000 } }],
        payout: null,
        offset: 0,
      }),
    ).toThrow(/inconsistent/);
  });

  it('summarizePeriod counts dues for the meetings that were held only', () => {
    expect(summarizePeriod({ memberCount: 4, entries: [] }).totalDues).toBe(15_000 * 4 * 4);
    expect(summarizePeriod({ memberCount: 4, entries: [], skippedCount: 1 }).totalDues).toBe(15_000 * 4 * 3);
  });

  it('buildMemberHistory leaves released amounts out of "settled" and flags them', () => {
    const h = buildMemberHistory({
      periodId: 'p',
      statuses: [{ week: 1, due: 15_000, paid: 15_000, offset: 0, credited: 0, outstanding: 0 }, zero(2)],
      weeks: [
        { number: 1, date: '2026-01-06', hostMemberId: 'a', status: 'closed' },
        { number: 2, date: '2026-01-13', hostMemberId: null, status: 'open', skipped: true },
      ],
      payments: [
        {
          id: 'pay1',
          date: '2026-01-02',
          amount: 30_000,
          credit: 15_000,
          reversed: false,
          reversalReason: null,
          settled: [
            { week: 1, amount: 15_000 },
            { week: 2, amount: 15_000, skipped: true },
          ],
        },
      ],
      entries: [],
      applications: [],
      offsetCredits: [],
    });
    const pay = h.events.find((e) => e.kind === 'payment');
    expect(pay?.settled).toEqual([{ week: 1, amount: 15_000 }]);
    expect(pay?.credit).toBe(15_000);
    expect(pay?.releasedBySkip).toBe(15_000);
    expect(h.weeks.map((w) => [w.skipped, w.state])).toEqual([
      [false, 'paid'],
      [true, 'skipped'],
    ]);
  });

  it('buildMemberHistory drops a carry-over group released entirely by a skip', () => {
    const h = buildMemberHistory({
      periodId: 'p2',
      statuses: [zero(1)],
      weeks: [{ number: 1, date: '2026-02-03', hostMemberId: null, status: 'open', skipped: true }],
      payments: [],
      entries: [],
      applications: [
        { kind: 'carry_over', fromPeriodId: 'p1', toPeriodId: 'p2', fromPeriodName: 'P1', toPeriodName: 'P2', week: 1, amount: 15_000, date: '2026-02-01', skipped: true },
      ],
      offsetCredits: [],
    });
    expect(h.events).toEqual([]);
  });
});

describe('skippedTurnMember', () => {
  const members = ['a', 'b', 'c'];
  it('names the only member who hosts no meeting that took place', () => {
    const weeks = [
      { hostMemberId: 'a', skipped: false },
      { hostMemberId: 'b', skipped: false },
      { hostMemberId: 'c', skipped: true }, // the host kept on the skipped meeting does not count
    ];
    expect(skippedTurnMember(members, weeks)).toBe('c');
  });

  it('works when the skipped meeting never got a host', () => {
    const weeks = [
      { hostMemberId: 'b', skipped: false },
      { hostMemberId: 'c', skipped: false },
      { hostMemberId: null, skipped: true },
    ];
    expect(skippedTurnMember(members, weeks)).toBe('a');
  });

  it('is null without a skipped meeting, and when it is not exactly one member', () => {
    expect(skippedTurnMember(members, [{ hostMemberId: 'a', skipped: false }])).toBeNull();
    expect(skippedTurnMember(members, [{ hostMemberId: 'a', skipped: false }, { hostMemberId: null, skipped: true }])).toBeNull();
  });
});
