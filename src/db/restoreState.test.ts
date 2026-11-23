// M7b (F3 a + B2): the restore comparison also sees state that writes no ledger entry or payment: meeting status, host and
// date, period status, member added, renamed or archived. Runs on sql.js; every case compares a backup taken BEFORE the
// change with the live data AFTER it.
import { PHRASE_RESTORE, requiredPhrase } from '@/domain/backup';
import { discardRestore, loadRecordIds, loadStateFingerprints, prepareRestore } from './backup';
import { createRepositories, type Repositories } from './index';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createSqlJsEnv, type SqlJsEnv } from './testing/sqlJsBridge';

const TODAY = '2026-03-10';
const START = '2026-02-03'; // a Tuesday

interface World {
  env: SqlJsEnv;
  repos: Repositories;
  a: string;
  b: string;
  c: string;
  periodId: string;
}

/** Three members; Ani and Budi are in an active two-member period (Ani hosts meeting 1), Citra is outside any period. */
async function world(prefix = 'w'): Promise<World> {
  const env = await createSqlJsEnv();
  let n = 0;
  const repos = createRepositories(env.db, { newId: () => `${prefix}${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const a = (await repos.members.create('Ani')).id;
  const b = (await repos.members.create('Budi')).id;
  const c = (await repos.members.create('Citra')).id;
  const period = await repos.periods.create({ name: 'P1', startDate: START, memberIds: [a, b] });
  await repos.weeks.assignHost(period.id, 1, a, START);
  return { env, repos, a, b, c, periodId: period.id };
}

async function prepare(w: World, backup: Uint8Array) {
  return prepareRestore(w.env.bridge, w.env.db, { kind: 'file', bytes: backup });
}

async function phraseFor(w: World, backup: Uint8Array) {
  const prepared = await prepare(w, backup);
  try {
    return requiredPhrase('file', prepared.classification);
  } finally {
    await discardRestore(prepared);
  }
}

describe('restore classification sees state that writes no ledger entry or payment', () => {
  it('control: nothing changed after the backup asks no PULIHKAN and is "same" with stateChanged 0', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    const prepared = await prepare(w, backup);
    try {
      expect(prepared.classification).toEqual({ kind: 'same', lost: 0, added: 0, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 });
      expect(requiredPhrase('file', prepared.classification)).toBeNull();
    } finally {
      await discardRestore(prepared);
    }
  });

  it('a meeting closed after the backup', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    await w.repos.weeks.closeOldest(w.periodId);
    const prepared = await prepare(w, backup);
    try {
      expect(prepared.classification).toMatchObject({ kind: 'changed', lost: 0, added: 0, stateChanged: 1 });
      expect(requiredPhrase('file', prepared.classification)).toBe(PHRASE_RESTORE);
    } finally {
      await discardRestore(prepared);
    }
  });

  it('a host changed after the backup', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    await w.repos.weeks.assignHost(w.periodId, 1, w.b, START);
    expect(await phraseFor(w, backup)).toBe(PHRASE_RESTORE);
  });

  it('a meeting date changed after the backup (same host)', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    await w.repos.weeks.assignHost(w.periodId, 1, w.a, '2026-02-05');
    expect(await phraseFor(w, backup)).toBe(PHRASE_RESTORE);
  });

  it('a period ended after the backup', async () => {
    const w = await world();
    await w.repos.weeks.assignHost(w.periodId, 2, w.b, '2026-02-10');
    await w.repos.payments.record({ periodId: w.periodId, memberId: w.a, date: TODAY, amount: 30_000, account: 'tunai' });
    await w.repos.payments.record({ periodId: w.periodId, memberId: w.b, date: TODAY, amount: 30_000, account: 'tunai' });
    await w.repos.ledger.settleHost(w.periodId, 1, TODAY, 'tunai');
    await w.repos.weeks.closeOldest(w.periodId);
    await w.repos.ledger.settleHost(w.periodId, 2, TODAY, 'tunai');
    await w.repos.weeks.closeOldest(w.periodId);
    const backup = w.env.liveBytes(); // every meeting closed, period still active
    await w.repos.periods.close(w.periodId, TODAY);
    const prepared = await prepare(w, backup);
    try {
      // Only the period row changed: exactly one state key.
      expect(prepared.classification).toMatchObject({ kind: 'changed', stateChanged: 1 });
      expect(requiredPhrase('file', prepared.classification)).toBe(PHRASE_RESTORE);
    } finally {
      await discardRestore(prepared);
    }
  });

  it('a member archived after the backup', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    await w.repos.members.archive(w.c);
    expect(await phraseFor(w, backup)).toBe(PHRASE_RESTORE);
  });

  it('a member added after the backup is lost by the restore (older), and asks PULIHKAN', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    await w.repos.members.create('Dewi');
    const prepared = await prepare(w, backup);
    try {
      expect(prepared.classification).toMatchObject({ kind: 'older', lost: 1, added: 0, stateChanged: 0 });
      expect(requiredPhrase('file', prepared.classification)).toBe(PHRASE_RESTORE);
    } finally {
      await discardRestore(prepared);
    }
  });

  it('a member renamed after the backup', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    await w.repos.members.rename(w.a, 'Ani Wulandari');
    expect(await phraseFor(w, backup)).toBe(PHRASE_RESTORE);
  });

  it('control: archive and then unarchive leaves no difference', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    await w.repos.members.archive(w.c);
    await w.repos.members.unarchive(w.c);
    expect(await phraseFor(w, backup)).toBeNull();
  });

  it('control: renaming a member to the same name leaves no difference', async () => {
    const w = await world();
    const backup = w.env.liveBytes();
    await w.repos.members.rename(w.a, 'Ani');
    expect(await phraseFor(w, backup)).toBeNull();
  });

  it('combined with a saved Cek kas count: state change only, and count lost plus state change', async () => {
    const w = await world();
    await w.repos.payments.record({ periodId: w.periodId, memberId: w.a, date: TODAY, amount: 15_000, account: 'tunai' });
    await w.repos.cashCounts.save({ periodId: w.periodId, week: 1, date: TODAY, tunai: 15_000, debit: null });
    const backup = w.env.liveBytes(); // already holds the count
    await w.repos.members.rename(w.a, 'Ani Baru');
    let prepared = await prepare(w, backup);
    try {
      // The count is on both sides, so only the rename is seen.
      expect(prepared.classification).toMatchObject({ kind: 'changed', cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 1 });
    } finally {
      await discardRestore(prepared);
    }
    await w.repos.cashCounts.save({ periodId: w.periodId, week: 1, date: TODAY, tunai: 20_000, debit: null }); // a newer count after the backup
    prepared = await prepare(w, backup);
    try {
      expect(prepared.classification).toMatchObject({ kind: 'older', cashCountsLost: 1, stateChanged: 1 });
      expect(requiredPhrase('file', prepared.classification)).toBe(PHRASE_RESTORE);
    } finally {
      await discardRestore(prepared);
    }
  });

  it('moving to a new phone (live data empty) still needs no PULIHKAN', async () => {
    const source = await world('s');
    const backup = source.env.liveBytes();
    const emptyPhone = await createSqlJsEnv();
    const prepared = await prepareRestore(emptyPhone.bridge, emptyPhone.db, { kind: 'file', bytes: backup });
    try {
      expect(prepared.classification.kind).toBe('newer');
      expect(prepared.classification.stateChanged).toBe(0);
      expect(requiredPhrase('file', prepared.classification)).toBeNull();
    } finally {
      await discardRestore(prepared);
    }
  });

  it('an old backup from before migration 0007 (and 0005) is migrated first and does not throw', async () => {
    const w = await world();
    for (const version of [6, 4]) {
      const old = await createSqlJsEnv({ migrated: false });
      await migrate(old.db, MIGRATIONS.slice(0, version));
      await old.db.exec(`
        INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', 'x');
        INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('p1', 'Lama', 1, 'active', '2026-01-06', 'x');
        INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1);
        INSERT INTO weeks (period_id, number, date, host_member_id, status) VALUES ('p1', 1, '2026-01-06', 'm1', 'open');
      `);
      const prepared = await prepare(w, old.liveBytes());
      try {
        expect(prepared.originalVersion).toBe(version);
        expect(prepared.classification.stateChanged).toBe(0); // no key exists on both sides
      } finally {
        await discardRestore(prepared);
      }
    }
  });
});

describe('loadRecordIds and loadStateFingerprints', () => {
  it('record ids carry M: and T: next to the old prefixes', async () => {
    const w = await world();
    const ids = await loadRecordIds(w.env.db);
    expect(ids.has(`M:${w.a}`)).toBe(true);
    expect(ids.has(`T:${w.periodId}`)).toBe(true);
  });

  it('fingerprints hold fixed tuples without raw timestamps, archived as a flag', async () => {
    const w = await world();
    await w.repos.members.archive(w.c);
    const state = await loadStateFingerprints(w.env.db);
    expect(state.get(`W:${w.periodId}|1`)).toBe(JSON.stringify(['open', w.a, START]));
    expect(state.get(`M:${w.c}`)).toBe(JSON.stringify(['Citra', 1]));
    expect(state.get(`M:${w.a}`)).toBe(JSON.stringify(['Ani', 0]));
    const period = state.get(`T:${w.periodId}`) ?? '';
    expect(JSON.parse(period)).toEqual(['active', START, null, 'P1']);
    for (const value of state.values()) expect(value).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/); // no ISO timestamps
  });
});
