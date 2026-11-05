import type { Db } from './db';
import { MigrationError } from './errors';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createMigratedTestDb, createSqlJsDb } from './testing/sqlJsDriver';

async function userVersion(db: Db): Promise<number> {
  return (await db.getFirst<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? -1;
}

/** Minimal valid rows so constraint tests can focus on one column. */
async function seed(db: Db): Promise<void> {
  await db.run("INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', 't'), ('m2', 'Budi', 't')");
  await db.run(
    "INSERT INTO periods (id, name, member_count, start_date, created_at) VALUES ('p1', 'P', 2, '2026-01-01', 't')",
  );
  await db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1), ('p1', 'm2', 2)");
  await db.run(
    "INSERT INTO weeks (period_id, number, date, host_member_id) VALUES ('p1', 1, '2026-01-01', 'm1'), ('p1', 2, '2026-01-08', 'm2')",
  );
}

const ledgerInsert =
  "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at) VALUES (?, 'p1', '2026-01-01', ?, ?, 'member_payment', 'm1', 1, '', 't')";

describe('migrate', () => {
  it('upgrades an empty database to the latest version', async () => {
    const db = await createSqlJsDb();
    expect(await userVersion(db)).toBe(0);
    const result = await migrate(db);
    expect(result).toEqual({ from: 0, to: MIGRATIONS.length });
    expect(await userVersion(db)).toBe(MIGRATIONS.length);
    const tables = await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['members', 'periods', 'period_members', 'weeks', 'payments', 'allocations', 'ledger_entries']),
    );
  });

  it('is idempotent when run again', async () => {
    const db = await createMigratedTestDb();
    await seed(db);
    expect(await migrate(db)).toEqual({ from: MIGRATIONS.length, to: MIGRATIONS.length });
    expect((await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM members'))?.n).toBe(2);
  });

  it('refuses a database that is newer than the app', async () => {
    const db = await createSqlJsDb();
    await db.exec('PRAGMA user_version = 99');
    await expect(migrate(db)).rejects.toThrow(MigrationError);
    expect(await userVersion(db)).toBe(99);
  });

  it('rolls a failing migration back and keeps the old version', async () => {
    const db = await createSqlJsDb();
    const broken = [{ version: 1, name: 'broken', sql: 'CREATE TABLE ok (id INTEGER); CREATE TABLE ok (id INTEGER);' }];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await userVersion(db)).toBe(0);
    expect(await db.getAll("SELECT name FROM sqlite_master WHERE name = 'ok'")).toHaveLength(0);
  });

  it('rejects migration lists with gaps', async () => {
    const db = await createSqlJsDb();
    await expect(migrate(db, [{ version: 2, name: 'x', sql: '' }])).rejects.toThrow(MigrationError);
  });

  it('turns foreign key enforcement on', async () => {
    const db = await createMigratedTestDb();
    expect((await db.getFirst<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys).toBe(1);
    await expect(
      db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('nope', 'nope', 1)"),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });
});

describe('schema constraints', () => {
  it('rejects UPDATE and DELETE on ledger_entries (append-only)', async () => {
    const db = await createMigratedTestDb();
    await seed(db);
    await db.run(ledgerInsert, ['e1', 15000, 'in']);
    await expect(db.run("UPDATE ledger_entries SET amount = 1000 WHERE id = 'e1'")).rejects.toThrow(/append-only/);
    await expect(db.run("UPDATE ledger_entries SET note = 'x' WHERE id = 'e1'")).rejects.toThrow(/append-only/);
    await expect(db.run("DELETE FROM ledger_entries WHERE id = 'e1'")).rejects.toThrow(/append-only/);
    expect((await db.getFirst<{ amount: number }>("SELECT amount FROM ledger_entries WHERE id = 'e1'"))?.amount).toBe(15000);
  });

  it('rejects ledger amounts that are zero, negative or not integers', async () => {
    const db = await createMigratedTestDb();
    await seed(db);
    await expect(db.run(ledgerInsert, ['a', 0, 'in'])).rejects.toThrow(/CHECK/i);
    await expect(db.run(ledgerInsert, ['b', -15000, 'in'])).rejects.toThrow(/CHECK/i);
    await expect(db.run(ledgerInsert, ['c', 1500.5, 'in'])).rejects.toThrow(/CHECK/i);
    await expect(db.run(ledgerInsert, ['d', 15000, 'sideways'])).rejects.toThrow(/CHECK/i);
    await db.run(ledgerInsert, ['ok', 15000, 'out']);
  });

  it('rejects non-positive or non-integer payment amounts', async () => {
    const db = await createMigratedTestDb();
    await seed(db);
    const sql = "INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES (?, 'p1', 'm1', '2026-01-01', ?, 't')";
    await expect(db.run(sql, ['a', 0])).rejects.toThrow(/CHECK/i);
    await expect(db.run(sql, ['b', 15000.5])).rejects.toThrow(/CHECK/i);
  });

  it('rejects a member who is not in the period (foreign key)', async () => {
    const db = await createMigratedTestDb();
    await seed(db);
    await db.run("INSERT INTO members (id, name, created_at) VALUES ('m3', 'Cici', 't')");
    await expect(
      db.run("INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('x', 'p1', 'm3', '2026-01-01', 15000, 't')"),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('keeps N fixed: no extra period members, no second hosting of the same member', async () => {
    const db = await createMigratedTestDb();
    await seed(db);
    await db.run("INSERT INTO members (id, name, created_at) VALUES ('m3', 'Cici', 't')");
    await expect(
      db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm3', 3)"),
    ).rejects.toThrow(/member_count/);
    await expect(db.run("UPDATE weeks SET host_member_id = 'm1' WHERE period_id = 'p1' AND number = 2")).rejects.toThrow(
      /UNIQUE/i,
    );
    await expect(db.run("DELETE FROM period_members WHERE member_id = 'm1'")).rejects.toThrow(/fixed/);
  });
});

describe('migration 0002 (ledger account)', () => {
  it('upgrades a version 1 database that already has data and keeps it', async () => {
    const db = await createSqlJsDb();
    await migrate(db, MIGRATIONS.slice(0, 1));
    expect(await userVersion(db)).toBe(1);
    await seed(db);
    await db.run(ledgerInsert, ['old', 15000, 'in']);

    expect(await migrate(db)).toEqual({ from: 1, to: MIGRATIONS.length });
    expect(await userVersion(db)).toBe(2);
    const old = await db.getFirst<{ amount: number; account: string | null }>(
      "SELECT amount, account FROM ledger_entries WHERE id = 'old'",
    );
    expect(old).toEqual({ amount: 15000, account: null });
    expect((await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM members'))?.n).toBe(2);
  });

  it('accepts only tunai, debit, piutang or NULL, and stays append-only', async () => {
    const db = await createMigratedTestDb();
    await seed(db);
    const sql =
      "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, account, created_at) VALUES (?, 'p1', '2026-01-01', 15000, 'in', 'member_payment', ?, 't')";
    await db.run(sql, ['a', 'tunai']);
    await db.run(sql, ['b', 'debit']);
    await db.run(sql, ['c', 'piutang']);
    await db.run(sql, ['d', null]);
    await expect(db.run(sql, ['e', 'bank'])).rejects.toThrow(/CHECK/i);
    await expect(db.run("UPDATE ledger_entries SET account = 'debit' WHERE id = 'a'")).rejects.toThrow(/append-only/);
  });
});
