// Cek kas (decision 34, migration 0007): upgrade of existing data, guard triggers, repository, backup and restore.
// Runs on sql.js (real SQLite); a phone check covers expo-sqlite itself (docs/qa/cek-hp-11.md).
import { CashCountError } from '@/domain/cash-count';
import { commitRestore, discardRestore, healthCheck, LATEST_VERSION, loadRecordIds, prepareRestore, summarizeDb } from './backup';
import type { Db } from './db';
import { createRepositories, type Repositories } from './index';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createSqlJsEnv, FakeSafetyStore, type SqlJsEnv } from './testing/sqlJsBridge';
import { createMigratedTestDb, createSqlJsDb } from './testing/sqlJsDriver';
import { T, V5_FIXTURE_SQL } from './testing/v5Fixture';

const NOW = () => new Date(2026, 10, 6, 10, 0, 0);

async function dumpData(db: Db): Promise<Record<string, string[]>> {
  const tables = await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const dump: Record<string, string[]> = {};
  for (const t of tables) {
    dump[t.name] = (await db.getAll<Record<string, unknown>>(`SELECT * FROM "${t.name}" ORDER BY rowid`)).map((r) => JSON.stringify(r));
  }
  return dump;
}

describe('migration 0007 (cash counts): upgrade of existing data', () => {
  it('upgrades version 6 with data: every row is untouched, cash_counts is empty, nothing back-filled', async () => {
    const db = await createSqlJsDb();
    await migrate(db, MIGRATIONS.slice(0, 5));
    await db.exec(V5_FIXTURE_SQL);
    await migrate(db, MIGRATIONS.slice(0, 6));
    const before = await dumpData(db);
    expect(await migrate(db)).toEqual({ from: 6, to: 7 });
    const after = await dumpData(db);
    for (const table of Object.keys(before)) expect(after[table]).toEqual(before[table]);
    expect(after.cash_counts).toEqual([]);
    expect(await db.getAll('SELECT * FROM latest_cash_counts')).toEqual([]);
    expect(await db.getAll('PRAGMA foreign_key_check')).toEqual([]);
  });
});

describe('migration 0007: the guard triggers and constraints', () => {
  async function fixture(): Promise<Db> {
    const db = await createMigratedTestDb();
    await db.exec(`
      INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', ${T}), ('m2', 'Budi', ${T});
      INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES
        ('p1', 'Aktif', 2, 'active', '2026-01-06', ${T}), ('p0', 'Selesai', 2, 'closed', '2025-01-06', ${T});
      INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1), ('p1', 'm2', 2), ('p0', 'm1', 1), ('p0', 'm2', 2);
      INSERT INTO weeks (period_id, number, date, host_member_id, status, closed_at) VALUES
        ('p1', 1, '2026-01-06', 'm1', 'closed', ${T}), ('p1', 2, '2026-01-13', 'm2', 'open', NULL),
        ('p0', 1, '2025-01-06', 'm1', 'closed', ${T}), ('p0', 2, '2025-01-13', 'm2', 'closed', ${T});
    `);
    return db;
  }
  const count = (id = 'c1', period = 'p1', week = 2, account = 'tunai', expected = 100, counted = 90, difference = -10) =>
    `INSERT INTO cash_counts (id, batch_id, period_id, week, account, count_date, expected, counted, difference, created_at)
     VALUES ('${id}', 'b', '${period}', ${week}, '${account}', '2026-01-13', ${expected}, ${counted}, ${difference}, ${T})`;

  it('accepts a count; the view shows only the latest per meeting and pos, the table keeps all', async () => {
    const db = await fixture();
    await db.exec(count('c1'));
    await db.exec(count('c2', 'p1', 2, 'tunai', 100, 100, 0));
    await db.exec(count('c3', 'p1', 2, 'debit', 50, 50, 0));
    expect((await db.getAll<{ id: string }>('SELECT id FROM latest_cash_counts ORDER BY id')).map((r) => r.id)).toEqual(['c2', 'c3']);
    expect(await db.getFirst('SELECT COUNT(*) AS n FROM cash_counts')).toEqual({ n: 3 });
  });

  it.each([
    ['cash_counts_no_update', "UPDATE cash_counts SET note = 'x' WHERE id = 'c1'", /append-only/],
    ['cash_counts_no_delete', "DELETE FROM cash_counts WHERE id = 'c1'", /append-only/],
    ['cash_counts_unique_id (INSERT OR REPLACE cannot rewrite a row)', "INSERT OR REPLACE INTO cash_counts (id, batch_id, period_id, week, account, count_date, expected, counted, difference, created_at) VALUES ('c1', 'b', 'p1', 2, 'tunai', '2026-01-13', 1, 1, 0, 'x')", /used once/],
  ])('%s', async (_name, statement, message) => {
    const db = await fixture();
    await db.exec(count('c1'));
    await expect(db.exec(statement)).rejects.toThrow(message);
    expect(await db.getFirst('SELECT counted FROM cash_counts WHERE id = ?', ['c1'])).toEqual({ counted: 90 });
  });

  it('rejects a count in a closed period', async () => {
    const db = await fixture();
    await expect(db.exec(count('c1', 'p0', 2))).rejects.toThrow(/active period/);
  });

  it('rejects a count for a skipped meeting and for a meeting that does not exist', async () => {
    const db = await fixture();
    await expect(db.exec(count('c1', 'p1', 9))).rejects.toThrow(/FOREIGN KEY/);
    await db.exec("DROP TRIGGER week_skips_earlier_closed; DROP TRIGGER week_skips_last_only;");
    await db.exec(`INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('s1', 'p1', 2, 'x', ${T})`);
    await expect(db.exec(count('c1', 'p1', 2))).rejects.toThrow(/skipped/);
  });

  it.each([
    ['negative counted', count('c1', 'p1', 2, 'tunai', 100, -5, -105)],
    ['difference that is not counted - expected', count('c1', 'p1', 2, 'tunai', 100, 90, -5)],
    ['unknown pos (piutang)', count('c1', 'p1', 2, 'piutang')],
    ['fractional counted', count('c1', 'p1', 2, 'tunai', 100, 90.5, -9.5)],
  ])('CHECK: %s', async (_name, statement) => {
    const db = await fixture();
    await expect(db.exec(statement)).rejects.toThrow(/CHECK/);
  });

  it('a count never changes the ledger', async () => {
    const db = await fixture();
    const before = await dumpData(db);
    await db.exec(count('c1'));
    const after = await dumpData(db);
    for (const t of Object.keys(before)) if (t !== 'cash_counts') expect(after[t]).toEqual(before[t]);
  });
});

interface Scenario {
  env: SqlJsEnv;
  repos: Repositories;
  periodId: string;
  ids: string[];
}

/** 3 members, all paid meeting 1; meeting 1 closed and its host paid 30.000, offset 15.000 for the host's meeting 2 dues: Tunai 30.000. */
async function scenario(prefix = 'a'): Promise<Scenario> {
  const env = await createSqlJsEnv();
  let n = 0;
  const repos = createRepositories(env.db, { newId: () => `${prefix}${(n += 1)}`, now: () => '2026-01-20T12:00:00.000Z' });
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1) ids.push((await repos.members.create(`Anggota ${prefix}${i + 1}`)).id);
  const period = await repos.periods.create({ name: 'Periode', startDate: '2026-01-06', memberIds: ids });
  for (const id of ids) await repos.payments.record({ periodId: period.id, memberId: id, date: '2026-01-06', amount: 15_000, account: 'tunai' });
  await repos.weeks.assignHost(period.id, 1, ids[0] as string, '2026-01-06');
  await repos.weeks.assignHost(period.id, 2, ids[1] as string, '2026-01-13');
  await repos.weeks.closeOldest(period.id);
  await repos.ledger.settleHost(period.id, 1, '2026-01-06', 'tunai');
  return { env, repos, periodId: period.id, ids };
}

describe('cash counts repository', () => {
  it('form: expected balances come from the ledger; countable meetings are the oldest open and the latest closed', async () => {
    const s = await scenario();
    const form = await s.repos.cashCounts.form(s.periodId);
    const kas = await s.repos.ledger.getKasBalances();
    expect(form.expected).toEqual({ tunai: kas.tunai, debit: kas.debit });
    expect(form.expected.tunai).toBe(30_000); // 45.000 collected - 30.000 payout + 15.000 offset
    expect(form.countableWeeks).toEqual([2, 1]);
    expect(form.defaultWeek).toBe(2);
    expect(form.memberCount).toBe(3);
  });

  it('save: stores difference per pos, shares a batch, never touches the ledger or the balances', async () => {
    const s = await scenario();
    const ledgerBefore = await dumpData(s.env.db);
    const kasBefore = await s.repos.ledger.getKasBalances();
    const lines = await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, date: '2026-01-13', tunai: 10_000, debit: 0, note: 'hitung malam' });
    expect(lines.map((l) => [l.account, l.expected, l.counted, l.difference])).toEqual([
      ['tunai', 30_000, 10_000, -20_000],
      ['debit', 0, 0, 0],
    ]);
    const batches = await s.env.db.getAll<{ batch_id: string }>('SELECT DISTINCT batch_id FROM cash_counts');
    expect(batches).toHaveLength(1);
    const ledgerAfter = await dumpData(s.env.db);
    for (const t of Object.keys(ledgerBefore)) if (t !== 'cash_counts') expect(ledgerAfter[t]).toEqual(ledgerBefore[t]);
    expect(await s.repos.ledger.getKasBalances()).toEqual(kasBefore);
  });

  it('Debit skipped: only a Tunai row; counted need not be a multiple of 15.000', async () => {
    const s = await scenario();
    const lines = await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 12_345, debit: null });
    expect(lines.map((l) => l.account)).toEqual(['tunai']);
    expect(lines[0]?.difference).toBe(12_345 - 30_000);
  });

  it('a correction is a new count: the latest is effective, the history keeps both', async () => {
    const s = await scenario();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 10_000, debit: null, note: 'salah hitung' });
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 30_000, debit: null });
    expect((await s.repos.cashCounts.listAll(s.periodId)).map((l) => l.counted)).toEqual([10_000, 30_000]);
    expect((await s.repos.cashCounts.listEffective(s.periodId)).map((l) => l.counted)).toEqual([30_000]);
  });

  it('expected follows the ledger at the moment of saving (a later entry does not change an old count)', async () => {
    const s = await scenario();
    const first = await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 30_000, debit: null });
    await s.repos.payments.record({ periodId: s.periodId, memberId: s.ids[1] as string, date: '2026-01-13', amount: 15_000, account: 'tunai' });
    const second = await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 45_000, debit: null });
    expect(first[0]?.expected).toBe(30_000);
    expect(second[0]?.expected).toBe(45_000);
    expect((await s.repos.cashCounts.listAll(s.periodId))[0]?.expected).toBe(30_000);
  });

  it('hasCount: false until a count exists for that meeting', async () => {
    const s = await scenario();
    expect(await s.repos.cashCounts.hasCount(s.periodId, 2)).toBe(false);
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 1, debit: null });
    expect(await s.repos.cashCounts.hasCount(s.periodId, 2)).toBe(true);
    expect(await s.repos.cashCounts.hasCount(s.periodId, 1)).toBe(false);
  });

  it('closing a meeting without a count still works (warning only, no block)', async () => {
    const s = await scenario();
    await expect(s.repos.weeks.closeOldest(s.periodId)).resolves.toBe(2);
  });

  it('a failed save writes nothing (Tunai row is rolled back when Debit is invalid)', async () => {
    const s = await scenario();
    await expect(s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 1, debit: -1 })).rejects.toThrow();
    expect(await s.repos.cashCounts.listAll(s.periodId)).toEqual([]);
  });

  it.each([
    ['a meeting that cannot take a count', 3, 'week_not_countable'],
    ['an unknown meeting', 9, 'week_not_countable'],
  ])('rejects %s', async (_name, week, code) => {
    const s = await scenario();
    await expect(s.repos.cashCounts.save({ periodId: s.periodId, week, tunai: 1, debit: null })).rejects.toMatchObject({ code });
    await expect(s.repos.cashCounts.save({ periodId: s.periodId, week, tunai: 1, debit: null })).rejects.toBeInstanceOf(CashCountError);
  });

  it('rejects non-integer and negative amounts', async () => {
    const s = await scenario();
    for (const bad of [-1, 0.5]) {
      await expect(s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: bad, debit: null })).rejects.toThrow();
    }
    expect(await s.repos.cashCounts.listAll(s.periodId)).toEqual([]);
  });

  it('an ended period takes no count and offers no meeting', async () => {
    const s = await scenario();
    await s.repos.weeks.closeOldest(s.periodId);
    await s.repos.weeks.assignHost(s.periodId, 3, s.ids[2] as string, '2026-01-20').catch(() => undefined);
    await s.env.db.exec("UPDATE periods SET status = 'closed'");
    expect((await s.repos.cashCounts.form(s.periodId)).countableWeeks).toEqual([]);
    await expect(s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 1, debit: null })).rejects.toMatchObject({ code: 'no_active_period' });
  });
});

describe('backup and restore with cash counts', () => {
  it('a backup without the count is "older" than live with it; ids carry the C: prefix', async () => {
    const s = await scenario();
    const before = s.env.liveBytes();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 15_000, debit: 0 });
    expect([...(await loadRecordIds(s.env.db))].filter((id) => id.startsWith('C:'))).toHaveLength(2);
    const prepared = await prepareRestore(s.env.bridge, s.env.db, { kind: 'file', bytes: before });
    // two rows (Tunai + Debit) of ONE count: one hitungan, never 2 "catatan"
    expect(prepared.classification).toEqual({ kind: 'older', lost: 0, added: 0, cashCountsLost: 1, cashCountsAdded: 0 });
    expect(prepared.live.cashCountBatches).toBe(1);
    expect(prepared.live.tableCounts.cash_counts).toBe(2);
    expect(prepared.candidate.cashCountBatches).toBe(0);
    await discardRestore(prepared);
  });

  it('the reverse: a backup with a count restored onto a phone without it is "newer", counted per batch', async () => {
    const s = await scenario();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 15_000, debit: 0 });
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 16_000, debit: null });
    const live = await createSqlJsEnv();
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: s.env.liveBytes() });
    expect(prepared.classification.cashCountsAdded).toBe(2);
    expect(prepared.classification.cashCountsLost).toBe(0);
    expect(prepared.candidate.cashCountBatches).toBe(2);
    expect(prepared.candidate.tableCounts.cash_counts).toBe(3);
    await discardRestore(prepared);
  });

  it('round trip: counts survive backup and restore into an empty phone, healthy, append-only still enforced', async () => {
    const s = await scenario();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 10_000, debit: 0, note: 'x' });
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 15_000, debit: null });
    const empty = await createSqlJsEnv();
    const prepared = await prepareRestore(empty.bridge, empty.db, { kind: 'file', bytes: s.env.liveBytes() });
    expect(prepared.candidate.tableCounts.cash_counts).toBe(3);
    expect((await commitRestore(empty.bridge, empty.db, prepared, new FakeSafetyStore(), NOW)).outcome).toBe('restored');
    expect(await healthCheck(empty.db)).toEqual({ ok: true, problems: [] });
    expect(await dumpData(empty.db)).toEqual(await dumpData(s.env.db));
    expect((await createRepositories(empty.db).cashCounts.listEffective(s.periodId)).map((l) => [l.account, l.counted])).toEqual([
      ['tunai', 15_000],
      ['debit', 0],
    ]);
    await expect(empty.db.run('DELETE FROM cash_counts')).rejects.toThrow(/append-only/);
  });

  it('a version 6 backup (made before the migration) restores, is migrated as a copy, and has an empty cash_counts', async () => {
    const old = await createSqlJsEnv({ migrated: false });
    await migrate(old.db, MIGRATIONS.slice(0, 5));
    await old.db.exec(V5_FIXTURE_SQL);
    await migrate(old.db, MIGRATIONS.slice(0, 6));
    const bytes = old.liveBytes();

    const live = await scenario('l');
    await live.repos.cashCounts.save({ periodId: live.periodId, week: 2, tunai: 1, debit: null });
    const prepared = await prepareRestore(live.env.bridge, live.env.db, { kind: 'file', bytes });
    expect(prepared.originalVersion).toBe(6);
    expect(prepared.candidate.userVersion).toBe(LATEST_VERSION);
    expect(prepared.candidate.tableCounts.cash_counts).toBe(0);
    expect((await commitRestore(live.env.bridge, live.env.db, prepared, new FakeSafetyStore(), NOW)).outcome).toBe('restored');
    expect(await healthCheck(live.env.db)).toEqual({ ok: true, problems: [] });
    expect((await summarizeDb(live.env.db)).tableCounts.cash_counts).toBe(0);
    expect(live.env.openMemoryCount()).toBe(0);
  });

  it('health check catches a damaged count row (difference that does not add up)', async () => {
    const s = await scenario();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 2, tunai: 10_000, debit: null });
    // Simulate a tampered file: drop the CHECK-protecting guard by rebuilding the row without constraints is not
    // possible in SQLite, so write the bad row into a copy of the table definition without the CHECK on difference.
    await s.env.db.exec(`
      DROP TRIGGER cash_counts_no_update;
      PRAGMA ignore_check_constraints = ON;
      UPDATE cash_counts SET difference = 1;
      PRAGMA ignore_check_constraints = OFF;
    `);
    const report = await healthCheck(s.env.db);
    expect(report.ok).toBe(false);
    expect(report.problems.map((p) => p.detail).join(' ')).toMatch(/cash_count_inconsistent/);
  });
});
