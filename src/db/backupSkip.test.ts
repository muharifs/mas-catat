// Backup and restore with skipped meetings (decision 33, migration 0006): old backups still restore, new records
// are part of the "same / older / newer" comparison, and the new health checks catch a damaged file.
import { BackupError, safetyFileName, type BackupErrorCode } from '@/domain/backup';
import { commitRestore, discardRestore, healthCheck, LATEST_VERSION, loadRecordIds, prepareRestore, summarizeDb } from './backup';
import type { Db } from './db';
import { createRepositories, type Repositories } from './index';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createSqlJsEnv, FakeSafetyStore, type SqlJsEnv } from './testing/sqlJsBridge';
import { V5_FIXTURE_SQL } from './testing/v5Fixture';

const NOW = () => new Date(2026, 10, 6, 10, 0, 0);

async function refusalCode(promise: Promise<unknown>): Promise<BackupErrorCode | 'none'> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof BackupError) return e.code;
    throw e;
  }
  return 'none';
}

/** The bytes of a database at schema version 5 holding the shared fixture (data from before the skip feature). */
async function v5Bytes(): Promise<Uint8Array> {
  const env = await createSqlJsEnv({ migrated: false });
  await migrate(env.db, MIGRATIONS.slice(0, 5));
  await env.db.exec(V5_FIXTURE_SQL);
  return env.liveBytes();
}

interface Scenario {
  env: SqlJsEnv;
  repos: Repositories;
  periodId: string;
  ids: string[];
}

/** A phone with a 3-member period at its last meeting (meetings 1-2 closed and paid). `prefix` keeps ids unique. */
async function atLastMeeting(prefix: string): Promise<Scenario> {
  const env = await createSqlJsEnv();
  let n = 0;
  const repos = createRepositories(env.db, { newId: () => `${prefix}${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1) ids.push((await repos.members.create(`Anggota ${prefix}${i + 1}`)).id);
  const period = await repos.periods.create({ name: 'Periode', startDate: '2026-01-06', memberIds: ids });
  await repos.payments.record({ periodId: period.id, memberId: ids[0] as string, date: '2026-01-06', amount: 45_000, account: 'tunai' });
  await repos.weeks.assignHost(period.id, 1, ids[0] as string, '2026-01-06');
  await repos.weeks.assignHost(period.id, 2, ids[1] as string, '2026-01-13');
  for (const k of [1, 2]) {
    await repos.weeks.closeOldest(period.id);
    await repos.ledger.settleHost(period.id, k, '2026-02-01', 'tunai');
  }
  return { env, repos, periodId: period.id, ids };
}

describe('restoring a backup from before migration 0006', () => {
  it('a full version 5 backup is migrated as a copy and restored: userVersion 6, healthy, data intact', async () => {
    const live = await atLastMeeting('l');
    const bytes = await v5Bytes();
    const prepared = await prepareRestore(live.env.bridge, live.env.db, { kind: 'file', bytes });
    expect(prepared.originalVersion).toBe(5);
    expect(prepared.candidate.userVersion).toBe(LATEST_VERSION);
    expect(prepared.candidate.userVersion).toBe(6);
    expect(prepared.candidate.ledgerCount).toBe(5);
    expect(prepared.candidate.paymentCount).toBe(2);

    const store = new FakeSafetyStore();
    const outcome = await commitRestore(live.env.bridge, live.env.db, prepared, store, NOW);
    expect(outcome.outcome).toBe('restored');
    expect(outcome.safetyName).toBe(safetyFileName(NOW(), LATEST_VERSION));

    expect((await live.env.db.getFirst<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(6);
    expect(await healthCheck(live.env.db)).toEqual({ ok: true, problems: [] });
    expect(await live.env.db.getFirst('SELECT COUNT(*) AS n FROM week_skips')).toEqual({ n: 0 });
    const summary = await summarizeDb(live.env.db);
    expect(summary).toMatchObject({ userVersion: 6, ledgerCount: 5, paymentCount: 2, memberCount: 3, periodCount: 2 });
    expect(live.env.openMemoryCount()).toBe(0);

    // the restored data works with the new code: the repositories read the (empty) skip view without trouble
    const repos = createRepositories(live.env.db);
    const preview = await repos.weeks.previewSkip('p2');
    expect(preview.eligible).toBe(false);
    expect(preview.blocker?.code).toBe('earlier_open');
    expect((await repos.payments.getWeekStatuses('p2', 'm2')).map((s) => s.skipped)).toEqual([undefined, undefined, undefined]);
    expect(await repos.credits.getAvailable('p1', 'm1')).toBe(0); // 60.000 - 45.000 - 15.000 carried over
  });

  it('a version 5 backup looks "same" only when nothing differs: the skip records count in the comparison', async () => {
    const a = await atLastMeeting('a');
    const before = a.env.liveBytes(); // the backup taken BEFORE the skip
    await a.repos.weeks.skipLast(a.periodId, 'host cannot receive guests');

    const ids = await loadRecordIds(a.env.db);
    expect([...ids].filter((id) => id.startsWith('S:'))).toHaveLength(1);

    // restoring the older file onto the live phone loses the skip: classified "older", not "same"
    const prepared = await prepareRestore(a.env.bridge, a.env.db, { kind: 'file', bytes: before });
    expect(prepared.classification).toEqual({ kind: 'older', lost: 1, added: 0 });
    await discardRestore(prepared);
  });
});

describe('restoring a version 6 backup with skips', () => {
  it('round trip: the skip and its undo survive a backup, restore into an empty phone and a new skip', async () => {
    const a = await atLastMeeting('a');
    await a.repos.weeks.skipLast(a.periodId, 'first');
    await a.repos.weeks.undoSkip(a.periodId, 'changed my mind');
    await a.repos.weeks.skipLast(a.periodId, 'second');

    const empty = await createSqlJsEnv();
    const prepared = await prepareRestore(empty.bridge, empty.db, { kind: 'file', bytes: a.env.liveBytes() });
    expect(prepared.originalVersion).toBe(6);
    const outcome = await commitRestore(empty.bridge, empty.db, prepared, new FakeSafetyStore(), NOW);
    expect(outcome.outcome).toBe('restored');

    expect(await healthCheck(empty.db)).toEqual({ ok: true, problems: [] });
    expect([...(await loadRecordIds(empty.db))].sort()).toEqual([...(await loadRecordIds(a.env.db))].sort());
    const restored = createRepositories(empty.db);
    const history = await restored.weeks.listSkipHistory(a.periodId);
    expect(history.map((h) => [h.reason, h.undoReason])).toEqual([
      ['first', 'changed my mind'],
      ['second', null],
    ]);
    expect((await restored.weeks.get(a.periodId, 3))?.skipped).toBe(true);
    // the guard triggers came along: the append-only rule still holds on the restored phone
    await expect(empty.db.run('DELETE FROM week_skips')).rejects.toThrow(/append-only/);
    await restored.weeks.undoSkip(a.periodId, 'again');
  });

  it('classification: a backup from before the skip, before the undo, and after both are older/newer, never same', async () => {
    const a = await atLastMeeting('a');
    const preSkip = a.env.liveBytes();
    await a.repos.weeks.skipLast(a.periodId, 'x');
    const skipped = a.env.liveBytes();
    await a.repos.weeks.undoSkip(a.periodId, 'y');

    const kind = async (bytes: Uint8Array, target: SqlJsEnv) => {
      const p = await prepareRestore(target.bridge, target.db, { kind: 'file', bytes });
      const c = p.classification;
      await discardRestore(p);
      return c;
    };
    // live now holds the skip and its undo
    expect(await kind(preSkip, a.env)).toEqual({ kind: 'older', lost: 2, added: 0 });
    expect(await kind(skipped, a.env)).toEqual({ kind: 'older', lost: 1, added: 0 });

    // the other way round: a phone at the pre-skip state is offered the later file
    const phone = await createSqlJsEnv({ initialBytes: preSkip, migrated: false });
    expect(await kind(skipped, phone)).toEqual({ kind: 'newer', lost: 0, added: 1 });
  });
});

describe('health check: the skip invariants', () => {
  /** A healthy phone at its last meeting; `plant` damages it with plain SQL, then the health check names the problems. */
  async function problems(plant: (db: Db, s: Scenario) => Promise<void>): Promise<string[]> {
    const s = await atLastMeeting('h');
    await plant(s.env.db, s);
    return (await healthCheck(s.env.db)).problems.map((p) => `${p.code}:${p.detail.split(':')[0]}`);
  }

  it('is healthy with a skip in force, with an undone skip, and after the period closed', async () => {
    const s = await atLastMeeting('h');
    await s.repos.weeks.skipLast(s.periodId, 'x');
    expect((await healthCheck(s.env.db)).ok).toBe(true);
    await s.repos.weeks.undoSkip(s.periodId, 'y');
    expect((await healthCheck(s.env.db)).ok).toBe(true);
    await s.repos.weeks.skipLast(s.periodId, 'z');
    await s.repos.periods.close(s.periodId, '2026-12-30');
    expect(await healthCheck(s.env.db)).toEqual({ ok: true, problems: [] });
  });

  // The guard triggers refuse most of these rows on a live database. A damaged FILE is not protected by them, so the
  // plant drops the trigger first (health check runs on the data only; a dropped trigger is caught by the schema check).
  const dropAndInsert = (trigger: string, sql: string) => async (db: Db) => {
    await db.exec(`DROP TRIGGER ${trigger}`);
    await db.exec(sql);
  };
  const T = "'2026-12-31T12:00:00.000Z'";

  it('flags two skips in force for one meeting', async () => {
    const found = await problems(async (db, s) => {
      await db.exec(`INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('s1', '${s.periodId}', 3, 'x', ${T})`);
      await dropAndInsert('week_skips_one_in_force', `INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('s2', '${s.periodId}', 3, 'y', ${T})`)(db);
    });
    expect(found).toEqual(['invariant:two_skips_in_force_for_one_week']);
  });

  /** Ends the real period and adds an active period 'q' whose meetings are: 1 closed, 2 open, 3 open. */
  async function addPeriodQ(db: Db, s: Scenario): Promise<void> {
    await db.exec(`UPDATE weeks SET status = 'closed', closed_at = 'x' WHERE period_id = '${s.periodId}' AND status = 'open'`);
    await db.exec(`UPDATE periods SET status = 'closed', end_date = '2026-12-30' WHERE id = '${s.periodId}'`);
    await db.exec("INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('q', 'Q', 3, 'active', '2027-01-05', 'x')");
    for (const [i, m] of s.ids.entries()) await db.exec(`INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('q', '${m}', ${i + 1})`);
    await db.exec("INSERT INTO weeks (period_id, number, date, status) VALUES ('q', 1, '2027-01-05', 'closed'), ('q', 2, '2027-01-12', 'open'), ('q', 3, '2027-01-19', 'open')");
  }

  it('flags a skip of a meeting that is not the last', async () => {
    const found = await problems(async (db, s) => {
      await addPeriodQ(db, s);
      await dropAndInsert('week_skips_last_only', "INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('sq', 'q', 2, 'x', 'x')")(db);
    });
    expect(found).toEqual(['invariant:skip_not_last_meeting']);
  });

  it('flags a skip while an earlier meeting is still open', async () => {
    const found = await problems(async (db, s) => {
      await addPeriodQ(db, s); // meeting 2 of q is open, so a skip of meeting 3 has an open meeting before it
      await dropAndInsert('week_skips_earlier_closed', "INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('sq', 'q', 3, 'x', 'x')")(db);
    });
    expect(found).toEqual(['invariant:skip_with_open_earlier_meeting']);
  });

  it('flags a skip with a host payout in force (also a host offset), not one that was corrected', async () => {
    const found = await problems(async (db, s) => {
      await db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
                     VALUES ('bad', '${s.periodId}', '2026-02-02', 30000, 'out', 'host_payout', '${s.ids[2]}', 3, '', ${T})`);
      await dropAndInsert('week_skips_no_standing_payout', `INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('s1', '${s.periodId}', 3, 'x', ${T})`)(db);
    });
    expect(found).toEqual(['invariant:skip_with_host_payout_in_force']);

    const corrected = await problems(async (db, s) => {
      await db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
                     VALUES ('bad', '${s.periodId}', '2026-02-02', 30000, 'out', 'host_payout', '${s.ids[2]}', 3, '', ${T})`);
      await db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, reverses_entry_id, correction_reason)
                     VALUES ('fix', '${s.periodId}', '2026-02-03', 30000, 'in', 'reversal', '${s.ids[2]}', 3, '', ${T}, 'bad', 'wrong')`);
      await db.exec(`INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('s1', '${s.periodId}', 3, 'x', ${T})`);
    });
    expect(corrected).toEqual([]);
  });

  it('flags a skipped meeting that is closed while its period is still active', async () => {
    const found = await problems(async (db, s) => {
      await db.exec(`INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('s1', '${s.periodId}', 3, 'x', ${T})`);
      await dropAndInsert('weeks_skipped_close_with_period', `UPDATE weeks SET status = 'closed', closed_at = 'x' WHERE period_id = '${s.periodId}' AND number = 3`)(db);
    });
    expect(found).toEqual(['invariant:skipped_week_closed_in_active_period']);
  });

  it('flags negative member credit (a skip undone after its released credit was refunded, by hand)', async () => {
    const found = await problems(async (db, s) => {
      // the host offset of meeting 3 does not exist here; plant a refund of credit the member does not hold
      await db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account)
                     VALUES ('rf', '${s.periodId}', '2026-02-02', 15000, 'out', 'credit_refund', '${s.ids[1]}', NULL, '', ${T}, 'tunai')`);
    });
    expect(found).toEqual(['invariant:member_credit_negative']);
  });

  it('a file with negative credit is refused by prepareRestore as an invariant problem', async () => {
    const a = await atLastMeeting('a');
    await a.env.db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account)
                         VALUES ('rf', '${a.periodId}', '2026-02-02', 15000, 'out', 'credit_refund', '${a.ids[1]}', NULL, '', ${T}, 'tunai')`);
    const live = await atLastMeeting('l');
    expect(await refusalCode(prepareRestore(live.env.bridge, live.env.db, { kind: 'file', bytes: a.env.liveBytes() }))).toBe('invariant');
  });

  it('a file whose skip tables were dropped is refused as a schema mismatch (the guards are part of the fingerprint)', async () => {
    const a = await atLastMeeting('a');
    await a.env.db.exec('DROP TRIGGER week_skips_last_only');
    const live = await atLastMeeting('l');
    expect(await refusalCode(prepareRestore(live.env.bridge, live.env.db, { kind: 'file', bytes: a.env.liveBytes() }))).toBe('schema_mismatch');
  });
});
