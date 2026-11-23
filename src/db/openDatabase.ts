// Opens the production database with expo-sqlite. Kept apart from all logic so tests never load native code.
//
// How this differs from a database on the web:
// - expo-sqlite runs real SQLite NATIVELY on the phone (not in a browser, no IndexedDB/localStorage).
//   The data is one file in the app's private storage; it survives app restarts and is wiped on uninstall.
// - Every call is async (returns a Promise); there is no synchronous query in normal use.
// - There is no server: this file IS the database, so a backup (M7) is a copy of the bytes of that file.
import * as SQLite from 'expo-sqlite';
import { prepareRestore, type MemoryDb, type MemoryOpener, type NativeBridge, type PreparedRestore, type RestoreInput } from './backup';
import { replaceDamagedDatabase } from './damagedDatabase';
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
// Shared by every bridge: a memory database opened without a live database (recovery of an unreadable file) can still be
// copied into a live database that is opened later.
const natives = new WeakMap<MemoryDb, SQLite.SQLiteDatabase>();

async function openMemoryDb(bytes: Uint8Array | null): Promise<MemoryDb> {
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
}

/** Opens in-memory databases only: enough to check a file or a safety copy when the live database cannot be opened. */
export const memoryOpener: MemoryOpener = { openMemory: openMemoryDb };

/**
 * Same as prepareRestore, for when the live database cannot be opened: the comparison is made against an empty stand-in, so
 * "Di HP ini" shows nothing. Reads nothing of the damaged file and deletes nothing.
 */
export async function prepareRestoreWithoutLive(input: RestoreInput): Promise<PreparedRestore> {
  const standIn = await openMemoryDb(null);
  try {
    await migrate(standIn.db);
    return await prepareRestore(memoryOpener, standIn.db, input);
  } finally {
    await standIn.close().catch(() => undefined);
  }
}

function createExpoBridge(live: SQLite.SQLiteDatabase, liveRaw: RawDriver): NativeBridge {
  return {
    liveRaw,
    serializeLive: () => live.serializeAsync('main'),
    openMemory: openMemoryDb,
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
  try {
    await migrate(db);
  } catch (error) {
    // Close the handle so a later repair (deleteDatabaseAsync, see replaceUnreadableDatabase) is not blocked by an open file.
    await native.closeAsync().catch(() => undefined);
    throw error;
  }
  return { db, bridge: createExpoBridge(native, raw), native };
}

/** Opens once more without any repair, for the recovery screen (null = it still cannot be opened). */
export async function tryOpenAgain(name: string = DATABASE_NAME): Promise<OpenedDatabase | null> {
  try {
    return await openDatabase(name);
  } catch {
    return null;
  }
}

/**
 * Last resort of the "restore in progress" recovery (L6): the database file is so damaged that it cannot be opened, so a copy of
 * it is kept (rusak-<time>.db in the documents folder), the file is deleted and a new empty one is created, which the safety copy
 * or the chosen file is then copied into. Only called when a restore marker exists AND the replacement was already checked in
 * memory. The order and the "nothing is deleted without a verified copy" rule are proven in Jest (damagedDatabase.ts); only a
 * phone shows whether the copy and the delete work on a really damaged file.
 */
export function replaceUnreadableDatabase(
  setAside: (directory: string, name: string) => Promise<'copied' | 'absent'>,
  name: string = DATABASE_NAME,
): Promise<OpenedDatabase> {
  return replaceDamagedDatabase<OpenedDatabase>({
    setAside: () => setAside(SQLite.defaultDatabaseDirectory, name),
    deleteDatabase: () => SQLite.deleteDatabaseAsync(name),
    open: () => openDatabase(name),
  });
}
