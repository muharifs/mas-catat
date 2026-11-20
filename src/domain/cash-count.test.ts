import {
  assertWeekCountable,
  buildCountHistory,
  buildCountLines,
  CashCountError,
  countableWeekNumbers,
  countHints,
  defaultCountWeek,
  effectiveLines,
  expectedBalances,
  hasCountForWeek,
  timesCounted,
  latestCountStatus,
  type CountableWeek,
  type StoredCountLine,
} from './cash-count';
import { DomainError } from './money';

const line = (seq: number, week: number, account: 'tunai' | 'debit', expected: number, counted: number): StoredCountLine => ({
  seq,
  batchId: `b${seq}`,
  periodId: 'p1',
  week,
  account,
  date: '2026-01-06',
  expected,
  counted,
  difference: counted - expected,
  note: '',
});

describe('buildCountLines', () => {
  const expected = { tunai: 100_000, debit: 50_000 };
  it('difference = counted - expected, per pos', () => {
    expect(buildCountLines({ tunai: 95_000, debit: 50_000 }, expected)).toEqual([
      { account: 'tunai', expected: 100_000, counted: 95_000, difference: -5_000 },
      { account: 'debit', expected: 50_000, counted: 50_000, difference: 0 },
    ]);
  });
  it('Debit may be skipped: only the Tunai line', () => {
    expect(buildCountLines({ tunai: 100_000, debit: null }, expected)).toHaveLength(1);
  });
  it('counted is plain rupiah: a non-multiple of 15.000 and zero are fine', () => {
    expect(buildCountLines({ tunai: 12_345, debit: 0 }, expected).map((l) => l.counted)).toEqual([12_345, 0]);
  });
  it.each([-1, 1.5, Number.NaN, 1e20])('rejects counted %p', (bad) => {
    expect(() => buildCountLines({ tunai: bad, debit: null }, expected)).toThrow(DomainError);
    expect(() => buildCountLines({ tunai: 0, debit: bad }, expected)).toThrow(DomainError);
  });
  it('a negative expected balance is allowed', () => {
    expect(buildCountLines({ tunai: 0, debit: null }, { tunai: -5_000, debit: 0 })[0]?.difference).toBe(5_000);
  });
});

describe('expectedBalances', () => {
  it('takes Tunai and Debit from kas, never Piutang', () => {
    expect(expectedBalances({ tunai: 1, debit: 2, piutang: 3, actual: 3 })).toEqual({ tunai: 1, debit: 2 });
  });
});

describe('countable meetings', () => {
  const weeks: CountableWeek[] = [
    { number: 1, status: 'closed' },
    { number: 2, status: 'closed' },
    { number: 3, status: 'open' },
    { number: 4, status: 'open' },
  ];
  it('oldest open first, then latest closed', () => {
    expect(countableWeekNumbers(weeks)).toEqual([3, 2]);
    expect(defaultCountWeek(weeks)).toBe(3);
  });
  it('all closed: the latest closed one', () => {
    expect(countableWeekNumbers(weeks.map((w) => ({ ...w, status: 'closed' as const })))).toEqual([4]);
  });
  it('a skipped last meeting is not counted; the latest closed one is the default', () => {
    const skipped: CountableWeek[] = [
      { number: 1, status: 'closed' },
      { number: 2, status: 'skipped' },
    ];
    expect(countableWeekNumbers(skipped)).toEqual([1]);
    expect(() => assertWeekCountable(skipped, 2, true)).toThrow(expect.objectContaining({ code: 'week_skipped' }));
  });
  it('assertWeekCountable: ok, wrong meeting, ended period', () => {
    expect(() => assertWeekCountable(weeks, 3, true)).not.toThrow();
    expect(() => assertWeekCountable(weeks, 2, true)).not.toThrow();
    expect(() => assertWeekCountable(weeks, 4, true)).toThrow(expect.objectContaining({ code: 'week_not_countable' }));
    expect(() => assertWeekCountable(weeks, 1, true)).toThrow(CashCountError);
    expect(() => assertWeekCountable(weeks, 3, false)).toThrow(expect.objectContaining({ code: 'no_active_period' }));
  });
  it('no meetings: no default', () => {
    expect(defaultCountWeek([])).toBeNull();
  });
});

describe('countHints', () => {
  it('no hints for a zero difference', () => {
    expect(countHints({ difference: 0, memberCount: 10 })).toEqual([]);
  });
  it('more money than the ledger, multiple of 15.000: a member payment may be unrecorded', () => {
    expect(countHints({ difference: 30_000, memberCount: 10 })).toEqual(['member_payment', 'transfer']);
  });
  it('less money, exactly 10.000 x N: a host payout may be unrecorded', () => {
    expect(countHints({ difference: -100_000, memberCount: 10 })).toEqual(['host_payout', 'transfer', 'goal_spending']);
  });
  it('less money, not a payout amount: transfer or shared-goal spending', () => {
    expect(countHints({ difference: -7_000, memberCount: 10 })).toEqual(['transfer', 'goal_spending']);
  });
  it('more money, not a multiple of 15.000: only a transfer', () => {
    expect(countHints({ difference: 7_000, memberCount: 10 })).toEqual(['transfer']);
  });
  it('opposite differences in Tunai and Debit: the transfer hint comes first and appears once', () => {
    expect(countHints({ difference: -30_000, memberCount: 10, otherDifference: 30_000 })).toEqual(['transfer', 'goal_spending']);
    expect(countHints({ difference: 30_000, memberCount: 10, otherDifference: -30_000 })).toEqual(['transfer', 'member_payment']);
  });
  it('a negative multiple of 15.000 is not a payment hint; a positive 10.000 x N is not a payout hint', () => {
    expect(countHints({ difference: -30_000, memberCount: 10 })).not.toContain('member_payment');
    expect(countHints({ difference: 100_000, memberCount: 10 })).not.toContain('host_payout');
  });
});

describe('history', () => {
  it('the latest count per meeting and pos is effective', () => {
    const lines = [line(1, 1, 'tunai', 100, 90), line(2, 1, 'debit', 50, 50), line(3, 1, 'tunai', 100, 100)];
    expect(effectiveLines(lines).map((l) => [l.account, l.seq, l.difference])).toEqual([
      ['tunai', 3, 0],
      ['debit', 2, 0],
    ]);
  });

  it('flags the first difference and the consecutive ones; a clean count ends the run', () => {
    const lines = [
      line(1, 1, 'tunai', 100, 100),
      line(2, 2, 'tunai', 100, 90), // first
      line(3, 3, 'tunai', 100, 80), // continued
      line(4, 4, 'tunai', 100, 100), // clean: ends the run
      line(5, 5, 'tunai', 100, 95), // first of a new run
    ];
    const rows = buildCountHistory(lines, [1, 2, 3, 4, 5, 6]);
    expect(rows.map((r) => r.flag)).toEqual([null, 'first', 'continued', null, 'first', null]);
    expect(rows.map((r) => r.counted)).toEqual([true, true, true, true, true, false]);
  });

  it('a meeting without a count does not break a run and carries no flag', () => {
    const rows = buildCountHistory([line(1, 1, 'tunai', 100, 90), line(2, 3, 'tunai', 100, 90)], [1, 2, 3]);
    expect(rows.map((r) => r.flag)).toEqual(['first', null, 'continued']);
  });

  it('a difference in Debit alone counts as a difference of the meeting', () => {
    const rows = buildCountHistory([line(1, 1, 'tunai', 100, 100), line(2, 1, 'debit', 50, 40)], [1]);
    expect(rows[0]).toMatchObject({ hasDifference: true, flag: 'first' });
  });

  it('a corrected count replaces the earlier one in the flags', () => {
    const rows = buildCountHistory([line(1, 1, 'tunai', 100, 90), line(2, 1, 'tunai', 100, 100)], [1]);
    expect(rows[0]).toMatchObject({ hasDifference: false, flag: null });
  });

  it('latestCountStatus: none, clean, difference (of the highest counted meeting)', () => {
    expect(latestCountStatus([])).toEqual({ state: 'none', week: null, differing: [] });
    expect(latestCountStatus([line(1, 1, 'tunai', 100, 90), line(2, 2, 'tunai', 100, 100)])).toMatchObject({ state: 'clean', week: 2 });
    const s = latestCountStatus([line(1, 1, 'tunai', 100, 100), line(2, 2, 'tunai', 100, 90), line(3, 2, 'debit', 5, 5)]);
    expect(s.state).toBe('difference');
    expect(s.differing.map((l) => l.account)).toEqual(['tunai']);
  });

  it('latestCountStatus ignores counts of skipped meetings', () => {
    const lines = [line(1, 1, 'tunai', 100, 100), line(2, 2, 'tunai', 100, 100), line(3, 3, 'tunai', 100, 90)];
    expect(latestCountStatus(lines)).toMatchObject({ state: 'difference', week: 3 });
    expect(latestCountStatus(lines, [3])).toMatchObject({ state: 'clean', week: 2, differing: [] });
    expect(latestCountStatus([line(1, 3, 'tunai', 100, 90)], [3])).toEqual({ state: 'none', week: null, differing: [] });
    // a skipped week only hides its own lines; its older counts do not resurface
    expect(latestCountStatus([line(1, 2, 'tunai', 100, 90), line(2, 2, 'tunai', 100, 100)], [1])).toMatchObject({ state: 'clean', week: 2 });
  });

  it('hasCountForWeek', () => {
    const lines = [line(1, 2, 'tunai', 1, 1)];
    expect(hasCountForWeek(lines, 'p1', 2)).toBe(true);
    expect(hasCountForWeek(lines, 'p1', 3)).toBe(false);
    expect(hasCountForWeek(lines, 'p2', 2)).toBe(false);
  });
});

describe('timesCounted', () => {
  it('counts saves, not lines: Tunai and Debit of one save are one count', () => {
    const a = { ...line(1, 2, 'tunai', 1, 1), batchId: 'x' };
    const b = { ...line(2, 2, 'debit', 1, 1), batchId: 'x' };
    const c = { ...line(3, 2, 'tunai', 1, 2), batchId: 'y' };
    expect(timesCounted([a, b, c], 'p1', 2)).toBe(2);
    expect(timesCounted([a, b, c], 'p1', 3)).toBe(0);
  });
});
