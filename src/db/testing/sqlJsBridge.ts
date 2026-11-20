// Test-only NativeBridge on sql.js. It lets the backup/restore LOGIC run in Node: the live database is a sql.js
// database that can be exported to bytes (stand-in for serializeAsync), opened from bytes (stand-in for
// deserializeDatabaseAsync) and replaced by another one (stand-in for backupDatabaseAsync).
//
// It does NOT prove the native calls. In particular: expo-sqlite ignores the result of backup_step, only the phone
// shows that serialize, deserialize, backup, sharing and the file picker really work.
import { parseRestoreMarker, RESTORE_MARKER_NAME, serializeRestoreMarker, type RestoreMarker } from '@/domain/backup';
import { createDb, type Db } from '../db';
import { migrate } from '../migrate';
import type { MemoryDb, NativeBridge, SafetyStore } from '../backup';
import { createSqlJsRawDriver, loadSqlJsEngine } from './sqlJsDriver';

export type CrashPoint = 'afterMarker' | 'duringCopy' | 'afterCopy' | 'afterVerify' | 'duringRecovery';

/**
 * Simulates the app or the phone dying at one point of a restore. A real crash means the code after that point NEVER
 * runs (a thrown error would be caught by commitRestore, which is a different thing). When the armed point is reached,
 * the state on "disk" (live database bytes and safety folder files) is captured and the caller gets a promise that never
 * settles. The test does not await commitRestore, waits for `snapshot`, and "restarts" from it.
 */
export class CrashSwitch {
  at: CrashPoint | null = null;
  /** For 'duringCopy' (copy number 1) and 'duringRecovery' (copy number `nthCopy`, default 1: the first copy of a recovery run). */
  nthCopy = 1;
  snapshot: { liveBytes: Uint8Array; files: Map<string, Uint8Array> } | null = null;
  getLive: (() => Uint8Array) | null = null;
  getFiles: (() => Map<string, Uint8Array>) | null = null;
  private copies = 0;

  arm(at: CrashPoint, nthCopy = 1): this {
    this.at = at;
    this.nthCopy = nthCopy;
    this.snapshot = null;
    this.copies = 0;
    return this;
  }

  /** Called by the fakes. `liveOverride` is what is on disk at the crash (a partly copied database). */
  hit(point: CrashPoint, liveOverride?: Uint8Array): Promise<void> {
    if (this.at !== point || this.snapshot) return Promise.resolve();
    if (point === 'duringCopy' || point === 'duringRecovery') {
      this.copies += 1;
      if (this.copies !== (point === 'duringCopy' ? 1 : this.nthCopy)) return Promise.resolve();
    }
    const files = new Map<string, Uint8Array>();
    for (const [name, bytes] of this.getFiles?.() ?? []) files.set(name, bytes.slice());
    this.snapshot = { liveBytes: (liveOverride ?? this.getLive?.() ?? new Uint8Array()).slice(), files };
    return new Promise<void>(() => undefined); // never settles: the process is gone
  }
}

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
  /** Replaces the live database with these bytes (a truncated or garbage file), as a crash may leave it. */
  setLiveRaw(bytes: Uint8Array): void;
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
export async function createSqlJsEnv(options: { initialBytes?: Uint8Array; migrated?: boolean; crash?: CrashSwitch } = {}): Promise<SqlJsEnv> {
  const SQL = await loadSqlJsEngine();
  let current: SqlJsDatabase = options.initialBytes ? new SQL.Database(options.initialBytes) : new SQL.Database();
  const raw = createSqlJsRawDriver(() => current);
  const db = createDb(raw);
  if (options.migrated ?? true) await migrate(db);

  const memories = new WeakMap<MemoryDb, SqlJsDatabase>();
  let open = 0;
  const dropForeignKeysOnCopy = { value: false };
  const crash = options.crash;
  if (crash) crash.getLive = () => exportKeepingSettings(current);

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
      if (crash && (crash.at === 'duringCopy' || crash.at === 'duringRecovery')) {
        // Dies halfway through the copy: only the first half of the pages reached the file.
        const partly = image.slice(0, Math.floor(image.length / 2));
        await crash.hit(crash.at, partly);
      }
      current = new SQL.Database(image);
      // A native backup keeps the destination connection's settings; mimic that.
      if (fkWasOn && !dropForeignKeysOnCopy.value) current.exec('PRAGMA foreign_keys = ON');
      previous.close();
      if (crash?.at === 'afterCopy') await crash.hit('afterCopy');
    },
  };

  return {
    db,
    bridge,
    liveBytes: () => exportKeepingSettings(current),
    openMemoryCount: () => open,
    dropForeignKeysOnCopy,
    setLiveRaw: (bytes) => {
      const previous = current;
      current = new SQL.Database(bytes);
      previous.close();
    },
  };
}

/** In-memory safety store with switches to make single steps fail or lie. */
export class FakeSafetyStore implements SafetyStore {
  files = new Map<string, Uint8Array>();
  failOn: 'writeTemp' | 'readBytes' | 'rename' | 'writeMarker' | 'clearMarker' | null = null;
  /** writeMarker fails only for the 'recovering' update (the first marker write works). */
  failRecoveringMarker = false;
  /** Every marker write, in order (a test can read the stages). */
  markerWrites: RestoreMarker[] = [];
  /** Order of calls, to prove "marker before the copy" style claims together with an env hook. */
  calls: string[] = [];
  readonly crash: CrashSwitch | null;

  constructor(crash: CrashSwitch | null = null) {
    this.crash = crash;
    if (crash) crash.getFiles = () => this.files;
  }

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

  async writeMarker(marker: RestoreMarker): Promise<void> {
    if (this.failOn === 'writeMarker') throw new Error('cannot write the marker');
    if (this.failRecoveringMarker && marker.stage === 'recovering') throw new Error('cannot update the marker');
    this.calls.push(`writeMarker:${marker.stage}`);
    this.markerWrites.push(marker);
    this.files.set(RESTORE_MARKER_NAME, new TextEncoder().encode(serializeRestoreMarker(marker)));
    if (this.crash && marker.stage === 'swapping') await this.crash.hit('afterMarker');
  }

  async readMarker(): Promise<RestoreMarker | null | 'corrupt'> {
    const data = this.files.get(RESTORE_MARKER_NAME);
    if (!data) return null;
    return parseRestoreMarker(new TextDecoder().decode(data)) ?? 'corrupt';
  }

  async clearMarker(): Promise<void> {
    if (this.failOn === 'clearMarker') throw new Error('cannot remove the marker');
    if (this.crash) await this.crash.hit('afterVerify');
    this.calls.push('clearMarker');
    this.files.delete(RESTORE_MARKER_NAME);
  }
}
