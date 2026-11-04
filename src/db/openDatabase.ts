// Opens the production database with expo-sqlite. Kept apart from all logic so tests never load native code.
//
// How this differs from a database on the web:
// - expo-sqlite runs real SQLite NATIVELY on the phone (not in a browser, no IndexedDB/localStorage).
//   The data is one file in the app's private storage; it survives app restarts and is wiped on uninstall.
// - Every call is async (returns a Promise); there is no synchronous query in normal use.
// - There is no server: this file IS the database, so backups (M7) mean copying/exporting that file.
import * as SQLite from 'expo-sqlite';
import { createDb, type Db, type RawDriver, type SqlValue } from './db';
import { migrate } from './migrate';

export const DATABASE_NAME = 'mascatat.db';

function createExpoDriver(database: SQLite.SQLiteDatabase): RawDriver {
  return {
    exec: (sql) => database.execAsync(sql),
    run: async (sql, params = []) => {
      const result = await database.runAsync(sql, params as SqlValue[]);
      return { changes: result.changes };
    },
    getAll: (sql, params = []) => database.getAllAsync(sql, params as SqlValue[]),
    getFirst: (sql, params = []) => database.getFirstAsync(sql, params as SqlValue[]),
  };
}

/** Opens (creating if needed) the app database and applies pending migrations. Call once at app start. */
export async function openDatabase(name: string = DATABASE_NAME): Promise<Db> {
  const database = await SQLite.openDatabaseAsync(name);
  const db = createDb(createExpoDriver(database));
  await migrate(db);
  return db;
}
