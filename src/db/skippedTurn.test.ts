// weeks.skippedTurn: which member lost a turn to host because the last meeting of the latest ended period was skipped.
// Runs on sql.js: it proves the SQL logic, not the expo-sqlite adapter on the phone.
import { createRepositories, type Repositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const NOW = '2026-12-31T12:00:00.000Z';

interface Fixture {
  repos: Repositories;
  periodId: string;
  ids: string[];
  names: string[];
}

async function setup(n = 3): Promise<Fixture> {
  const db = await createMigratedTestDb();
  let i = 0;
  const repos = createRepositories(db, { newId: () => `id${(i += 1)}`, now: () => NOW });
  const ids: string[] = [];
  const names: string[] = [];
  for (let k = 0; k < n; k += 1) {
    names.push(`Member ${k + 1}`);
    ids.push((await repos.members.create(names[k] as string)).id);
  }
  const period = await repos.periods.create({ name: 'Periode 1', startDate: '2026-01-06', memberIds: ids });
  return { repos, periodId: period.id, ids, names };
}

/** Closes and pays meetings 1..(N-1); the last meeting stays open (its host is the member left over). */
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

describe('weeks.skippedTurn', () => {
  it('is null when there is no ended period', async () => {
    const f = await setup(3);
    expect(await f.repos.weeks.skippedTurn()).toBeNull();
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    // the period is still active: nothing to hint about yet
    expect(await f.repos.weeks.skippedTurn()).toBeNull();
  });

  it('names the member who did not host, after the period with a skipped last meeting ended', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    expect(await f.repos.weeks.skippedTurn()).toEqual({
      memberId: f.ids[2],
      periodId: f.periodId,
      periodName: 'Periode 1',
      week: 3,
    });
  });

  it('is null when the latest ended period had no skip', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.ledger.settleHost(f.periodId, 3, '2026-02-03', 'tunai');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    expect(await f.repos.weeks.skippedTurn()).toBeNull();
  });

  it('is null again once a skip was undone before the period ended', async () => {
    const f = await setup(3);
    await reachLastMeeting(f);
    await f.repos.weeks.skipLast(f.periodId, 'x');
    await f.repos.weeks.undoSkip(f.periodId, 'x');
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.ledger.settleHost(f.periodId, 3, '2026-02-03', 'tunai');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    expect(await f.repos.weeks.skippedTurn()).toBeNull();
  });
});
