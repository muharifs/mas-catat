// Test-only NativeBridge on sql.js. It lets the backup/restore LOGIC run in Node: the live database is a sql.js
// database that can be exported to bytes (stand-in for serializeAsync), opened from bytes (stand-in for
// deserializeDatabaseAsync) and replaced by another one (stand-in for backupDatabaseAsync).
//
// It does NOT prove the native calls. In particular: expo-sqlite ignores the result of backup_step, only the phone
// shows that serialize, deserialize, backup, sharing and the file picker really work.
import { createDb, type Db } from '../db';
import { migrate } from '../migrate';
import type { MemoryDb, NativeBridge, SafetyStore } from '../backup';
import { createSqlJsRawDriver, loadSqlJsEngine } from './sqlJsDriver';

type Engine = Awaited<ReturnType<typeof loadSqlJsEngine>>;
type SqlJsDatabase = InstanceType<Engine['Database']>;

export interface SqlJsEnv {
  /** The live database as the app sees it (with the queue). */
  db: Db;
  bridge: NativeBridge;
  /** Bytes of the live database right now. */
  liveBytes(): Uint8Array;
  /** Memory databases opened through the bridge and not closed yet (should be 0 when an operation ends). */
  openMemoryCount(): number;
  /** Simulates a connection that lost PRAGMA foreign_keys after the copy (set before a restore). */
  dropForeignKeysOnCopy: { value: boolean };
}

function foreignKeysOn(database: SqlJsDatabase): boolean {
  const rows = database.exec('PRAGMA foreign_keys');
  return rows[0]?.values[0]?.[0] === 1;
}

/** sql.js export() closes and reopens the database, which resets connection settings: put foreign_keys back. */
function exportKeepingSettings(database: SqlJsDatabase): Uint8Array {
  const fk = foreignKeysOn(database);
  const bytes = database.export();
  if (fk) database.exec('PRAGMA foreign_keys = ON');
  return bytes;
}

/** A live database. `migrated` (default true) applies all migrations; pass `initialBytes` to start from a file image. */
export async function createSqlJsEnv(options: { initialBytes?: Uint8Array; migrated?: boolean } = {}): Promise<SqlJsEnv> {
  const SQL = await loadSqlJsEngine();
  let current: SqlJsDatabase = options.initialBytes ? new SQL.Database(options.initialBytes) : new SQL.Database();
  const raw = createSqlJsRawDriver(() => current);
  const db = createDb(raw);
  if (options.migrated ?? true) await migrate(db);

  const memories = new WeakMap<MemoryDb, SqlJsDatabase>();
  let open = 0;
  const dropForeignKeysOnCopy = { value: false };

  const bridge: NativeBridge = {
    liveRaw: raw,
    serializeLive: async () => exportKeepingSettings(current),
    openMemory: async (bytes) => {
      const database = bytes ? new SQL.Database(bytes) : new SQL.Database();
      let closed = false;
      open += 1;
      const memory: MemoryDb = {
        db: createDb(createSqlJsRawDriver(() => database)),
        close: async () => {
          if (closed) return;
          closed = true;
          open -= 1;
          database.close();
        },
      };
      memories.set(memory, database);
      return memory;
    },
    copyIntoLive: async (source) => {
      const database = memories.get(source);
      if (!database) throw new Error('unknown memory database');
      const image = exportKeepingSettings(database);
      const fkWasOn = foreignKeysOn(current);
      const previous = current;
      current = new SQL.Database(image);
      // A native backup keeps the destination connection's settings; mimic that.
      if (fkWasOn && !dropForeignKeysOnCopy.value) current.exec('PRAGMA foreign_keys = ON');
      previous.close();
    },
  };

  return {
    db,
    bridge,
    liveBytes: () => exportKeepingSettings(current),
    openMemoryCount: () => open,
    dropForeignKeysOnCopy,
  };
}

/** In-memory safety store with switches to make single steps fail or lie. */
export class FakeSafetyStore implements SafetyStore {
  files = new Map<string, Uint8Array>();
  failOn: 'writeTemp' | 'readBytes' | 'rename' | null = null;
  /** readBytes returns this many bytes less than were written (a truncated write). */
  truncateReadBy = 0;
  /** readBytes flips the first byte, so the image is not a database any more (same size). */
  corruptRead = false;
  removeFails = false;

  async writeTemp(name: string, bytes: Uint8Array): Promise<void> {
    if (this.failOn === 'writeTemp') throw new Error('disk full');
    this.files.set(name, bytes.slice());
  }

  async readBytes(name: string): Promise<Uint8Array> {
    if (this.failOn === 'readBytes') throw new Error('read error');
    const data = this.files.get(name);
    if (!data) throw new Error(`missing ${name}`);
    const copy = data.slice(0, data.length - this.truncateReadBy);
    if (this.corruptRead) copy[0] = (copy[0] ?? 0) ^ 0xff;
    return copy;
  }

  async rename(from: string, to: string): Promise<void> {
    if (this.failOn === 'rename') throw new Error('cannot rename');
    const data = this.files.get(from);
    if (!data) throw new Error(`missing ${from}`);
    this.files.delete(from);
    this.files.set(to, data);
  }

  async remove(name: string): Promise<void> {
    if (this.removeFails) throw new Error('cannot remove');
    this.files.delete(name);
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()];
  }
}
