import { DomainError } from '@/domain/money';
import { createRepositories, RepositoryError, type Repositories } from './index';
import type { Db } from './db';
import { createMigratedTestDb } from './testing/sqlJsDriver';

interface Fixture {
  db: Db;
  repos: Repositories;
  periodId: string;
  /** Member ids in planned host order: index 0 hosts week 1. */
  ids: string[];
}

async function setup(memberCount = 4): Promise<Fixture> {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => '2026-01-01T00:00:00.000Z' });
  const ids: string[] = [];
  for (let i = 0; i < memberCount; i += 1) ids.push((await repos.members.create(`Member ${i + 1}`)).id);
  const period = await repos.periods.create({ name: 'Periode 1', startDate: '2026-01-04', hostOrder: ids });
  return { db, repos, periodId: period.id, ids };
}

const count = async (db: Db, table: string): Promise<number> =>
  (await db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? -1;

describe('periods and weeks', () => {
  it('creates N members and N weekly slots, 7 days apart, one host each', async () => {
    const { repos, periodId, ids } = await setup(4);
    const period = await repos.periods.getById(periodId);
    expect(period).toMatchObject({ memberCount: 4, status: 'active', startDate: '2026-01-04' });
    expect((await repos.periods.getMembers(periodId)).map((m) => m.memberId)).toEqual(ids);

    const weeks = await repos.weeks.listByPeriod(periodId);
    expect(weeks.map((w) => w.date)).toEqual(['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25']);
    expect(weeks.map((w) => w.hostMemberId)).toEqual(ids);
    expect(weeks.every((w) => w.status === 'open')).toBe(true);
  });

  it('leaves nothing behind when period creation fails', async () => {
    const { db, repos, ids } = await setup(2);
    const before = { periods: await count(db, 'periods'), pm: await count(db, 'period_members'), weeks: await count(db, 'weeks') };
    await expect(repos.periods.create({ name: 'X', startDate: '2026-02-01', hostOrder: [ids[0] as string, 'ghost'] })).rejects.toThrow();
    await expect(repos.periods.create({ name: 'X', startDate: '2026-02-01', hostOrder: [ids[0] as string, ids[0] as string] })).rejects.toThrow(
      RepositoryError,
    );
    await expect(repos.periods.create({ name: 'X', startDate: '2026-02-31', hostOrder: ids })).rejects.toThrow(DomainError);
    expect({ periods: await count(db, 'periods'), pm: await count(db, 'period_members'), weeks: await count(db, 'weeks') }).toEqual(before);
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

describe('payments and allocations', () => {
  it('stores 30.000 as two allocations on the two oldest weeks with the original payment date', async () => {
    const { repos, periodId, ids } = await setup(4);
    const memberId = ids[2] as string;
    const { payment, allocations } = await repos.payments.record({ periodId, memberId, date: '2026-01-20', amount: 30_000 });

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
      repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-04', amount: 20_000 }),
    ).rejects.toThrow(DomainError);
    expect(await count(db, 'payments')).toBe(0);
    expect(await count(db, 'allocations')).toBe(0);
  });

  it('rejects zero amounts and payments larger than the remaining dues, saving nothing', async () => {
    const { db, repos, periodId, ids } = await setup(2);
    const memberId = ids[0] as string;
    await expect(repos.payments.record({ periodId, memberId, date: '2026-01-04', amount: 0 })).rejects.toThrow();
    await expect(repos.payments.record({ periodId, memberId, date: '2026-01-04', amount: 45_000 })).rejects.toThrow(
      /exceeds the remaining dues/,
    );
    expect(await count(db, 'payments')).toBe(0);
    expect(await count(db, 'allocations')).toBe(0);
  });

  it('keeps stored allocations unchanged when an earlier-dated payment is entered later', async () => {
    const { repos, periodId, ids } = await setup(4);
    const memberId = ids[1] as string;
    const first = await repos.payments.record({ periodId, memberId, date: '2026-02-10', amount: 30_000 });
    const before = await repos.payments.getAllocationsForPayment(first.payment.id);

    const late = await repos.payments.record({ periodId, memberId, date: '2026-02-01', amount: 15_000 });
    expect(late.allocations.map((a) => [a.week, a.paymentDate])).toEqual([[3, '2026-02-01']]);
    expect(await repos.payments.getAllocationsForPayment(first.payment.id)).toEqual(before);
    expect((await repos.payments.listAllocations(periodId, memberId)).map((a) => a.week)).toEqual([1, 2, 3]);
  });

  it('refuses to update or delete a stored allocation', async () => {
    const { db, repos, periodId, ids } = await setup(4);
    await repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-04', amount: 15_000 });
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
    await repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-04', amount: 15_000 });
    const { entries } = await repos.ledger.settleHost(periodId, 1, '2026-01-04');
    expect(entries.map((e) => e.type)).toEqual(['host_payout']);
  });

  it('does not offset the same debt twice and settles a week only once', async () => {
    const { repos, periodId, ids } = await setup(4);
    await repos.ledger.settleHost(periodId, 1, '2026-01-04');
    await expect(repos.ledger.settleHost(periodId, 1, '2026-01-04')).rejects.toThrow(/already has a host payout/);

    // A later payment of the host skips the offset week and starts at week 2.
    const { allocations } = await repos.payments.record({ periodId, memberId: ids[0] as string, date: '2026-01-11', amount: 15_000 });
    expect(allocations.map((a) => a.week)).toEqual([2]);
  });

  it('rolls the whole settlement back if a later step fails', async () => {
    const { db, repos, periodId } = await setup(4);
    await db.exec('DROP TABLE offset_credits');
    await expect(repos.ledger.settleHost(periodId, 1, '2026-01-04')).rejects.toThrow();
    expect(await count(db, 'ledger_entries')).toBe(0);
  });
});
