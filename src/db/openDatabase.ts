// Opens the production database with expo-sqlite. Kept apart from all logic so tests never load native code.
//
// How this differs from a database on the web:
// - expo-sqlite runs real SQLite NATIVELY on the phone (not in a browser, no IndexedDB/localStorage).
//   The data is one file in the app's private storage; it survives app restarts and is wiped on uninstall.
// - Every call is async (returns a Promise); there is no synchronous query in normal use.
// - There is no server: this file IS the database, so a backup (M7) is a copy of the bytes of that file.
import * as SQLite from 'expo-sqlite';
import type { MemoryDb, NativeBridge } from './backup';
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

/**
 * The few native-only operations backup and restore need (see src/db/backup.ts for how they are used):
 * serializeAsync, deserializeDatabaseAsync, an empty in-memory database, and backupDatabaseAsync.
 * None of this can run in Jest; tests use a sql.js stand-in. Only the phone proves it.
 */
function createExpoBridge(live: SQLite.SQLiteDatabase, liveRaw: RawDriver): NativeBridge {
  const natives = new WeakMap<MemoryDb, SQLite.SQLiteDatabase>();
  return {
    liveRaw,
    serializeLive: () => live.serializeAsync('main'),
    openMemory: async (bytes) => {
      // deserialize gives a private in-memory database; an empty one needs useNewConnection so it is never shared.
      const native = bytes ? await SQLite.deserializeDatabaseAsync(bytes) : await SQLite.openDatabaseAsync(':memory:', { useNewConnection: true });
      let closed = false;
      const memory: MemoryDb = {
        db: createDb(createExpoDriver(native)),
        close: async () => {
          if (closed) return;
          closed = true;
          await native.closeAsync();
        },
      };
      natives.set(memory, native);
      return memory;
    },
    copyIntoLive: async (source) => {
      const native = natives.get(source);
      if (!native) throw new Error('unknown memory database');
      await SQLite.backupDatabaseAsync({ sourceDatabase: native, sourceDatabaseName: 'main', destDatabase: live, destDatabaseName: 'main' });
    },
  };
}

export interface OpenedDatabase {
  /** The queued database every repository uses. */
  db: Db;
  /** Native-only operations for backup and restore. */
  bridge: NativeBridge;
  /** The native handle itself (for code that must talk to expo-sqlite directly). */
  native: SQLite.SQLiteDatabase;
}

/** Opens (creating if needed) the app database and applies pending migrations. Call once at app start. */
export async function openDatabase(name: string = DATABASE_NAME): Promise<OpenedDatabase> {
  const native = await SQLite.openDatabaseAsync(name);
  const raw = createExpoDriver(native);
  const db = createDb(raw);
  await migrate(db);
  return { db, bridge: createExpoBridge(native, raw), native };
}
