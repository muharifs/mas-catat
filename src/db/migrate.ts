// Versioned migration runner based on SQLite's PRAGMA user_version.
import type { Db } from './db';
import { MigrationError } from './errors';
import { MIGRATIONS, type Migration } from './migrations';

export interface MigrateResult {
  from: number;
  to: number;
}

async function readVersion(db: Db): Promise<number> {
  const row = await db.getFirst<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Brings the database up to the latest known version.
 * - Applies pending migrations in order, each in its own transaction together with the version bump,
 *   so a failing migration leaves the previous version intact.
 * - Idempotent: running it again does nothing.
 * - Refuses a database whose version is newer than this app knows (e.g. data from a newer build).
 */
export async function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): Promise<MigrateResult> {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new MigrationError(`migrations must be numbered 1..n without gaps; found ${m.version} at position ${i + 1}`);
    }
  });
  const latest = migrations.length;

  // Per connection and ignored inside a transaction, so it must be set here, before any BEGIN.
  await db.exec('PRAGMA foreign_keys = ON');

  const from = await readVersion(db);
  if (from > latest) {
    throw new MigrationError(`database version ${from} is newer than this app supports (${latest}); update the app`);
  }

  for (const m of migrations.slice(from)) {
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      // m.version is a number from our own list, never user input.
      await tx.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
  return { from, to: latest };
}
