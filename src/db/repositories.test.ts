import { DomainError } from '@/domain/money';
import { createRepositories, RepositoryError, type Repositories } from './index';
import type { Db } from './db';
import { createMigratedTestDb } from './testing/sqlJsDriver';

interface Fixture {
  db: Db;
  repos: Repositories;
  periodId: string;
  /** Member ids in selection order. With `scheduled` (default) index 0 hosts week 1, like an old period. */
  ids: string[];
}

/**
 * `scheduled: true` (default) writes a full host schedule straight into the table, the way periods created
 * before M3b look on the phone (every week has a host). `scheduled: false` is a new period: all hosts NULL.
 */
async function setup(memberCount = 4, scheduled = true): Promise<Fixture> {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
  const ids: string[] = [];
  for (let i = 0; i < memberCount; i += 1) ids.push((await repos.members.create(`Member ${i + 1}`)).id);
  const period = await repos.periods.create({ name: 'Periode 1', startDate: '2026-01-04', memberIds: ids });
  if (scheduled) {
    for (let i = 0; i < ids.length; i += 1) {
      await db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [ids[i] as string, period.id, i + 1]);
    }
  }
  return { db, repos, periodId: period.id, ids };
}

const count = async (db: Db, table: string): Promise<number> =>
  (await db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? -1;

describe('periods and weeks', () => {
  it('creates N members and N meeting slots, 7 days apart, with NO host yet', async () => {
    const { repos, periodId, ids } = await setup(4, false);
    const period = await repos.periods.getById(periodId);
    expect(period).toMatchObject({ memberCount: 4, status: 'active', startDate: '2026-01-04' });
    expect((await repos.periods.getMembers(periodId)).map((m) => m.memberId)).toEqual(ids);

    const weeks = await repos.weeks.listByPeriod(periodId);
    expect(weeks.map((w) => w.date)).toEqual(['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25']);
    expect(weeks.map((w) => w.hostMemberId)).toEqual([null, null, null, null]);
    expect(weeks.every((w) => w.status === 'open')).toBe(true);
  });

  it('leaves nothing behind when period creation fails', async () => {
    const { db, repos, periodId, ids } = await setup(2);
    // End the first period so the one-active-period rule does not hide the failures under test.
    await repos.weeks.close(periodId, 1);
    await repos.weeks.close(periodId, 2);
    await repos.periods.close(periodId, '2026-01-11');
    const before = { periods: await count(db, 'periods'), pm: await count(db, 'period_members'), weeks: await count(db, 'weeks') };
    await expect(repos.periods.create({ name: 'X', startDate: '2026-02-01', memberIds: [ids[0] as string, 'ghost'] })).rejects.toThrow();
    await expect(repos.periods.create({ name: 'X', startDate: '2026-02-01', memberIds: [ids[0] as string, ids[0] as string] })).rejects.toThrow(
      RepositoryError,
    );
    await expect(repos.periods.create({ name: 'X', startDate: '2026-02-31', memberIds: ids })).rejects.toThrow(DomainError);
    expect({ periods: await count(db, 'periods'), pm: await count(db, 'period_members'), weeks: await count(db, 'weeks') }).toEqual(before);
  });

  it('allows only one active period at a time', async () => {
    const { repos, periodId, ids } = await setup(2);
    await expect(repos.periods.create({ name: 'Dua', startDate: '2026-03-01', memberIds: ids })).rejects.toThrow(/still active/);
    expect((await repos.periods.getActive())?.id).toBe(periodId);
    await repos.weeks.close(periodId, 1);
    await repos.weeks.close(periodId, 2);
    await repos.periods.close(periodId, '2026-01-11');
    expect(await repos.periods.getActive()).toBeNull();
    const next = await repos.periods.create({ name: 'Dua', startDate: '2026-03-01', memberIds: ids });
    expect((await repos.periods.getActive())?.id).toBe(next.id);
  });

  it('ends a period only when every week is closed', async () => {
    const { repos, periodId } = await setup(2);
    await expect(repos.periods.close(periodId, '2026-01-11')).rejects.toThrow(/open weeks/);
    await repos.weeks.close(periodId, 1);
    await expect(repos.periods.close(periodId, '2026-01-11')).rejects.toThrow(/open weeks/);
    await repos.weeks.close(periodId, 2);
    await expect(repos.periods.close(periodId, '2026-01-01')).rejects.toThrow(/before the start/);
    await expect(repos.periods.close(periodId, '2026-02-31')).rejects.toThrow(DomainError);
    await expect(repos.periods.close('ghost', '2026-01-11')).rejects.toThrow(/not found/);
    await repos.periods.close(periodId, '2026-01-11');
    expect(await repos.periods.getById(periodId)).toMatchObject({ status: 'closed', endDate: '2026-01-11' });
    await expect(repos.periods.close(periodId, '2026-01-12')).rejects.toThrow(/already closed/);
  });

  it('swaps the hosts of two open weeks', async () => {
    const { repos, periodId, ids } = await setup(4);
    await repos.weeks.swapHosts(periodId, 1, 4);
    const weeks = await repos.weeks.listByPeriod(periodId);
    expect(weeks.map((w) => w.hostMemberId)).toEqual([ids[3], ids[1], ids[2], ids[0]]);
  });

  it('rejects a host swap when either week is closed', async () => {
    const { repos, periodId, ids } = await setup(4);
    await repos.weeks.close(periodId, 2);
    await expect(repos.weeks.swapHosts(periodId, 2, 3)).rejects.toThrow(/closed/);
    await expect(repos.weeks.swapHosts(periodId, 3, 2)).rejects.toThrow(/closed/);
    expect((await repos.weeks.get(periodId, 2))?.hostMemberId).toBe(ids[1]);
    expect((await repos.weeks.get(periodId, 3))?.hostMemberId).toBe(ids[2]);
  });

  it('rejects swapping a week with itself or an unknown week', async () => {
    const { repos, periodId } = await setup(4);
    await expect(repos.weeks.swapHosts(periodId, 1, 1)).rejects.toThrow(RepositoryError);
    await expect(repos.weeks.swapHosts(periodId, 1, 9)).rejects.toThrow(/not found/);
  });

  it('also blocks a closed-week host change at database level', async () => {
    const { db, repos, periodId } = await setup(4);
    await repos.weeks.close(periodId, 1);
    await expect(db.run('UPDATE weeks SET host_member_id = NULL WHERE period_id = ? AND number = 1', [periodId])).rejects.toThrow(
      /closed week/,
    );
    await expect(db.run("UPDATE weeks SET status = 'open' WHERE period_id = ? AND number = 1", [periodId])).rejects.toThrow(
      /reopened/,
    );
  });

  it('a member cannot host twice in one period (unique index)', async () => {
    const { db, periodId, ids } = await setup(4);
    await expect(
      db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = 2', [ids[0] as string, periodId]),
    ).rejects.toThrow(/UNIQUE/i);
  });
});

describe('M3b: host and date per meeting', () => {
  const hostsOf = async (f: Fixture) => (await f.repos.weeks.listByPeriod(f.periodId)).map((w) => w.hostMemberId);
  const datesOf = async (f: Fixture) => (await f.repos.weeks.listByPeriod(f.periodId)).map((w) => w.date);

  it('assigns the only meeting automatically in a period of one member', async () => {
    const f = await setup(1, false);
    expect(await hostsOf(f)).toEqual([f.ids[0]]);
  });

  it('allows a host for the current and next meeting only; later meetings stay undecided', async () => {
    const f = await setup(4, false);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-04');
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-01-11');
    await expect(f.repos.weeks.assignHost(f.periodId, 3, f.ids[2] as string, '2026-01-18')).rejects.toThrow(/outside the selectable window/);
    expect(await hostsOf(f)).toEqual([f.ids[0], f.ids[1], null, null]);
    // after closing meeting 1 the window moves on to meetings 2 and 3
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.weeks.assignHost(f.periodId, 3, f.ids[2] as string, '2026-01-18');
    expect(await hostsOf(f)).toEqual([f.ids[0], f.ids[1], f.ids[2], f.ids[3]]); // meeting 4 was the last one: automatic
  });

  it('never accepts a member who hosted a closed meeting', async () => {
    const f = await setup(4, false);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-04');
    await f.repos.weeks.closeOldest(f.periodId);
    await expect(f.repos.weeks.assignHost(f.periodId, 2, f.ids[0] as string, '2026-01-11')).rejects.toThrow(/already hosted a closed week/);
    await expect(f.repos.weeks.assignHost(f.periodId, 1, f.ids[1] as string, '2026-01-04')).rejects.toThrow(/closed/);
    await expect(f.repos.weeks.assignHost(f.periodId, 2, 'ghost', '2026-01-11')).rejects.toThrow(/not found/);
  });

  it('refuses to close a meeting without a host and closes it once the host is picked', async () => {
    const f = await setup(3, false);
    await expect(f.repos.weeks.closeOldest(f.periodId)).rejects.toThrow(/has no host/);
    await expect(f.repos.weeks.close(f.periodId, 1)).rejects.toThrow(/has no host/);
    expect((await f.repos.weeks.get(f.periodId, 1))?.status).toBe('open');
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-04');
    expect(await f.repos.weeks.closeOldest(f.periodId)).toBe(1);
  });

  it('assigns the last meeting to the last member automatically', async () => {
    const f = await setup(3, false);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[1] as string, '2026-01-04');
    expect(await hostsOf(f)).toEqual([f.ids[1], null, null]); // two members left for two meetings: not automatic yet
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[2] as string, '2026-01-11');
    expect(await hostsOf(f)).toEqual([f.ids[1], f.ids[2], f.ids[0]]);
  });

  it('re-picking the host of an open meeting frees the previous host', async () => {
    const f = await setup(4, false);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-04');
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[2] as string, '2026-01-04');
    expect(await hostsOf(f)).toEqual([f.ids[2], null, null, null]);
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[0] as string, '2026-01-11'); // freed member can be picked again
    expect(await hostsOf(f)).toEqual([f.ids[2], f.ids[0], null, null]);
  });

  it('exchanges the hosts when the picked member already holds another open meeting (new period)', async () => {
    const f = await setup(4, false);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-04');
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-01-11');
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[0] as string, '2026-01-11'); // holder: meeting 1
    expect(await hostsOf(f)).toEqual([f.ids[1], f.ids[0], null, null]);
  });

  describe('old, fully scheduled periods', () => {
    it('keep their stored hosts and dates untouched', async () => {
      const f = await setup(4);
      expect(await hostsOf(f)).toEqual(f.ids);
      expect(await datesOf(f)).toEqual(['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25']);
    });

    it('exchange two hosts atomically, even with a meeting outside the window', async () => {
      const f = await setup(4);
      await f.repos.weeks.assignHost(f.periodId, 1, f.ids[3] as string, '2026-01-04'); // holder: meeting 4
      expect(await hostsOf(f)).toEqual([f.ids[3], f.ids[1], f.ids[2], f.ids[0]]);
      await f.repos.weeks.assignHost(f.periodId, 2, f.ids[3] as string, '2026-01-11');
      expect(await hostsOf(f)).toEqual([f.ids[1], f.ids[3], f.ids[2], f.ids[0]]);
    });

    it('apply the window limit to changes: meeting 3 cannot be changed while 1 and 2 are open', async () => {
      const f = await setup(4);
      await expect(f.repos.weeks.assignHost(f.periodId, 3, f.ids[0] as string, '2026-01-18')).rejects.toThrow(/outside the selectable window/);
      expect(await hostsOf(f)).toEqual(f.ids);
    });

    it('never accept a member of a closed meeting, and exchange with a later open meeting', async () => {
      const f = await setup(4);
      await f.repos.weeks.closeOldest(f.periodId);
      await expect(f.repos.weeks.assignHost(f.periodId, 2, f.ids[0] as string, '2026-01-11')).rejects.toThrow(/already hosted a closed week/);
      await f.repos.weeks.assignHost(f.periodId, 2, f.ids[2] as string, '2026-01-11'); // exchange with meeting 3
      expect(await hostsOf(f)).toEqual([f.ids[0], f.ids[2], f.ids[1], f.ids[3]]);
    });

    it('do not shift the stored dates of meetings that already have a host', async () => {
      const f = await setup(4);
      await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-06');
      expect(await datesOf(f)).toEqual(['2026-01-06', '2026-01-11', '2026-01-18', '2026-01-25']);
      await expect(f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-11')).rejects.toThrow(/earlier than the next/);
    });
  });

  it('shifts the estimated dates of later undecided meetings, 7 days apart from the last chosen date', async () => {
    const f = await setup(4, false);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-04');
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-01-20'); // a break of a week and a half
    expect(await datesOf(f)).toEqual(['2026-01-04', '2026-01-20', '2026-01-27', '2026-02-03']);
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-01-14'); // moved back
    expect(await datesOf(f)).toEqual(['2026-01-04', '2026-01-14', '2026-01-21', '2026-01-28']);
  });

  it('never changes the date of a closed meeting', async () => {
    const f = await setup(4, false);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-05');
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-03-01');
    expect(await datesOf(f)).toEqual(['2026-01-05', '2026-03-01', '2026-03-08', '2026-03-15']);
    await expect(f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-06')).rejects.toThrow(/closed/);
    expect((await datesOf(f))[0]).toBe('2026-01-05');
  });

  it('requires a real date later than the previous meeting, and writes nothing when it refuses', async () => {
    const f = await setup(4, false);
    await f.repos.weeks.assignHost(f.periodId, 1, f.ids[0] as string, '2026-01-04');
    const before = { hosts: await hostsOf(f), dates: await datesOf(f) };
    await expect(f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-01-04')).rejects.toThrow(/later than the previous/);
    await expect(f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-01-03')).rejects.toThrow(DomainError);
    await expect(f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, '2026-02-31')).rejects.toThrow(/not a real calendar date/);
    await expect(f.repos.weeks.assignHost(f.periodId, 2, f.ids[1] as string, 'besok')).rejects.toThrow(DomainError);
    expect({ hosts: await hostsOf(f), dates: await datesOf(f) }).toEqual(before);
  });

  it('keeps everything when a write fails halfway (one transaction)', async () => {
    const f = await setup(4);
    await f.db.exec(
      "CREATE TRIGGER boom BEFORE UPDATE OF host_member_id ON weeks WHEN NEW.number = 4 AND NEW.host_member_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'boom'); END;",
    );
    await expect(f.repos.weeks.assignHost(f.periodId, 1, f.ids[3] as string, '2026-01-05')).rejects.toThrow(/boom/);
    expect(await hostsOf(f)).toEqual(f.ids);
    expect((await datesOf(f))[0]).toBe('2026-01-04');
  });

  it('refuses to pay out a host for a meeting without a host', async () => {
    const f = await setup(3, false);
    await expect(f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04')).rejects.toThrow(/has no host/);
    expect(await count(f.db, 'ledger_entries')).toBe(0);
  });

  it('still accepts payments while meetings have no host (a break)', async () => {
    const f = await setup(3, false);
    const { allocations } = await f.repos.payments.record({
      periodId: f.periodId,
      memberId: f.ids[0] as string,
      date: '2026-01-04',
      amount: 30_000,
      account: 'tunai',
    });
    expect(allocations.map((a) => [a.week, a.amount])).toEqual([[1, 15_000], [2, 15_000]]);
  });
});

describe('payments and allocations', () => {
  it('stores 30.000 as two allocations on the two oldest weeks with the original payment date', async () => {
    const { repos, periodId, ids } = await setup(4);
    const memberId = ids[2] as string;
    const { payment, allocations } = await repos.payments.record({ periodId, memberId, date: '2026-01-20', amount: 30_000, account: 'tunai' });

    expect(allocations.map((a) => [a.week, a.amount, a.paymentDate])).toEqual([
      [1, 15_000, '2026-01-20'],
      [2, 15_000, '2026-01-20'],
    ]);
    const stored = await repos.payments.getAllocationsForPayment(payment.id);
    expect(stored).toEqual(allocations);
    expect(await repos.payments.listByMember(periodId, memberId)).toEqual([payment]);

    const statuses = await repos.payments.getWeekStatuses(periodId, memberId);
    expect(statuses.map((s) => [s.paid, s.outstanding])).toEqual([
      [15_000, 0],
      [15_000, 0],
      [0, 15_000],
      [0, 15_000],
    ]);
  });

  it('rejects a payment that is not a multiple of 15.000 and rolls everything back', async () => {
    const { db, repos, periodId, ids } = await setup(4);
    await expect(
      repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-04', amount: 20_000, account: 'tunai' }),
    ).rejects.toThrow(DomainError);
    expect(await count(db, 'payments')).toBe(0);
    expect(await count(db, 'allocations')).toBe(0);
  });

  it('rejects zero amounts, saving nothing', async () => {
    const { db, repos, periodId, ids } = await setup(2);
    await expect(repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-04', amount: 0, account: 'tunai' })).rejects.toThrow();
    expect(await count(db, 'payments')).toBe(0);
    expect(await count(db, 'allocations')).toBe(0);
  });

  it('keeps the surplus as credit: 30.000 with one week left allocates 15.000 and leaves 15.000 credit', async () => {
    const { repos, periodId, ids } = await setup(2);
    const memberId = ids[0] as string;
    await repos.payments.record({ periodId, memberId, date: '2026-01-04', amount: 15_000, account: 'tunai' }); // week 1 of 2 settled
    const r = await repos.payments.record({ periodId, memberId, date: '2026-01-05', amount: 30_000, account: 'tunai' });

    expect(r.payment.amount).toBe(30_000);
    expect(r.allocations.map((a) => [a.week, a.amount])).toEqual([[2, 15_000]]);
    expect(r.credit).toBe(15_000);
    expect(await repos.payments.getCredit(periodId, memberId)).toBe(15_000);
    expect((await repos.payments.listWithCredit(periodId, memberId)).map((p) => p.credit)).toEqual([0, 15_000]);
    expect((await repos.payments.getWeekStatuses(periodId, memberId)).map((s) => [s.paid, s.outstanding])).toEqual([
      [15_000, 0],
      [15_000, 0],
    ]);
  });

  it('turns the whole payment into credit with zero allocations when every week is settled', async () => {
    const { db, repos, periodId, ids } = await setup(2);
    const memberId = ids[0] as string;
    await repos.payments.record({ periodId, memberId, date: '2026-01-04', amount: 30_000, account: 'tunai' });
    const allocationsBefore = await count(db, 'allocations');

    const r = await repos.payments.record({ periodId, memberId, date: '2026-01-06', amount: 45_000, account: 'tunai' });
    expect(r.allocations).toEqual([]);
    expect(r.credit).toBe(45_000);
    expect(await count(db, 'allocations')).toBe(allocationsBefore);
    expect(await count(db, 'payments')).toBe(2);
    expect(await repos.payments.getCredit(periodId, memberId)).toBe(45_000);
  });

  it('sums credit over several payments, per member, and never moves stored allocations', async () => {
    const { repos, periodId, ids } = await setup(2);
    const [a, b] = [ids[0] as string, ids[1] as string];
    await repos.payments.record({ periodId, memberId: a, date: '2026-01-04', amount: 45_000, account: 'tunai' }); // 15.000 credit
    const first = await repos.payments.getAllocationsForPayment((await repos.payments.listByMember(periodId, a))[0]!.id);
    await repos.payments.record({ periodId, memberId: a, date: '2026-01-01', amount: 30_000, account: 'tunai' }); // earlier date, all credit
    await repos.payments.record({ periodId, memberId: b, date: '2026-01-04', amount: 15_000, account: 'tunai' });

    expect(await repos.payments.getCredit(periodId, a)).toBe(45_000);
    expect(await repos.payments.getCredit(periodId, b)).toBe(0);
    expect(await repos.payments.getCredit(periodId, 'nobody')).toBe(0);
    const list = await repos.payments.listWithCredit(periodId, a);
    expect(list.reduce((s, p) => s + p.credit, 0)).toBe(45_000);
    expect(await repos.payments.getAllocationsForPayment(list.find((p) => p.date === '2026-01-04')!.id)).toEqual(first);
    for (const n of [45_000, ...list.map((p) => p.credit)]) expect(Number.isInteger(n)).toBe(true);
  });

  it('still rejects a non-multiple of 15.000 even when it would be pure credit, writing nothing', async () => {
    const { db, repos, periodId, ids } = await setup(2);
    const memberId = ids[0] as string;
    await repos.payments.record({ periodId, memberId, date: '2026-01-04', amount: 30_000, account: 'tunai' });
    await expect(repos.payments.record({ periodId, memberId, date: '2026-01-05', amount: 20_000, account: 'tunai' })).rejects.toThrow(DomainError);
    expect(await count(db, 'payments')).toBe(1);
    expect(await count(db, 'allocations')).toBe(2);
    expect(await repos.payments.getCredit(periodId, memberId)).toBe(0);
  });

  it('keeps stored allocations unchanged when an earlier-dated payment is entered later', async () => {
    const { repos, periodId, ids } = await setup(4);
    const memberId = ids[1] as string;
    const first = await repos.payments.record({ periodId, memberId, date: '2026-02-10', amount: 30_000, account: 'tunai' });
    const before = await repos.payments.getAllocationsForPayment(first.payment.id);

    const late = await repos.payments.record({ periodId, memberId, date: '2026-02-01', amount: 15_000, account: 'tunai' });
    expect(late.allocations.map((a) => [a.week, a.paymentDate])).toEqual([[3, '2026-02-01']]);
    expect(await repos.payments.getAllocationsForPayment(first.payment.id)).toEqual(before);
    expect((await repos.payments.listAllocations(periodId, memberId)).map((a) => a.week)).toEqual([1, 2, 3]);
  });

  it('refuses to update or delete a stored allocation', async () => {
    const { db, repos, periodId, ids } = await setup(4);
    await repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-04', amount: 15_000, account: 'tunai' });
    await expect(db.run('UPDATE allocations SET week = 2')).rejects.toThrow(/append-only/);
    await expect(db.run('DELETE FROM allocations')).rejects.toThrow(/append-only/);
  });
});

describe('ledger and host settlement', () => {
  it('appends and reads entries per period, member and week', async () => {
    const { repos, periodId, ids } = await setup(4);
    const memberId = ids[0] as string;
    await repos.ledger.append({
      periodId,
      type: 'member_payment',
      direction: 'in',
      date: '2026-01-04',
      amount: 15_000,
      memberId,
      week: 1,
      note: 'cash',
    });
    expect(await repos.ledger.listByPeriod(periodId)).toHaveLength(1);
    expect(await repos.ledger.listByMember(periodId, memberId)).toHaveLength(1);
    expect(await repos.ledger.listByMember(periodId, ids[1] as string)).toHaveLength(0);
    expect(await repos.ledger.listByWeek(periodId, 1)).toHaveLength(1);
    expect(await repos.ledger.listByWeek(periodId, 2)).toHaveLength(0);
  });

  it('rejects invalid ledger input', async () => {
    const { repos, periodId } = await setup(4);
    const base = { periodId, type: 'member_payment', direction: 'in', date: '2026-01-04', memberId: null, week: null, note: '' } as const;
    await expect(repos.ledger.append({ ...base, amount: 0 })).rejects.toThrow(/CHECK/i);
    await expect(repos.ledger.append({ ...base, amount: 10.5 })).rejects.toThrow(/CHECK/i);
    await expect(repos.ledger.append({ ...base, amount: 5000, type: 'bogus' as never })).rejects.toThrow(RepositoryError);
  });

  it('writes TWO entries (payout + offset) when the host has debt, and records the offset credit', async () => {
    const { db, repos, periodId, ids } = await setup(4);
    const host = ids[0] as string;
    const { entries, settlement } = await repos.ledger.settleHost(periodId, 1, '2026-01-04');

    expect(entries.map((e) => [e.type, e.direction, e.amount])).toEqual([
      ['host_payout', 'out', 40_000],
      ['host_offset', 'in', 15_000],
    ]);
    expect(settlement.netCash).toBe(25_000);
    expect(await count(db, 'offset_credits')).toBe(1);

    const statuses = await repos.payments.getWeekStatuses(periodId, host);
    expect(statuses[0]).toMatchObject({ paid: 0, offset: 15_000, outstanding: 0 });
  });

  it('writes ONE entry when the host has no debt', async () => {
    const { repos, periodId, ids } = await setup(4);
    await repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-04', amount: 15_000, account: 'tunai' });
    const { entries } = await repos.ledger.settleHost(periodId, 1, '2026-01-04');
    expect(entries.map((e) => e.type)).toEqual(['host_payout']);
  });

  it('does not offset the same debt twice and settles a week only once', async () => {
    const { repos, periodId, ids } = await setup(4);
    await repos.ledger.settleHost(periodId, 1, '2026-01-04');
    await expect(repos.ledger.settleHost(periodId, 1, '2026-01-04')).rejects.toThrow(/already has a host payout/);

    // A later payment of the host skips the offset week and starts at week 2.
    const { allocations } = await repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-11', amount: 15_000, account: 'tunai' });
    expect(allocations.map((a) => a.week)).toEqual([2]);
  });

  it('rolls the whole settlement back if a later step fails', async () => {
    const { db, repos, periodId } = await setup(4);
    await db.exec('DROP TABLE offset_credits');
    await expect(repos.ledger.settleHost(periodId, 1, '2026-01-04')).rejects.toThrow();
    expect(await count(db, 'ledger_entries')).toBe(0);
  });
});

describe('M4: recording payments', () => {
  const pay = (f: Fixture, i: number, amount: number, date = '2026-01-04', account: 'tunai' | 'debit' = 'tunai') => ({
    periodId: f.periodId,
    memberId: f.ids[i] as string,
    date,
    amount,
    account,
  });

  it('saves the payment, its allocations and ONE ledger entry for the whole amount in one go', async () => {
    const f = await setup(4);
    const r = await f.repos.payments.record(pay(f, 1, 45_000, '2026-01-10', 'debit'));
    expect(await count(f.db, 'payments')).toBe(1);
    expect(r.allocations.map((a) => a.week)).toEqual([1, 2, 3]);
    const ledger = await f.repos.ledger.listByPeriod(f.periodId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      type: 'member_payment',
      direction: 'in',
      amount: 45_000,
      date: '2026-01-10',
      memberId: f.ids[1],
      week: null,
      account: 'debit',
    });
  });

  it('puts the credit part into the ledger too (whole amount) and keeps it as member credit', async () => {
    const f = await setup(2);
    const r = await f.repos.payments.record(pay(f, 0, 60_000));
    expect(r.credit).toBe(30_000);
    expect(r.allocations.reduce((s, a) => s + a.amount, 0)).toBe(30_000);
    expect((await f.repos.ledger.listByPeriod(f.periodId))[0]?.amount).toBe(60_000);
    expect(await f.repos.payments.getCredit(f.periodId, f.ids[0] as string)).toBe(30_000);
  });

  it('is credit only after every week is settled', async () => {
    const f = await setup(3);
    const exact = await f.repos.payments.record(pay(f, 0, 45_000));
    expect(exact.credit).toBe(0);
    const extra = await f.repos.payments.record(pay(f, 0, 15_000, '2026-01-05'));
    expect(extra.credit).toBe(15_000);
    expect(extra.allocations).toEqual([]);
    expect(await count(f.db, 'ledger_entries')).toBe(2);
  });

  it('leaves no rows behind when the ledger write fails', async () => {
    const f = await setup(3);
    await f.db.exec("CREATE TRIGGER boom BEFORE INSERT ON ledger_entries BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(f.repos.payments.record(pay(f, 0, 30_000))).rejects.toThrow(/boom/);
    expect(await count(f.db, 'payments')).toBe(0);
    expect(await count(f.db, 'allocations')).toBe(0);
    expect(await count(f.db, 'ledger_entries')).toBe(0);
  });

  it('leaves no rows behind when saving the allocations fails', async () => {
    const f = await setup(3);
    await f.db.exec('DROP TABLE allocations');
    await expect(f.repos.payments.record(pay(f, 0, 30_000))).rejects.toThrow();
    expect(await count(f.db, 'payments')).toBe(0);
    expect(await count(f.db, 'ledger_entries')).toBe(0);
  });

  it.each([0, -15_000, 20_000, 14_999, 15_000.5])('rejects the amount %s and writes nothing', async (amount) => {
    const f = await setup(3);
    await expect(f.repos.payments.record(pay(f, 0, amount))).rejects.toThrow(DomainError);
    expect(await count(f.db, 'payments')).toBe(0);
    expect(await count(f.db, 'ledger_entries')).toBe(0);
  });

  it('rejects payments to an ended period', async () => {
    const f = await setup(2);
    await f.repos.weeks.close(f.periodId, 1);
    await f.repos.weeks.close(f.periodId, 2);
    await f.repos.periods.close(f.periodId, '2026-01-11');
    await expect(f.repos.payments.record(pay(f, 0, 15_000))).rejects.toThrow(/has ended/);
    await expect(f.repos.payments.preview(pay(f, 0, 15_000))).rejects.toThrow(/has ended/);
    expect(await count(f.db, 'payments')).toBe(0);
  });

  it('rejects a future date but accepts today and the past', async () => {
    const f = await setup(3); // clock in this fixture: 2026-12-31
    await expect(f.repos.payments.record(pay(f, 0, 15_000, '2027-01-01'))).rejects.toThrow(/in the future/);
    await expect(f.repos.payments.record(pay(f, 0, 15_000, '2026-02-31'))).rejects.toThrow(/real calendar date/);
    expect(await count(f.db, 'payments')).toBe(0);
    await f.repos.payments.record(pay(f, 0, 15_000, '2026-12-31'));
    await f.repos.payments.record(pay(f, 0, 15_000, '2025-12-01'));
    expect(await count(f.db, 'payments')).toBe(2);
  });

  it('rejects an unknown member and a pos other than tunai or debit', async () => {
    const f = await setup(2);
    await expect(f.repos.payments.record({ ...pay(f, 0, 15_000), memberId: 'ghost' })).rejects.toThrow(/not found/);
    await expect(
      f.repos.payments.record({ ...pay(f, 0, 15_000), account: 'piutang' as unknown as 'tunai' }),
    ).rejects.toThrow(/tunai or debit/);
    expect(await count(f.db, 'payments')).toBe(0);
  });

  it('shows in the preview exactly what record then stores', async () => {
    for (const amount of [15_000, 45_000, 60_000, 150_000]) {
      const g = await setup(4);
      await g.repos.payments.record(pay(g, 2, 15_000)); // week 1 already settled
      const preview = await g.repos.payments.preview(pay(g, 2, amount));
      const saved = await g.repos.payments.record(pay(g, 2, amount));
      expect(preview.allocations.map((a) => [a.week, a.amount])).toEqual(saved.allocations.map((a) => [a.week, a.amount]));
      expect(preview.creditAmount).toBe(saved.credit);
      expect(await g.repos.payments.getCredit(g.periodId, g.ids[2] as string)).toBe(saved.credit);
    }
  });

  it('preview writes nothing', async () => {
    const f = await setup(3);
    await f.repos.payments.preview(pay(f, 0, 30_000));
    expect(await count(f.db, 'payments')).toBe(0);
    expect(await count(f.db, 'ledger_entries')).toBe(0);
  });

  it('handles late and advance payments with the date they were really paid', async () => {
    const f = await setup(4);
    const advance = await f.repos.payments.record(pay(f, 0, 45_000, '2026-01-04')); // weeks 1-3 on day one
    expect(advance.allocations.map((a) => a.week)).toEqual([1, 2, 3]);
    const late = await f.repos.payments.record(pay(f, 1, 15_000, '2026-02-01')); // week 1, paid weeks later
    expect(late.allocations.map((a) => [a.week, a.paymentDate])).toEqual([[1, '2026-02-01']]);
  });

  it('still settles a host after payments have ledger entries', async () => {
    const f = await setup(4);
    await f.repos.payments.record(pay(f, 0, 15_000));
    const settled = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    expect(settled.entries.map((e) => e.type)).toEqual(['host_payout']);
    expect(settled.entries[0]?.account).toBe('tunai');
  });
});

describe('M4: closing weeks and arrears', () => {
  it('closes the oldest open week each time, in order, and then reports none left', async () => {
    const f = await setup(3);
    expect(await f.repos.weeks.closeOldest(f.periodId)).toBe(1);
    expect(await f.repos.weeks.closeOldest(f.periodId)).toBe(2);
    expect((await f.repos.weeks.listByPeriod(f.periodId)).map((w) => w.status)).toEqual(['closed', 'closed', 'open']);
    expect(await f.repos.weeks.closeOldest(f.periodId)).toBe(3);
    await expect(f.repos.weeks.closeOldest(f.periodId)).rejects.toThrow(/no open week/);
    await f.repos.periods.close(f.periodId, '2026-01-25'); // now possible
    expect((await f.repos.periods.getById(f.periodId))?.status).toBe('closed');
  });

  it('counts arrears through the oldest open week, later weeks are prepaid', async () => {
    const f = await setup(4);
    let balances = await f.repos.payments.listBalances(f.periodId);
    expect(balances.map((b) => [b.throughWeek, b.arrears])).toEqual([[1, 15_000], [1, 15_000], [1, 15_000], [1, 15_000]]);
    expect(await f.repos.payments.getArrearsSummary(f.periodId)).toEqual({ throughWeek: 1, membersInArrears: 4, totalArrears: 60_000 });

    await f.repos.weeks.closeOldest(f.periodId); // current week becomes 2
    await f.repos.payments.record({ periodId: f.periodId, memberId: f.ids[0] as string, date: '2026-01-04', amount: 60_000, account: 'tunai' });
    await f.repos.payments.record({ periodId: f.periodId, memberId: f.ids[1] as string, date: '2026-01-04', amount: 15_000, account: 'debit' });
    balances = await f.repos.payments.listBalances(f.periodId);
    expect(balances[0]).toMatchObject({ throughWeek: 2, arrears: 0, prepaid: 30_000, credit: 0 });
    expect(balances[1]).toMatchObject({ arrears: 15_000, prepaid: 0 });
    expect(balances[2]).toMatchObject({ arrears: 30_000 });
    expect(await f.repos.payments.getArrearsSummary(f.periodId)).toEqual({ throughWeek: 2, membersInArrears: 3, totalArrears: 75_000 });
  });

  it('uses the last week as current week when every week is closed', async () => {
    const f = await setup(2);
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.weeks.closeOldest(f.periodId);
    expect(await f.repos.weeks.currentWeek(f.periodId)).toBe(2);
    expect((await f.repos.payments.getArrearsSummary(f.periodId)).totalArrears).toBe(60_000);
  });

  it('shows member credit in the balances', async () => {
    const f = await setup(2);
    await f.repos.payments.record({ periodId: f.periodId, memberId: f.ids[0] as string, date: '2026-01-04', amount: 45_000, account: 'tunai' });
    expect((await f.repos.payments.listBalances(f.periodId))[0]).toMatchObject({ credit: 15_000 });
  });
});

async function membersOnly(): Promise<Repositories> {
  let n = 0;
  return createRepositories(await createMigratedTestDb(), { newId: () => `m${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
}

describe('members', () => {
  it('rejects duplicate names, case-insensitive, on create and rename', async () => {
    const repos = await membersOnly();
    const budi = await repos.members.create('Budi');
    const sari = await repos.members.create('Sari');
    await expect(repos.members.create('budi')).rejects.toThrow(/already exists/);
    await expect(repos.members.create('  BUDI  ')).rejects.toThrow(/already exists/);
    await expect(repos.members.rename(sari.id, 'bUdI')).rejects.toThrow(/already exists/);
    await repos.members.rename(budi.id, 'BUDI'); // own name, different case: allowed
    expect((await repos.members.getById(budi.id))?.name).toBe('BUDI');
  });

  it('rejects empty names', async () => {
    const repos = await membersOnly();
    await expect(repos.members.create('   ')).rejects.toThrow(/empty/);
  });
});
