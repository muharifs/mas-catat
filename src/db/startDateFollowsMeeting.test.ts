// Meeting 1 date and periods.start_date: the start date follows meeting 1 only while no meeting is closed (F4a).
import { createRepositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

async function setup() {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => '2026-03-10T12:00:00.000Z' });
  const ids: string[] = [];
  for (const name of ['Ani', 'Budi', 'Citra']) ids.push((await repos.members.create(name)).id);
  const p = await repos.periods.create({ name: 'P', startDate: '2026-02-03', memberIds: ids });
  return { repos, p, ids };
}

describe('start date follows the date of meeting 1', () => {
  it('moves start_date while all meetings are open, in reports and the list too', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-10');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-10');
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-04'); // date-only change, same host
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-04');
    expect((await repos.periods.list())[0]?.startDate).toBe('2026-02-04');
    expect((await repos.reports.getPeriodReport(p.id)).period.startDate).toBe('2026-02-04');
    expect((await repos.weeks.get(p.id, 1))?.date).toBe('2026-02-04');
  });

  it('leaves start_date alone when a meeting is closed (the date still changes for meeting 2)', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-03');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-10');
    await repos.weeks.closeOldest(p.id);
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-11');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-03');
    expect((await repos.weeks.get(p.id, 2))?.date).toBe('2026-02-11');
  });

  it('never touches start_date when meeting 2 changes', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-03');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-12');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-03');
  });

  it('keeps the date change of meeting 1 allowed after the host payout and moves start_date', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-03');
    await repos.ledger.settleHost(p.id, 1, '2026-03-10', 'tunai');
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-05');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-05');
  });

  it('is consistent with the close rule: an end date before the new start date is rejected', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-17');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-24');
    await expect(repos.periods.close(p.id, '2026-02-10')).rejects.toThrow();
  });

  it('rolls start_date back with the rest when the write fails', async () => {
    const { repos, p, ids } = await setup();
    await expect(repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-30')).rejects.toThrow();
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-03');
  });
});
