// QA run for F4 (start date follows meeting 1 date; far-start warning), 2026-11-12. Independent of the developer tests.
// Runs on sql.js, not on the phone. Dates are worked out by hand.
import { isStartDateFarAway } from '@/domain/schedule';
import { createRepositories } from './index';
import { createSqlJsEnv } from './testing/sqlJsBridge';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-03-10';

async function setup(startDate = '2026-02-03', names = ['Ani', 'Budi', 'Citra']) {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ids: string[] = [];
  for (const name of names) ids.push((await repos.members.create(name)).id);
  const p = await repos.periods.create({ name: 'P', startDate, memberIds: ids });
  return { db, repos, p, ids };
}

describe('F4b boundary: more than 14 days after today', () => {
  it.each([
    ['2026-11-26', '2026-11-12', false], // 14
    ['2026-11-27', '2026-11-12', true], // 15
    ['2027-01-14', '2026-12-31', false], // 14 across the year end
    ['2027-01-15', '2026-12-31', true], // 15 across the year end
    ['2028-03-14', '2028-02-29', false], // 14 after a leap day
    ['2028-03-15', '2028-02-29', true], // 15 after a leap day
    ['2027-03-14', '2027-02-28', false], // 28 Feb + 14 = 14 Mar (non-leap year)
    ['2027-03-15', '2027-02-28', true], // 15
    ['2026-03-10', '2026-03-10', false],
    ['2025-01-01', '2026-03-10', false],
  ])('isStartDateFarAway(%s, today %s) = %s', (start, today, expected) => {
    expect(isStartDateFarAway(start, today)).toBe(expected);
  });
});

describe('F4a start date follows meeting 1', () => {
  it('rolls across month and year ends', async () => {
    const { repos, p, ids } = await setup('2026-12-29');
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2027-01-05');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2027-01-05');
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-12-30');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-12-30');
  });

  it('first host pick for meeting 1 with a different date moves start_date; the same date leaves it', async () => {
    const a = await setup('2026-02-03');
    await a.repos.weeks.assignHost(a.p.id, 1, a.ids[1] as string, '2026-02-03');
    expect((await a.repos.periods.getById(a.p.id))?.startDate).toBe('2026-02-03');
    const b = await setup('2026-02-03');
    await b.repos.weeks.assignHost(b.p.id, 1, b.ids[1] as string, '2026-02-06');
    expect((await b.repos.periods.getById(b.p.id))?.startDate).toBe('2026-02-06');
    expect((await b.repos.weeks.get(b.p.id, 1))?.date).toBe('2026-02-06');
  });

  it('a host exchange started from meeting 2 does not change the date of meeting 1 or start_date', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-03');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-10');
    await repos.weeks.assignHost(p.id, 2, ids[0] as string, '2026-02-11'); // exchange hosts of 1 and 2
    expect((await repos.weeks.get(p.id, 1))?.date).toBe('2026-02-03');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-03');
  });

  it('swapHosts keeps dates, so start_date stays equal to the date of meeting 1', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-05');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-12');
    await repos.weeks.swapHosts(p.id, 1, 2);
    expect((await repos.weeks.get(p.id, 1))?.date).toBe('2026-02-05');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-05');
  });

  it('after meeting 1 is closed, meeting 1 cannot change and start_date stays', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-04');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-11');
    await repos.weeks.closeOldest(p.id);
    await expect(repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-05')).rejects.toThrow();
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-12');
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-04');
    expect((await repos.weeks.get(p.id, 1))?.date).toBe('2026-02-04');
  });

  it('a rejected date does not move start_date', async () => {
    const { repos, p, ids } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-03');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-10');
    await expect(repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-10')).rejects.toThrow();
    await expect(repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-12')).rejects.toThrow();
    expect((await repos.periods.getById(p.id))?.startDate).toBe('2026-02-03');
  });

  it('close-date rules use the NEW start date (endDateProblem itself unchanged)', async () => {
    const { repos, p, ids } = await setup('2026-02-03', ['Ani', 'Budi']);
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-03-03');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-03-10');
    await repos.weeks.closeOldest(p.id);
    await repos.weeks.closeOldest(p.id);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai');
    await expect(repos.periods.close(p.id, '2026-03-02')).rejects.toThrow(); // before the new start date
    await repos.periods.close(p.id, TODAY);
    expect((await repos.periods.getById(p.id))?.endDate).toBe(TODAY);
  });

  it('period list orders by the new start date; reports and exports show it', async () => {
    const { repos, p, ids } = await setup('2026-02-03', ['Ani', 'Budi']);
    await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-03');
    await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-10');
    await repos.weeks.closeOldest(p.id);
    await repos.weeks.closeOldest(p.id);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai');
    await repos.periods.close(p.id, TODAY);
    const q = await repos.periods.create({ name: 'Q', startDate: '2026-03-17', memberIds: ids });
    await repos.weeks.assignHost(q.id, 1, ids[0] as string, '2026-03-12');
    await repos.weeks.assignHost(q.id, 1, ids[0] as string, '2026-03-16');
    const list = await repos.periods.list();
    expect(list.map((x) => x.name)).toEqual(['Q', 'P']); // newest start date first
    expect(list[0]?.startDate).toBe('2026-03-16');
    expect((await repos.reports.getPeriodReport(q.id)).period.startDate).toBe('2026-03-16');
    const rows = await repos.exports.listPeriodSummaries();
    expect(rows.map((r) => r.period.startDate)).toEqual(['2026-02-03', '2026-03-16']);
    expect(JSON.stringify(await repos.exports.listMeetingDues())).toContain('2026-03-16');
  });

  it('backup bytes carry the moved start_date', async () => {
    const live = await createSqlJsEnv();
    let n = 0;
    const repos = createRepositories(live.db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
    const a = (await repos.members.create('Ani')).id;
    const b = (await repos.members.create('Budi')).id;
    const p = await repos.periods.create({ name: 'P', startDate: '2026-02-03', memberIds: [a, b] });
    await repos.weeks.assignHost(p.id, 1, a, '2026-02-06');
    const copy = await createSqlJsEnv({ initialBytes: live.liveBytes(), migrated: true });
    const r2 = createRepositories(copy.db);
    expect((await r2.periods.getById(p.id))?.startDate).toBe('2026-02-06');
  });
});
