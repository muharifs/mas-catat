// Repository tests for "skip the last meeting" (decision 33): rules, credit release, close, undo and the readers.
// Run on sql.js: they prove the SQL logic, not the expo-sqlite adapter on the phone.
import { WeekSkipError, type WeekSkipErrorCode } from '@/domain/week-skip';
import type { Db } from './db';
import { SkipUndoBlockedError } from './errors';
import { createRepositories, type Repositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const NOW = '2026-12-31T12:00:00.000Z';

interface Fixture {
  db: Db;
  repos: Repositories;
  periodId: string;
  ids: string[];
}

/** N members, one period, meeting dates from 2026-01-06 (Tuesdays). Hosts are NOT set. */
async function setup(n = 3): Promise<Fixture> {
  const db = await createMigratedTestDb();
  let i = 0;
  const repos = createRepositories(db, { newId: () => `id${(i += 1)}`, now: () => NOW });
  const ids: string[] = [];
  for (let k = 0; k < n; k += 1) ids.push((await repos.members.create(`Member ${k + 1}`)).id);
  const period = await repos.periods.create({ name: 'Periode 1', startDate: '2026-01-06', memberIds: ids });
  return { db, repos, periodId: period.id, ids };
}

/** Closes meetings 1..(N-1) (host k = member k) and pays every host, leaving the last meeting open. */
async function reachLastMeeting(f: Fixture): Promise<void> {
  const n = f.ids.length;
  for (let k = 1; k < n; k += 1) {
    await f.repos.weeks.assignHost(f.periodId, k, f.ids[k - 1] as string, `2026-01-${String(6 + 7 * (k - 1)).padStart(2, '0')}`);
  }
  for (let k = 1; k < n; k += 1) {
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.ledger.settleHost(f.periodId, k, '2026-02-01', 'tunai');
  }
}

const pay = (f: Fixture, i: number, amount: number, date = '2026-01-06') =>
  f.repos.payments.record({ periodId: f.periodId, memberId: f.ids[i] as string, date, amount, account: 'tunai' });

const count = async (db: Db, table: string, where = '1 = 1'): Promise<number> =>
  (await db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`))?.n ?? -1;

async function codeOf(promise: Promise<unknown>): Promise<WeekSkipErrorCode | 'no error'> {
  try {
    await promise;
    return 'no error';
  } catch (e) {
    if (e instanceof WeekSkipError) return e.code;
    throw e;
  }
}

describe('skipLast: rules', () => {
  it('skips the last meeting: status skipped, no ledger entry, no allocation change, kas unchanged', async () => {
    const f = await setup(3);
    await pay(f, 0, 45_000);
    await reachLastMeeting(f);
    const before = {
      ledger: await count(f.db, 'ledger_entries'),
      payments: await count(f.db, 'payments'),
      allocations: await count(f.db, 'allocations'),
      kas: await f.repos.ledger.getKasBalances(),
    };

    const skip = await f.repos.weeks.skipLast(f.periodId, '  host cannot receive guests ');
    expect(skip).toMatchObject({ periodId: f.periodId, week: 3, reason: 'host cannot receive guests', undoReason: null, undoneAt: null });

    const week = await f.repos.weeks.get(f.periodId, 3);
    expect(week).toMatchObject({ status: 'skipped', skipped: true, closedAt: null });
    expect(await count(f.db, 'ledger_entries')).toBe(before.ledger);
    expect(await count(f.db, 'payments')).toBe(before.payments);
    expect(await count(f.db, 'allocations')).toBe(before.allocations);
    expect(await f.repos.ledger.getKasBalances()).toEqual(before.kas);
  });

  it('keeps the host that was already set on the skipped meeting', async () => {
    const f = await setup(3);
    await reachLastMeeting(f); // assigning meeting 2 gives the last meeting to the only member left
    const hostBefore = (await f.repos.weeks.get(f.periodId, 3))?.hostMemberId;
    expect(hostBefore).toBe(f.ids[2]);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    expect((await f.repos.weeks.get(f.periodId, 3))?.hostMemberId).toBe(hostBefore);
  });

  it('rejects a blank reason', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    expect(await codeOf(f.repos.weeks.skipLast(f.periodId, '  '))).toBe('reason_required');
    expect(await count(f.db, 'week_skips')).toBe(0);
  });

  it('rejects while an earlier meeting is open', async () => {
    const f = await setup(3);
    expect(await codeOf(f.repos.weeks.skipLast(f.periodId, 'x'))).toBe('earlier_open');
  });

  it('rejects when the host of an earlier meeting is not paid, and when a payout was corrected', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.ledger.reverseHostPayout(f.periodId, 1, 'salah');
    const preview = await f.repos.weeks.previewSkip(f.periodId);
    expect(preview.eligible).toBe(false);
    expect(preview.blocker).toMatchObject({ code: 'host_unpaid', weeks: [1] });
    expect(await codeOf(f.repos.weeks.skipLast(f.periodId, 'x'))).toBe('host_unpaid');
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-02-02', 'tunai');
    await f.repos.weeks.skipLast(f.periodId, 'x');
  });

  it('rejects when the host payout of the last meeting stands, allows it after a correction', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.ledger.settleHost(f.periodId, 3, '2026-02-02', 'tunai'); // the current meeting may be paid out
    expect(await codeOf(f.repos.weeks.skipLast(f.periodId, 'x'))).toBe('payout_stands');
    await f.repos.ledger.reverseHostPayout(f.periodId, 3, 'host cannot host');
    await f.repos.weeks.skipLast(f.periodId, 'x');
    expect((await f.repos.weeks.get(f.periodId, 3))?.skipped).toBe(true);
  });

  it('rejects a second skip, a closed period and a period of one member', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    expect(await codeOf(f.repos.weeks.skipLast(f.periodId, 'again'))).toBe('already_skipped');

    await f.repos.periods.close(f.periodId, '2026-12-30');
    expect(await codeOf(f.repos.weeks.skipLast(f.periodId, 'x'))).toBe('period_ended');

    const one = await setup(1);
    expect(await codeOf(one.repos.weeks.skipLast(one.periodId, 'x'))).toBe('too_few_members');
    expect((await one.repos.weeks.previewSkip(one.periodId)).blocker?.code).toBe('too_few_members');
  });

  it('rejects an unknown period', async () => {
    const f = await setup(3);
    await expect(f.repos.weeks.skipLast('nope', 'x')).rejects.toThrow(/period nope not found/);
    await expect(f.repos.weeks.previewSkip('nope')).rejects.toThrow(/not found/);
  });
});

describe('a skipped meeting is untouchable', () => {
  async function skipped(): Promise<Fixture> {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    return f;
  }

  it('cannot be closed, paid out, given a host or date, or swapped', async () => {
    const f = await skipped();
    await expect(f.repos.weeks.closeOldest(f.periodId)).rejects.toThrow(/week 3 is skipped; it cannot be closed/);
    await expect(f.repos.weeks.close(f.periodId, 3)).rejects.toThrow(/week 3 is skipped; it cannot be closed/);
    await expect(f.repos.ledger.settleHost(f.periodId, 3, '2026-02-02', 'tunai')).rejects.toThrow(/week 3 is skipped; it has no host payout/);
    await expect(f.repos.ledger.previewHostPayout(f.periodId, 3, '2026-02-02', 'tunai')).rejects.toThrow(/skipped/);
    await expect(f.repos.weeks.assignHost(f.periodId, 3, f.ids[2] as string, '2026-03-03')).rejects.toThrow(/skipped/);
    await expect(f.repos.weeks.swapHosts(f.periodId, 2, 3)).rejects.toThrow(/closed|skipped/);
    await expect(f.repos.weeks.swapHosts(f.periodId, 3, 3)).rejects.toThrow(/itself/);
  });

  it('takes no payment: money flows past it into credit', async () => {
    const f = await skipped();
    // Member 3 owes meetings 1-2 (meeting 3, hers, is skipped); the host offsets of the other two do not touch her.
    const preview = await f.repos.payments.preview({ periodId: f.periodId, memberId: f.ids[2] as string, date: '2026-01-06', amount: 60_000 });
    expect(preview.allocations.map((a) => a.week)).toEqual([1, 2]);
    expect(preview.creditAmount).toBe(30_000);
    const rec = await pay(f, 2, 60_000);
    expect(rec.allocations.map((a) => a.week)).toEqual([1, 2]);
    expect(rec.credit).toBe(30_000);
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[2] as string)).toBe(30_000);
  });

  it('shows nothing due for the meeting in every member status', async () => {
    const f = await skipped();
    const statuses = await f.repos.payments.getWeekStatuses(f.periodId, f.ids[1] as string);
    expect(statuses[2]).toEqual({ week: 3, due: 0, paid: 0, offset: 0, credited: 0, outstanding: 0, skipped: true });
    const balances = await f.repos.payments.listBalances(f.periodId);
    expect(balances.every((b) => b.throughWeek === 3)).toBe(true);
  });
});

describe('prepaid dues become credit', () => {
  it('previewSkip counts what is already settled for the meeting, skipLast turns it into credit, undo takes it back', async () => {
    const f = await setup(3);
    await pay(f, 0, 45_000); // weeks 1-3 of member 1
    await pay(f, 1, 30_000); // weeks 1-2 of member 2; her meeting-3 due is offset when her host payout is made
    await pay(f, 2, 45_000);
    await reachLastMeeting(f);
    const preview = await f.repos.weeks.previewSkip(f.periodId);
    expect(preview).toMatchObject({ number: 3, eligible: true, blocker: null, prepaidTotal: 45_000, prepaidMembers: 3 });

    await f.repos.weeks.skipLast(f.periodId, 'x');
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[0] as string)).toBe(15_000); // paid ahead
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[1] as string)).toBe(15_000); // released host offset
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[2] as string)).toBe(15_000);
    const list = await f.repos.payments.listWithCredit(f.periodId, f.ids[0] as string);
    expect(list.map((p) => p.credit)).toEqual([15_000]);
    const entry = (await f.repos.ledger.listByMember(f.periodId, f.ids[0] as string)).find((e) => e.type === 'member_payment');
    expect((await f.repos.payments.getByLedgerEntry(entry?.id as string))?.credit).toBe(15_000);
    // allocation rows are kept, flagged
    const allocs = await f.repos.payments.listAllocations(f.periodId, f.ids[0] as string);
    expect(allocs.map((a) => [a.week, a.skipped === true])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    expect(await count(f.db, 'allocations')).toBe(3 + 2 + 3);
    expect((await f.repos.weeks.previewSkip(f.periodId)).prepaidTotal).toBe(0);

    await f.repos.weeks.undoSkip(f.periodId, 'host can host after all');
    for (const id of f.ids) expect(await f.repos.payments.getCredit(f.periodId, id)).toBe(0);
    expect((await f.repos.payments.getWeekStatuses(f.periodId, f.ids[1] as string))[2]).toMatchObject({ offset: 15_000, outstanding: 0 });
    expect((await f.repos.payments.getWeekStatuses(f.periodId, f.ids[0] as string))[2]).toMatchObject({ paid: 15_000, outstanding: 0 });
    expect((await f.repos.weeks.get(f.periodId, 3))?.status).toBe('open');
  });

  it('a host offset on the skipped meeting becomes credit of that host and returns on undo', async () => {
    const f = await setup(3);
    // Member 1 pays weeks 1-2; meetings 1-2 close; paying host 1 now offsets member 1's week 3 (current meeting).
    await pay(f, 0, 30_000);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-06');
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-01-13');
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-02-01', 'tunai');
    await f.repos.ledger.settleHost(f.periodId, 2, '2026-02-01', 'tunai');
    expect((await f.repos.payments.getWeekStatuses(f.periodId, f.ids[0] as string))[2]).toMatchObject({ offset: 15_000, outstanding: 0 });
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[0] as string)).toBe(0);

    await f.repos.weeks.skipLast(f.periodId, 'x');
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[0] as string)).toBe(15_000);
    expect((await f.repos.payments.getWeekStatuses(f.periodId, f.ids[0] as string))[2]).toMatchObject({ offset: 0, outstanding: 0, skipped: true });

    await f.repos.weeks.undoSkip(f.periodId, 'x');
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[0] as string)).toBe(0);
    expect((await f.repos.payments.getWeekStatuses(f.periodId, f.ids[0] as string))[2]).toMatchObject({ offset: 15_000, outstanding: 0 });
  });

  it('a corrected payout releases nothing: its reversed offset is not counted', async () => {
    const f = await setup(3);
    await pay(f, 0, 30_000);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-06');
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-01-13');
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-02-01', 'tunai');
    await f.repos.ledger.settleHost(f.periodId, 2, '2026-02-01', 'tunai');
    await f.repos.ledger.reverseHostPayout(f.periodId, 1, 'salah');
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-02-02', 'tunai'); // the new offset covers week 3 again
    await f.repos.weeks.skipLast(f.periodId, 'x');
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[0] as string)).toBe(15_000); // only the offset in force
  });
});

describe('close and carry-over with a skipped meeting', () => {
  it('closes the period normally: no write-off for the skipped meeting, the meeting closes with the period', async () => {
    const f = await setup(3);
    await reachLastMeeting(f); // nobody pays; the offsets of the two hosts cover their own meetings 1-2
    await f.repos.weeks.skipLast(f.periodId, 'x');

    const preview = await f.repos.periods.previewClose(f.periodId);
    expect(preview).toMatchObject({ canClose: true, openWeeks: [], unpaidHostWeeks: [], skippedWeeks: [3] });
    // only member 3 (no host payout of her own) owes anything: meetings 1-2, nothing for the skipped meeting 3
    expect(preview.writeoffs).toEqual([{ memberId: f.ids[2], amount: 30_000 }]);

    await f.repos.periods.close(f.periodId, '2026-12-30');
    const week = await f.repos.weeks.get(f.periodId, 3);
    expect(week).toMatchObject({ status: 'skipped', skipped: true });
    expect(week?.closedAt).not.toBeNull();
    expect(await count(f.db, 'weeks', "status = 'open'")).toBe(0);
    expect(await count(f.db, 'ledger_entries', "type = 'debt_writeoff'")).toBe(1);
    expect(await count(f.db, 'credit_applications')).toBe(0);
  });

  it('cannot be undone after the period was closed', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    expect(await codeOf(f.repos.weeks.undoSkip(f.periodId, 'x'))).toBe('period_ended');
  });

  it('own credit released by the skip settles the member\'s arrears at close, then the rest is carried over', async () => {
    const f = await setup(3);
    await pay(f, 0, 45_000); // all three weeks
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x'); // 15.000 released
    await f.repos.periods.close(f.periodId, '2026-12-30');
    expect(await f.repos.credits.getAvailable(f.periodId, f.ids[0] as string)).toBe(15_000);

    const next = await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-05', memberIds: f.ids });
    const apps = await f.db.getAll<{ member_id: string; to_period_id: string; week: number; amount: number; kind: string }>(
      'SELECT member_id, to_period_id, week, amount, kind FROM credit_applications',
    );
    expect(apps).toEqual([{ member_id: f.ids[0], to_period_id: next.id, week: 1, amount: 15_000, kind: 'carry_over' }]);
    expect(await f.repos.credits.getAvailable(f.periodId, f.ids[0] as string)).toBe(0);
  });

  it('closed-period reports keep the skip: meeting report, period total and history', async () => {
    const f = await setup(3);
    await pay(f, 0, 45_000);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    const report = await f.repos.reports.getPeriodReport(f.periodId);
    expect(report.summary.totalDues).toBe(15_000 * 3 * 2);
    const meeting = report.meetings.find((m) => m.week === 3);
    expect(meeting).toMatchObject({ skipped: true, status: 'closed', totalDues: 0, hostPayoutDue: 0, kasContribution: 0, hostPayout: null });
    expect(report.meetings.find((m) => m.week === 1)).toMatchObject({ skipped: false, totalDues: 45_000 });

    const history = await f.repos.reports.getMemberHistory(f.periodId, f.ids[0] as string);
    expect(history.weeks.map((w) => w.skipped)).toEqual([false, false, true]);
    const payment = history.events.find((e) => e.kind === 'payment');
    expect(payment?.settled.map((s) => s.week)).toEqual([1, 2]);
    expect(payment).toMatchObject({ credit: 15_000, releasedBySkip: 15_000 });
  });
});

describe('carry-over into the skipped meeting is released to the source period', () => {
  /** Period 1 ends with 45.000 credit for member 1; period 2 carries it over weeks 1-3. */
  async function twoPeriods(): Promise<{ f: Fixture; p2: string }> {
    const f = await setup(3);
    await pay(f, 0, 90_000); // 45.000 of dues and 45.000 of credit
    await reachLastMeeting(f);
    await f.repos.weeks.assignHost(f.periodId, 3, f.ids[2] as string, '2026-01-20');
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.ledger.settleHost(f.periodId, 3, '2026-02-03', 'tunai');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    const p2 = await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-05', memberIds: f.ids });
    expect(await count(f.db, 'credit_applications', 'to_period_id = ?'.replace('?', `'${p2.id}'`))).toBe(3);
    return { f, p2: p2.id };
  }

  async function reachLast2(f: Fixture, p2: string): Promise<void> {
    await f.repos.weeks.assignHost(p2, 1, f.ids[0] as string, '2027-01-05');
    await f.repos.weeks.assignHost(p2, 2, f.ids[1] as string, '2027-01-12');
    for (const k of [1, 2]) {
      await f.repos.weeks.closeOldest(p2);
      await f.repos.ledger.settleHost(p2, k, '2026-12-31', 'tunai');
    }
  }

  it('skip frees the credit applied to the skipped meeting back to the source period; undo takes it again', async () => {
    const { f, p2 } = await twoPeriods();
    const m = f.ids[0] as string;
    await reachLast2(f, p2);
    expect(await f.repos.credits.getAvailable(f.periodId, m)).toBe(0);
    expect((await f.repos.weeks.previewSkip(p2)).prepaidTotal).toBe(15_000);

    await f.repos.weeks.skipLast(p2, 'x');
    expect(await f.repos.credits.getAvailable(f.periodId, m)).toBe(15_000);
    expect((await f.repos.payments.getWeekStatuses(p2, m))[2]).toMatchObject({ credited: 0, outstanding: 0, skipped: true });

    await f.repos.weeks.undoSkip(p2, 'x');
    expect(await f.repos.credits.getAvailable(f.periodId, m)).toBe(0);
    expect((await f.repos.payments.getWeekStatuses(p2, m))[2]).toMatchObject({ credited: 15_000, outstanding: 0 });
  });

  it('undo is blocked, and rolled back, when the released credit was refunded meanwhile', async () => {
    const { f, p2 } = await twoPeriods();
    const m = f.ids[0] as string;
    await reachLast2(f, p2);
    await f.repos.weeks.skipLast(p2, 'x');
    await f.repos.credits.refund(f.periodId, m, '2026-12-31', 'tunai');
    const undosBefore = await count(f.db, 'week_skip_undos');

    await expect(f.repos.weeks.undoSkip(p2, 'x')).rejects.toBeInstanceOf(SkipUndoBlockedError);
    expect(await count(f.db, 'week_skip_undos')).toBe(undosBefore);
    expect((await f.repos.weeks.get(p2, 3))?.skipped).toBe(true);
    expect(await f.repos.credits.getAvailable(f.periodId, m)).toBe(0);
  });

  it('the released credit is expected-kas liability exactly once', async () => {
    const { f, p2 } = await twoPeriods();
    await reachLast2(f, p2);
    const before = await f.repos.reports.getKasReport();
    await f.repos.weeks.skipLast(p2, 'x');
    const after = await f.repos.reports.getKasReport();
    expect(after.balances).toEqual(before.balances);
    // before: 15.000 counted as carried into an open meeting; after: the same 15.000 counted as available credit
    expect(after.expected.creditHeld).toBe(before.expected.creditHeld);
    expect(after.expected.creditCarriedOpen).toBe(before.expected.creditCarriedOpen - 15_000);
    expect(after.expected.creditAvailable).toBe(before.expected.creditAvailable + 15_000);
    // members 2 and 3 no longer owe meeting 3 (U = 30.000); nothing was paid ahead in cash (F = 0)
    expect(after.expected.outstandingDues).toBe(before.expected.outstandingDues - 30_000);
    expect(after.expected.expected).toBe(before.expected.expected - 30_000);
  });
});

describe('undoSkip', () => {
  it('needs a reason and a skip in force, and keeps the history', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    expect(await codeOf(f.repos.weeks.undoSkip(f.periodId, 'x'))).toBe('not_skipped');
    await f.repos.weeks.skipLast(f.periodId, 'first');
    expect(await codeOf(f.repos.weeks.undoSkip(f.periodId, ' '))).toBe('reason_required');

    const undone = await f.repos.weeks.undoSkip(f.periodId, ' changed my mind ');
    expect(undone).toMatchObject({ reason: 'first', undoReason: 'changed my mind' });
    expect(undone.undoneAt).toBe(NOW);
    expect(await codeOf(f.repos.weeks.undoSkip(f.periodId, 'x'))).toBe('not_skipped');

    // the meeting can be skipped again; both skips stay in the history
    await f.repos.weeks.skipLast(f.periodId, 'second');
    const history = await f.repos.weeks.listSkipHistory(f.periodId);
    expect(history.map((h) => [h.reason, h.undoReason])).toEqual([
      ['first', 'changed my mind'],
      ['second', null],
    ]);
    expect(await count(f.db, 'week_skips')).toBe(2);
    expect(await count(f.db, 'week_skip_undos')).toBe(1);
  });

  it('after undo the meeting is open, closable and payable like any other', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    await f.repos.weeks.undoSkip(f.periodId, 'x');
    expect((await f.repos.weeks.get(f.periodId, 3))).toMatchObject({ status: 'open', skipped: false });
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.ledger.settleHost(f.periodId, 3, '2026-02-03', 'tunai');
    const preview = await f.repos.periods.previewClose(f.periodId);
    expect(preview.canClose).toBe(true);
    expect(preview.skippedWeeks).toEqual([]);
  });
});

describe('readers', () => {
  it('the exports list the meeting as skipped with nothing due, and leave it out of the payment weeks', async () => {
    const f = await setup(3);
    await pay(f, 0, 45_000);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    const dues = await f.repos.exports.listMeetingDues();
    const rows = dues.filter((r) => r.week === 3);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.meetingStatus === 'skipped' && r.due === 0 && r.outstanding === 0)).toBe(true);
    const payments = await f.repos.exports.listPayments();
    expect(payments[0]).toMatchObject({ weeks: [1, 2], credit: 15_000 });
  });

  it('meeting report of a skipped meeting does not throw', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    const meeting = await f.repos.reports.getMeetingReport(f.periodId, 3);
    expect(meeting).toMatchObject({ skipped: true, status: 'open', totalDues: 0 });
    expect(meeting.members.every((m) => m.state === 'skipped')).toBe(true);
  });

  it('a skipped meeting is not an unpaid payout in the kas report', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    const report = await f.repos.reports.getKasReport();
    expect(report.expected.unpaidPayoutCount).toBe(0);
  });
});
