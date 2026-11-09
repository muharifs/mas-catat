// Migration 0005 on existing data: starts from a real version 4 database and upgrades it. Runs on sql.js.
import { SCHEMA_FINGERPRINT_SQL, diffSchema, type SchemaObject } from '@/domain/backup';
import type { Db } from './db';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createSqlJsDb } from './testing/sqlJsDriver';

const userVersion = async (db: Db): Promise<number> =>
  (await db.getFirst<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? -1;
const schemaOf = (db: Db) => db.getAll<SchemaObject>(SCHEMA_FINGERPRINT_SQL);

async function v4WithData(): Promise<Db> {
  const db = await createSqlJsDb();
  await migrate(db, MIGRATIONS.slice(0, 4));
  await db.run("INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', 't'), ('m2', 'Budi', 't')");
  await db.run("INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('p1', 'P', 1, 'active', '2026-01-06', 't')");
  await db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1)");
  return db;
}

describe('migration 0005 (member archive)', () => {
  it('upgrades version 4 with data: members keep their rows, archived_at is NULL, two triggers are added', async () => {
    const db = await v4WithData();
    expect(await userVersion(db)).toBe(4);
    const before = await db.getAll<{ id: string; name: string; created_at: string }>('SELECT id, name, created_at FROM members ORDER BY id');

    expect(await migrate(db)).toEqual({ from: 4, to: 5 });
    expect(await userVersion(db)).toBe(5);

    expect(await db.getAll('SELECT id, name, created_at FROM members ORDER BY id')).toEqual(before);
    expect(await db.getAll('SELECT archived_at FROM members')).toEqual([{ archived_at: null }, { archived_at: null }]);
    const triggers = (await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('members', 'period_members')")).map((r) => r.name);
    expect(triggers).toEqual(expect.arrayContaining(['members_archive_not_in_active_period', 'period_members_no_archived']));
    expect(await db.getAll('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('a fresh version 5 schema equals a version 4 database migrated to 5 (no fingerprint drift, debt L2)', async () => {
    const fresh = await createSqlJsDb();
    await migrate(fresh);
    const upgraded = await v4WithData();
    await migrate(upgraded);
    expect(diffSchema(await schemaOf(fresh), await schemaOf(upgraded))).toEqual([]);
    expect(await schemaOf(upgraded)).toEqual(await schemaOf(fresh));
  });
});
