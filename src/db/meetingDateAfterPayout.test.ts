// Owner decision 2026-11-10: changing only the date (same host) of an open meeting stays allowed after the host payout.
// The date does not affect money: payout and offset entries must stay byte for byte the same.
import { HostPayoutStandsError } from '@/domain/schedule';
import { createRepositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-03-10';

async function setup() {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ids: string[] = [];
  for (const name of ['Ani', 'Budi', 'Citra']) ids.push((await repos.members.create(name)).id);
  const p = await repos.periods.create({ name: 'P', startDate: '2026-02-03', memberIds: ids });
  await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-03');
  await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-10');
  return { repos, p, ids };
}

describe('meeting date change after the host payout', () => {
  it('changes the date with the same host and leaves the payout entries untouched', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    const before = await repos.ledger.listByPeriod(p.id);

    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-04');

    const week = await repos.weeks.get(p.id, 1);
    expect(week?.date).toBe('2026-02-04');
    expect(week?.hostMemberId).toBe(ids[0]);
    expect(await repos.weeks.standingPayoutWeeks(p.id)).toEqual([1]);
    expect(await repos.ledger.listByPeriod(p.id)).toEqual(before);
    expect((await repos.weeks.get(p.id, 2))?.date).toBe('2026-02-10'); // stored dates of other meetings are not rewritten
  });

  it('keeps the payout and offset of a host with debt unchanged', async () => {
    const { repos, p, ids } = await setup();
    // Ani pays nothing, so the payout of meeting 1 carries an offset entry.
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    const before = await repos.ledger.listByWeek(p.id, 1);
    expect(before.length).toBeGreaterThanOrEqual(2);

    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-05');

    expect(await repos.ledger.listByWeek(p.id, 1)).toEqual(before);
  });

  it('rejects a date that reaches the next meeting, and a date not after the previous one', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await expect(repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-10')).rejects.toThrow();
    await repos.weeks.closeOldest(p.id);
    await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai');
    await expect(repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-03')).rejects.toThrow();
    expect((await repos.weeks.get(p.id, 1))?.date).toBe('2026-02-03');
    expect((await repos.weeks.get(p.id, 2))?.date).toBe('2026-02-10');
  });

  it('still refuses a different host while the payout stands', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await expect(repos.weeks.assignHost(p.id, 1, ids[2] as string, '2026-02-04')).rejects.toBeInstanceOf(HostPayoutStandsError);
    expect((await repos.weeks.get(p.id, 1))?.date).toBe('2026-02-03');
    expect((await repos.weeks.get(p.id, 1))?.hostMemberId).toBe(ids[0]);
  });
});
