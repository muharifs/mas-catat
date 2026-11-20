// Migration 0006 (skip the last meeting) on existing data: starts from a real version 5 database holding an active
// and a closed period, payments, a payout with offset, credit and a carry-over, and upgrades it. Runs on sql.js.
// Also exercises every guard trigger of the migration directly, so each one is proven to fire (and to stay quiet).
import { SCHEMA_FINGERPRINT_SQL, diffSchema, type SchemaObject } from '@/domain/backup';
import type { Db } from './db';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { sql as sql0006 } from './migrations/0006_week_skip';
import { createMigratedTestDb, createSqlJsDb } from './testing/sqlJsDriver';
import { T, V5_FIXTURE_SQL } from './testing/v5Fixture';

const userVersion = async (db: Db): Promise<number> =>
  (await db.getFirst<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? -1;
const schemaOf = (db: Db) => db.getAll<SchemaObject>(SCHEMA_FINGERPRINT_SQL);

/** Every row of every table (as JSON, ordered by rowid), for a "nothing changed" comparison. */
async function dumpData(db: Db): Promise<Record<string, string[]>> {
  const tables = await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const dump: Record<string, string[]> = {};
  for (const t of tables) {
    dump[t.name] = (await db.getAll<Record<string, unknown>>(`SELECT * FROM "${t.name}" ORDER BY rowid`)).map((r) => JSON.stringify(r));
  }
  return dump;
}

async function v5WithData(): Promise<Db> {
  const db = await createSqlJsDb();
  await migrate(db, MIGRATIONS.slice(0, 5));
  await db.exec(V5_FIXTURE_SQL);
  return db;
}

describe('migration 0006 (week skip): upgrade of existing data', () => {
  it('upgrades version 5 with data: every row is untouched, three objects are new, nothing is back-filled', async () => {
    const db = await v5WithData();
    expect(await userVersion(db)).toBe(5);
    const before = await dumpData(db);
    const beforeSchema = await schemaOf(db);

    expect(await migrate(db, MIGRATIONS.slice(0, 6))).toEqual({ from: 5, to: 6 });
    expect(await userVersion(db)).toBe(6);

    const after = await dumpData(db);
    for (const table of Object.keys(before)) expect(after[table]).toEqual(before[table]);
    expect(after.week_skips).toEqual([]);
    expect(after.week_skip_undos).toEqual([]);
    expect(await db.getAll('SELECT * FROM skipped_weeks')).toEqual([]);
    expect(await db.getAll('PRAGMA foreign_key_check')).toEqual([]);

    // existing tables keep their definition: the migration only ADDS objects
    const afterSchema = await schemaOf(db);
    const added = afterSchema.filter((o) => !beforeSchema.some((b) => b.name === o.name)).map((o) => `${o.type} ${o.name}`);
    expect(added.filter((a) => a.startsWith('table') || a.startsWith('view') || a.startsWith('index')).sort()).toEqual([
      'index ix_week_skips_week',
      'table week_skip_undos',
      'table week_skips',
      'view skipped_weeks',
    ]);
    expect(added.filter((a) => a.startsWith('trigger'))).toHaveLength(18);
    for (const b of beforeSchema) expect(afterSchema.find((o) => o.name === b.name)).toEqual(b);
  });

  it('a fresh version 6 schema equals a version 5 database migrated to 6 (no fingerprint drift)', async () => {
    const fresh = await createSqlJsDb();
    await migrate(fresh, MIGRATIONS.slice(0, 6));
    const upgraded = await v5WithData();
    await migrate(upgraded, MIGRATIONS.slice(0, 6));
    expect(diffSchema(await schemaOf(fresh), await schemaOf(upgraded))).toEqual([]);
    expect(await schemaOf(upgraded)).toEqual(await schemaOf(fresh));
  });

  it('is idempotent: running again changes nothing', async () => {
    const db = await v5WithData();
    await migrate(db, MIGRATIONS.slice(0, 6));
    const data = await dumpData(db);
    const schema = await schemaOf(db);
    expect(await migrate(db, MIGRATIONS.slice(0, 6))).toEqual({ from: 6, to: 6 });
    expect(await dumpData(db)).toEqual(data);
    expect(await schemaOf(db)).toEqual(schema);
  });

  it('rolls back completely when the migration fails halfway: still version 5, no new object', async () => {
    const db = await v5WithData();
    const data = await dumpData(db);
    const schema = await schemaOf(db);
    const broken = [...MIGRATIONS.slice(0, 5), { version: 6, name: 'week_skip', sql: `${sql0006}\nCREATE TABLE week_skips (x);` }];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await userVersion(db)).toBe(5);
    expect(await schemaOf(db)).toEqual(schema);
    expect(await dumpData(db)).toEqual(data);
    // and the real migration still works afterwards
    expect(await migrate(db, MIGRATIONS.slice(0, 6))).toEqual({ from: 5, to: 6 });
  });

  it('the app database still refuses a newer version', async () => {
    const db = await v5WithData();
    await migrate(db);
    await db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer/);
  });
});

describe('migration 0006: the guard triggers', () => {
  /** Version 6 with period p1 (3 members, active): meetings 1-2 closed, 3 open. Everything by plain SQL. */
  async function fixture(): Promise<Db> {
    const db = await createMigratedTestDb();
    await db.exec(`
      INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', ${T}), ('m2', 'Budi', ${T}), ('m3', 'Citra', ${T});
      INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('p1', 'Periode 1', 3, 'active', '2026-01-06', ${T});
      INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1), ('p1', 'm2', 2), ('p1', 'm3', 3);
      INSERT INTO weeks (period_id, number, date, host_member_id, status, closed_at) VALUES
        ('p1', 1, '2026-01-06', 'm1', 'closed', ${T}), ('p1', 2, '2026-01-13', 'm2', 'closed', ${T}), ('p1', 3, '2026-01-20', 'm3', 'open', NULL);
    `);
    return db;
  }

  const skip = (id = 's1', week = 3, period = 'p1', reason = 'host cannot receive guests') =>
    `INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('${id}', '${period}', ${week}, '${reason}', ${T})`;
  const undo = (skipId = 's1', reason = 'changed my mind') => `INSERT INTO week_skip_undos (skip_id, reason, created_at) VALUES ('${skipId}', '${reason}', ${T})`;

  it('accepts a valid skip and the view lists it; an undo takes it out of the view and the week can be skipped again', async () => {
    const db = await fixture();
    await db.exec(skip());
    expect(await db.getAll('SELECT period_id, week, skip_id FROM skipped_weeks')).toEqual([{ period_id: 'p1', week: 3, skip_id: 's1' }]);
    await db.exec(undo());
    expect(await db.getAll('SELECT * FROM skipped_weeks')).toEqual([]);
    await db.exec(skip('s2'));
    expect(await db.getAll('SELECT skip_id FROM skipped_weeks')).toEqual([{ skip_id: 's2' }]);
  });

  it.each([
    ['week_skips_no_update', "UPDATE week_skips SET reason = 'x' WHERE id = 's1'", /append-only/],
    ['week_skips_no_delete', "DELETE FROM week_skips WHERE id = 's1'", /append-only/],
    ['week_skip_undos_no_update', "UPDATE week_skip_undos SET reason = 'x'", /append-only/],
    ['week_skip_undos_no_delete', 'DELETE FROM week_skip_undos', /append-only/],
  ])('%s', async (_name, statement, message) => {
    const db = await fixture();
    await db.exec(skip());
    await db.exec(undo());
    await expect(db.exec(statement)).rejects.toThrow(message);
  });

  it('rejects a second undo of the same skip (UNIQUE)', async () => {
    const db = await fixture();
    await db.exec(skip());
    await db.exec(undo());
    await expect(db.exec(undo('s1', 'again'))).rejects.toThrow(/UNIQUE/);
  });

  it('week_skips_period_active: a closed period cannot get a skip', async () => {
    const db = await fixture();
    // (the meeting stays open on purpose: with several guards true, SQLite fires the newest trigger first)
    await db.exec("UPDATE periods SET status = 'closed', end_date = '2026-02-01' WHERE id = 'p1'");
    await expect(db.exec(skip())).rejects.toThrow(/only a meeting of the active period/);
    await expect(db.exec(skip('s9', 3, 'nope'))).rejects.toThrow(); // unknown period
  });

  it('week_skips_last_only: only meeting number = member count', async () => {
    const db = await fixture();
    // p2: meeting 1 closed, 2 and 3 open, so meeting 2 breaks ONLY the "last meeting" guard
    await db.exec("INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('p2', 'P2', 3, 'active', '2026-05-05', 'x')");
    await db.exec("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p2', 'm1', 1), ('p2', 'm2', 2), ('p2', 'm3', 3)");
    await db.exec("INSERT INTO weeks (period_id, number, date, status, closed_at) VALUES ('p2', 1, '2026-05-05', 'closed', 'x'), ('p2', 2, '2026-05-12', 'open', NULL), ('p2', 3, '2026-05-19', 'open', NULL)");
    await expect(db.exec(skip('s1', 2, 'p2'))).rejects.toThrow(/only the last meeting can be skipped/);
  });

  it('week_skips_week_open: a closed last meeting cannot be skipped', async () => {
    const db = await fixture();
    await db.exec("UPDATE weeks SET status = 'closed', closed_at = 'x' WHERE period_id = 'p1' AND number = 3");
    await expect(db.exec(skip())).rejects.toThrow(/closed meeting cannot be skipped/);
  });

  it('week_skips_earlier_closed: an open earlier meeting blocks the skip', async () => {
    const db = await fixture();
    await db.exec("INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('p2', 'P2', 2, 'active', '2026-05-05', 'x')");
    // one active period at a time is an app rule, not a table rule; p2 has meeting 1 open, so meeting 2 cannot be skipped
    await db.exec("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p2', 'm1', 1), ('p2', 'm2', 2)");
    await db.exec("INSERT INTO weeks (period_id, number, date, status) VALUES ('p2', 1, '2026-05-05', 'open'), ('p2', 2, '2026-05-12', 'open')");
    await expect(db.exec(skip('s1', 2, 'p2'))).rejects.toThrow(/every earlier meeting must be closed/);
  });

  it('week_skips_one_in_force: a meeting cannot be skipped twice at once', async () => {
    const db = await fixture();
    await db.exec(skip());
    await expect(db.exec(skip('s2'))).rejects.toThrow(/already skipped/);
  });

  it('week_skips_no_standing_payout: a payout in force blocks, a corrected one does not', async () => {
    const db = await fixture();
    await db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
                   VALUES ('o1', 'p1', '2026-01-21', 30000, 'out', 'host_payout', 'm3', 3, '', ${T})`);
    await expect(db.exec(skip())).rejects.toThrow(/host payout in force cannot be skipped/);
    await db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, reverses_entry_id, correction_reason)
                   VALUES ('r1', 'p1', '2026-01-22', 30000, 'in', 'reversal', 'm3', 3, '', ${T}, 'o1', 'wrong')`);
    await db.exec(skip());
  });

  it('week_skip_undos_period_active: no undo once the period is closed', async () => {
    const db = await fixture();
    await db.exec(skip());
    await db.exec("UPDATE periods SET status = 'closed', end_date = '2026-02-01' WHERE id = 'p1'");
    await expect(db.exec(undo())).rejects.toThrow(/only be undone while the period is active/);
  });

  it('week_skip_undos_week_open: no undo of a skip whose meeting is closed', async () => {
    const db = await fixture();
    await db.exec(skip());
    await db.exec("UPDATE periods SET status = 'closed', end_date = '2026-02-01' WHERE id = 'p1'");
    await db.exec("UPDATE weeks SET status = 'closed', closed_at = 'x' WHERE period_id = 'p1' AND number = 3");
    await db.exec("UPDATE periods SET status = 'active', end_date = NULL WHERE id = 'p1'"); // tampered: reactivate
    await expect(db.exec(undo())).rejects.toThrow(/closed meeting cannot be undone/);
  });

  it('allocations_not_skipped: no payment allocation to a skipped meeting, fine again after the undo', async () => {
    const db = await fixture();
    await db.exec(`INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('pay', 'p1', 'm1', '2026-01-06', 30000, ${T})`);
    const alloc = "INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES ('pay', 'p1', 'm1', 3, 15000, '2026-01-06')";
    await db.exec(skip());
    await expect(db.exec(alloc)).rejects.toThrow(/skipped meeting has no dues to pay/);
    await db.exec(undo());
    await db.exec(alloc);
  });

  it('offset_credits_not_skipped', async () => {
    const db = await fixture();
    await db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
                   VALUES ('off', 'p1', '2026-01-21', 15000, 'in', 'host_offset', 'm1', 1, '', ${T})`);
    await db.exec(skip());
    await expect(db.exec("INSERT INTO offset_credits (ledger_entry_id, period_id, member_id, week, amount) VALUES ('off', 'p1', 'm1', 3, 15000)")).rejects.toThrow(
      /no dues to offset/,
    );
    await db.exec("INSERT INTO offset_credits (ledger_entry_id, period_id, member_id, week, amount) VALUES ('off', 'p1', 'm1', 2, 15000)"); // other meetings are fine
  });

  it('credit_applications_not_skipped: checks the TARGET period and meeting', async () => {
    const db = await fixture();
    await db.exec("INSERT INTO periods (id, name, member_count, status, start_date, end_date, created_at) VALUES ('p0', 'P0', 3, 'closed', '2025-01-07', '2025-03-01', 'x')");
    await db.exec("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p0', 'm1', 1), ('p0', 'm2', 2), ('p0', 'm3', 3)");
    await db.exec("INSERT INTO weeks (period_id, number, date, status, closed_at) VALUES ('p0', 1, '2025-01-07', 'closed', 'x'), ('p0', 2, '2025-01-14', 'closed', 'x'), ('p0', 3, '2025-01-21', 'closed', 'x')");
    await db.exec(skip());
    await expect(
      db.exec(`INSERT INTO credit_applications (kind, from_period_id, member_id, to_period_id, week, amount, created_at) VALUES ('carry_over', 'p0', 'm1', 'p1', 3, 15000, ${T})`),
    ).rejects.toThrow(/no dues for member credit/);
    await db.exec(`INSERT INTO credit_applications (kind, from_period_id, member_id, to_period_id, week, amount, created_at) VALUES ('carry_over', 'p0', 'm1', 'p1', 2, 15000, ${T})`);
  });

  it.each([
    ['host_payout', 'host payout'],
    ['host_offset', 'host payout'],
  ])('ledger_payout_not_skipped: a %s of a skipped meeting is refused', async (type) => {
    const db = await fixture();
    await db.exec(skip());
    await expect(
      db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
               VALUES ('x', 'p1', '2026-01-21', 10000, 'out', '${type}', 'm3', 3, '', ${T})`),
    ).rejects.toThrow(/skipped meeting has no host payout/);
    // another meeting and other entry types of the skipped week are fine (a plain payment has no week at all)
    await db.exec(`INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
                   VALUES ('y', 'p1', '2026-01-21', 10000, 'out', '${type}', 'm1', 1, '', ${T})`);
  });

  it('weeks_skipped_locked: host and date of a skipped meeting cannot change, other columns can', async () => {
    const db = await fixture();
    await db.exec(skip());
    await expect(db.exec("UPDATE weeks SET host_member_id = 'm1' WHERE period_id = 'p1' AND number = 3")).rejects.toThrow(/cannot change; undo the skip first/);
    await expect(db.exec("UPDATE weeks SET host_member_id = NULL WHERE period_id = 'p1' AND number = 3")).rejects.toThrow(/cannot change/);
    await expect(db.exec("UPDATE weeks SET date = '2026-02-03' WHERE period_id = 'p1' AND number = 3")).rejects.toThrow(/cannot change/);
    await db.exec("UPDATE weeks SET host_member_id = host_member_id, date = date WHERE period_id = 'p1' AND number = 3"); // no real change
    await db.exec(undo());
    await db.exec("UPDATE weeks SET date = '2026-02-03' WHERE period_id = 'p1' AND number = 3");
  });

  it('weeks_skipped_close_with_period: only closes together with the period', async () => {
    const db = await fixture();
    await db.exec(skip());
    await expect(db.exec("UPDATE weeks SET status = 'closed', closed_at = 'x' WHERE period_id = 'p1' AND number = 3")).rejects.toThrow(/closed together with its period/);
    await db.exec("UPDATE periods SET status = 'closed', end_date = '2026-02-01' WHERE id = 'p1'");
    await db.exec("UPDATE weeks SET status = 'closed', closed_at = 'x' WHERE period_id = 'p1' AND number = 3");
    expect(await db.getAll('SELECT week FROM skipped_weeks')).toEqual([{ week: 3 }]); // still skipped after it closed
  });

  it('checks: a blank reason is refused for a skip and for an undo; a skip needs an existing meeting', async () => {
    const db = await fixture();
    await expect(db.exec(skip('s1', 3, 'p1', '   '))).rejects.toThrow(/CHECK/);
    await db.exec(skip());
    await expect(db.exec(undo('s1', ' '))).rejects.toThrow(/CHECK/);
    await expect(db.exec(undo('missing', 'x'))).rejects.toThrow(); // FK / period lookup
  });
});
