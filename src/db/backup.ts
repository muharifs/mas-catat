// Backup and restore engine (M7). Driver-agnostic: it only talks to a `Queryable`/`Db` and to two thin seams that
// tests replace with fakes:
//   - NativeBridge: the few things only the native SQLite module can do (serialize the live database, open an
//     in-memory database from bytes, copy an in-memory database over the live one). Real code: openDatabase.ts.
//   - SafetyStore: where safety copies live on disk. Real code: ui/shareFile.ts (the only file system code).
// Tests run on sql.js, which proves the LOGIC (checks, order of steps, recovery) but NOT that serialize,
// deserialize, backupDatabaseAsync, sharing or the file picker work on a phone.
//
// Restore plan A, in this order. Nothing touches the live data before step 6:
//   1 pick + size check (UI)           2 header/structure check        3 open in memory, migrate the COPY
//   4 integrity, foreign keys, schema fingerprint, invariants          5 compare with live (UI shows it)
//   6 safety copy (written, read back, verified), then copy memory -> live
//   7 verify live; on any difference restore the safety copy automatically
import { computeKasBalances } from '@/domain/kas';
import { WEEKLY_DUE } from '@/domain/money';
import {
  BackupError,
  classifyRestore,
  diffSchema,
  diffTableCounts,
  inspectHeader,
  missingTables,
  safetyFileName,
  safetyToPrune,
  SAFETY_TEMP_NAME,
  SCHEMA_FINGERPRINT_SQL,
  type BackupErrorCode,
  type DbSummary,
  type RestoreClassification,
  type SchemaObject,
} from '@/domain/backup';
import type { Db, Queryable } from './db';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';

export const LATEST_VERSION = MIGRATIONS.length;

// ---------------------------------------------------------------------------------------------------------------
// Seams
// ---------------------------------------------------------------------------------------------------------------

/** An in-memory database. `close` is safe to call more than once. */
export interface MemoryDb {
  db: Db;
  close(): Promise<void>;
}

export interface NativeBridge {
  /**
   * The live connection WITHOUT the queue. Only use it inside `db.runExclusive`, where nothing else runs;
   * going through the queued Db from inside runExclusive would wait for itself forever.
   */
  liveRaw: Queryable;
  /** Consistent bytes of the whole live database (sqlite3_serialize). */
  serializeLive(): Promise<Uint8Array>;
  /** A new in-memory database: from bytes (deserialize), or empty when `bytes` is null. */
  openMemory(bytes: Uint8Array | null): Promise<MemoryDb>;
  /** Replaces the whole content of the live database with the in-memory one (SQLite online backup API). */
  copyIntoLive(source: MemoryDb): Promise<void>;
}

export interface SafetyStore {
  writeTemp(name: string, bytes: Uint8Array): Promise<void>;
  readBytes(name: string): Promise<Uint8Array>;
  rename(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Names of the files in the safety folder (any name; the caller filters). */
  list(): Promise<string[]>;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading a database (live or a copy)
// ---------------------------------------------------------------------------------------------------------------

export async function readUserVersion(q: Queryable): Promise<number> {
  const row = await q.getFirst<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export function readSchema(q: Queryable): Promise<SchemaObject[]> {
  return q.getAll<SchemaObject>(SCHEMA_FINGERPRINT_SQL);
}

/** The schema a database of `version` must have, built from OUR migrations in a scratch in-memory database. */
export async function buildReferenceSchema(bridge: NativeBridge, version: number): Promise<SchemaObject[]> {
  const scratch = await bridge.openMemory(null);
  try {
    await migrate(scratch.db, MIGRATIONS.slice(0, version));
    return await readSchema(scratch.db);
  } finally {
    await closeQuietly(scratch);
  }
}

/** Ids of all ledger entries and payments (prefixed, so the two kinds never collide). */
export async function loadRecordIds(q: Queryable): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const r of await q.getAll<{ id: string }>('SELECT id FROM ledger_entries')) ids.add(`L:${r.id}`);
  for (const r of await q.getAll<{ id: string }>('SELECT id FROM payments')) ids.add(`P:${r.id}`);
  return ids;
}

/** Counts and kas of a MIGRATED database (the latest schema). */
export async function summarizeDb(q: Queryable): Promise<DbSummary> {
  const tables = await q.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const tableCounts: Record<string, number> = {};
  for (const t of tables) {
    // Table names come from sqlite_master of a schema already compared with our own; quoting is belt and braces.
    const row = await q.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM "${t.name.replace(/"/g, '""')}"`);
    tableCounts[t.name] = row?.n ?? 0;
  }
  const entries = await q.getAll<{ direction: 'in' | 'out'; amount: number; account: 'tunai' | 'debit' | 'piutang' | null; to_account: 'tunai' | 'debit' | 'piutang' | null }>(
    'SELECT direction, amount, account, to_account FROM ledger_entries',
  );
  const last = await q.getFirst<{ id: string }>('SELECT id FROM ledger_entries ORDER BY rowid DESC LIMIT 1');
  const lastDate = await q.getFirst<{ d: string | null }>('SELECT MAX(date) AS d FROM ledger_entries');
  return {
    userVersion: await readUserVersion(q),
    ledgerCount: tableCounts.ledger_entries ?? 0,
    paymentCount: tableCounts.payments ?? 0,
    memberCount: tableCounts.members ?? 0,
    periodCount: tableCounts.periods ?? 0,
    lastEntryDate: lastDate?.d ?? null,
    lastLedgerId: last?.id ?? null,
    kas: computeKasBalances(entries.map((e) => ({ direction: e.direction, amount: e.amount, account: e.account, toAccount: e.to_account }))),
    tableCounts,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Health check (integrity, foreign keys, invariants)
// ---------------------------------------------------------------------------------------------------------------

export interface HealthProblem {
  code: Extract<BackupErrorCode, 'integrity' | 'foreign_keys' | 'invariant'>;
  detail: string;
}

export interface HealthReport {
  ok: boolean;
  problems: HealthProblem[];
}

interface Invariant {
  id: string;
  sql: string;
  params?: readonly number[];
}

// Each query returns the violating rows; no rows = healthy. They mirror what the repositories guarantee, so a good
// database of ours never trips them. Corrected things are ignored the same way the repositories ignore them.
const INVARIANTS: readonly Invariant[] = [
  {
    id: 'week_paid_above_due',
    sql: `SELECT period_id, member_id, week FROM (
            SELECT period_id, member_id, week, SUM(amount) AS total FROM (
              SELECT period_id, member_id, week, amount FROM allocations
               WHERE payment_id NOT IN (SELECT payment_id FROM payment_reversals)
              UNION ALL
              SELECT period_id, member_id, week, amount FROM offset_credits o
               WHERE NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = o.ledger_entry_id)
              UNION ALL
              SELECT to_period_id, member_id, week, amount FROM credit_applications
            ) GROUP BY period_id, member_id, week
          ) WHERE total > ?`,
    params: [WEEKLY_DUE],
  },
  {
    id: 'two_host_payouts_in_force_for_one_week',
    sql: `SELECT period_id, week FROM ledger_entries e
           WHERE type = 'host_payout' AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id)
           GROUP BY period_id, week HAVING COUNT(*) > 1`,
  },
  {
    id: 'closed_period_with_open_meeting',
    sql: `SELECT p.id FROM periods p
           WHERE p.status = 'closed' AND EXISTS (SELECT 1 FROM weeks w WHERE w.period_id = p.id AND w.status = 'open')`,
  },
  {
    id: 'ledger_amount_not_positive_integer',
    sql: "SELECT id FROM ledger_entries WHERE typeof(amount) <> 'integer' OR amount <= 0",
  },
  {
    id: 'payment_amount_not_positive_integer',
    sql: "SELECT id FROM payments WHERE typeof(amount) <> 'integer' OR amount <= 0",
  },
  {
    id: 'allocation_amount_not_positive_integer',
    sql: "SELECT payment_id FROM allocations WHERE typeof(amount) <> 'integer' OR amount <= 0",
  },
  {
    id: 'payment_not_multiple_of_weekly_due',
    sql: "SELECT id FROM payments WHERE typeof(amount) = 'integer' AND amount % ? <> 0",
    params: [WEEKLY_DUE],
  },
  {
    id: 'meeting_count_differs_from_member_count',
    sql: `SELECT p.id FROM periods p WHERE (SELECT COUNT(*) FROM weeks w WHERE w.period_id = p.id) <> p.member_count`,
  },
];

/** Runs integrity_check, foreign_key_check and the invariants on a MIGRATED database. Read-only. */
export async function healthCheck(q: Queryable): Promise<HealthReport> {
  const problems: HealthProblem[] = [];

  const integrity = await q.getAll<Record<string, string>>('PRAGMA integrity_check');
  const messages = integrity.map((r) => Object.values(r)[0] ?? '');
  if (!(messages.length === 1 && messages[0] === 'ok')) {
    problems.push({ code: 'integrity', detail: `integrity_check: ${messages.slice(0, 3).join(' | ')}` });
  }

  const fk = await q.getAll<Record<string, unknown>>('PRAGMA foreign_key_check');
  if (fk.length > 0) problems.push({ code: 'foreign_keys', detail: `foreign_key_check: ${fk.length} violation(s)` });

  for (const inv of INVARIANTS) {
    const rows = await q.getAll<Record<string, unknown>>(inv.sql, inv.params ?? []);
    if (rows.length > 0) problems.push({ code: 'invariant', detail: `${inv.id}: ${rows.length} violation(s)` });
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------------------------------------------
// Backup file
// ---------------------------------------------------------------------------------------------------------------

/** Consistent bytes of the live database, taken while no transaction runs. Checked for a sane header. */
export async function createBackupSnapshot(bridge: NativeBridge, db: Db): Promise<{ bytes: Uint8Array; userVersion: number }> {
  return db.runExclusive(async () => {
    const bytes = await bridge.serializeLive();
    const header = inspectHeader(bytes, LATEST_VERSION);
    return { bytes, userVersion: header.userVersion };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Restore: prepare (steps 2-5)
// ---------------------------------------------------------------------------------------------------------------

export type RestoreInput = { kind: 'file'; bytes: Uint8Array } | { kind: 'empty' };

export interface PreparedRestore {
  source: 'file' | 'empty';
  /** The migrated copy, ready to replace the live data. Closed by commitRestore or discardRestore. */
  memory: MemoryDb;
  /** Version of the file before the copy was migrated (the latest version for an empty database). */
  originalVersion: number;
  candidate: DbSummary;
  live: DbSummary;
  classification: RestoreClassification;
  /** The latest schema, built from MIGRATIONS: what the live database must equal after the restore. */
  referenceSchema: SchemaObject[];
  state: 'ready' | 'committing' | 'done';
}

function unreadable(step: string, cause: unknown): BackupError {
  if (cause instanceof BackupError) return cause;
  return new BackupError('unreadable', `${step} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
}

/**
 * Steps 2 to 5. Reads and checks the file, opens it in memory, migrates THAT COPY, checks the copy and compares it
 * with the live data. The live database is only read. On any problem the memory copy is closed and a BackupError is thrown.
 */
export async function prepareRestore(bridge: NativeBridge, db: Db, input: RestoreInput): Promise<PreparedRestore> {
  let memory: MemoryDb | null = null;
  try {
    let originalVersion = LATEST_VERSION;
    if (input.kind === 'file') {
      // 2) structure: header, size, version (a bad file never reaches SQLite)
      originalVersion = inspectHeader(input.bytes, LATEST_VERSION).userVersion;
      // 3) open in memory
      try {
        memory = await bridge.openMemory(input.bytes);
      } catch (cause) {
        throw unreadable('opening the file', cause);
      }
      try {
        const schema = await readSchema(memory.db);
        const reference = await buildReferenceSchema(bridge, originalVersion);
        const missing = missingTables(reference, schema);
        if (missing.length > 0) throw new BackupError('tables_missing', `required tables are missing: ${missing.join(', ')}`);
        // Before anything of the file runs (migration SQL touches its tables), the file must look exactly like ours.
        const earlyDiff = diffSchema(reference, schema);
        if (earlyDiff.length > 0) throw new BackupError('schema_mismatch', `schema differs from version ${originalVersion}: ${earlyDiff.slice(0, 5).join('; ')}`);
        const pragmaVersion = await readUserVersion(memory.db);
        if (pragmaVersion !== originalVersion) throw new BackupError('unreadable', 'the version in the file header and in the database differ');
        await migrate(memory.db);
      } catch (cause) {
        throw unreadable('reading the file', cause);
      }
    } else {
      memory = await bridge.openMemory(null);
      await migrate(memory.db);
    }

    // 4) checks on the migrated copy
    const referenceSchema = await buildReferenceSchema(bridge, LATEST_VERSION);
    const diff = diffSchema(referenceSchema, await readSchema(memory.db));
    if (diff.length > 0) throw new BackupError('schema_mismatch', `schema differs after migration: ${diff.slice(0, 5).join('; ')}`);
    const health = await healthCheck(memory.db);
    const first = health.problems[0];
    if (first) throw new BackupError(first.code, first.detail);

    // 5) compare with the live data
    const [candidate, live, candidateIds, liveIds] = await Promise.all([
      summarizeDb(memory.db),
      summarizeDb(db),
      loadRecordIds(memory.db),
      loadRecordIds(db),
    ]);
    return {
      source: input.kind === 'file' ? 'file' : 'empty',
      memory,
      originalVersion,
      candidate,
      live,
      classification: classifyRestore(candidateIds, liveIds),
      referenceSchema,
      state: 'ready',
    };
  } catch (error) {
    if (memory) await closeQuietly(memory);
    throw error;
  }
}

/** Closes the memory copy without restoring (cancel). */
export async function discardRestore(prepared: PreparedRestore): Promise<void> {
  if (prepared.state === 'committing') return; // commitRestore closes it
  await closeQuietly(prepared.memory);
}

// ---------------------------------------------------------------------------------------------------------------
// Restore: commit (steps 6-7)
// ---------------------------------------------------------------------------------------------------------------

export interface RestoreOutcome {
  /** 'rolled_back' = the new data failed verification and the old data was put back automatically. */
  outcome: 'restored' | 'rolled_back';
  /** Name of the safety copy made before the restore (in the safety folder). */
  safetyName: string;
  rollbackReason: string | null;
  /** Old safety copies could not be removed (harmless; they just stay). */
  pruneFailed: boolean;
}

interface Expectation {
  summary: DbSummary;
  schema: SchemaObject[];
}

/** Step 7: the live database must be exactly what was meant to be copied in. Returns the differences. */
async function verifyLive(q: Queryable, expected: Expectation): Promise<string[]> {
  const problems: string[] = [];
  const version = await readUserVersion(q);
  if (version !== expected.summary.userVersion) problems.push(`user_version ${version}, expected ${expected.summary.userVersion}`);

  const summary = await summarizeDb(q);
  const differing = diffTableCounts(expected.summary.tableCounts, summary.tableCounts);
  if (differing.length > 0) problems.push(`row counts differ in: ${differing.join(', ')}`);
  if (summary.lastLedgerId !== expected.summary.lastLedgerId) problems.push('last ledger entry differs');

  const schemaDiff = diffSchema(expected.schema, await readSchema(q));
  if (schemaDiff.length > 0) problems.push(`schema differs: ${schemaDiff.slice(0, 3).join('; ')}`);

  // foreign_keys is a setting of the connection, not of the file; it should survive the copy. If it does not,
  // switching it on again is a connection fix, not a data fix; a second look decides.
  let fk = (await q.getFirst<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys ?? 0;
  if (fk !== 1) {
    await q.exec('PRAGMA foreign_keys = ON');
    fk = (await q.getFirst<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys ?? 0;
    if (fk !== 1) problems.push('foreign_keys is off');
  }

  const integrity = await q.getAll<Record<string, string>>('PRAGMA integrity_check');
  if (!(integrity.length === 1 && Object.values(integrity[0] ?? {})[0] === 'ok')) problems.push('integrity_check failed');
  return problems;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function closeQuietly(memory: MemoryDb): Promise<void> {
  try {
    await memory.close();
  } catch {
    console.warn('could not close a temporary in-memory database');
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

async function bestEffortRemove(store: SafetyStore, name: string): Promise<void> {
  try {
    await store.remove(name);
  } catch {
    // Cleaning up a leftover temp file must not hide the real error that is being reported.
  }
}

/**
 * Steps 6 and 7. Everything runs inside db.runExclusive, so no transaction and no other query interleaves.
 * - A failure BEFORE the live data is touched (safety copy cannot be written or verified) throws and changes nothing.
 * - A failure AFTER (copy error, or verification differs) restores the safety copy automatically and reports
 *   'rolled_back'. Only if that recovery also fails does it throw a restore_failed error.
 * The memory copies are closed in the end, whatever happened.
 */
export async function commitRestore(
  bridge: NativeBridge,
  db: Db,
  prepared: PreparedRestore,
  store: SafetyStore,
  now: () => Date = () => new Date(),
): Promise<RestoreOutcome> {
  if (prepared.state !== 'ready') throw new BackupError('busy', 'this restore was already started');
  prepared.state = 'committing';
  // The verified safety copy opened in memory (also the source of an automatic recovery). Closed in the end.
  const snapshots: MemoryDb[] = [];
  try {
    const result = await db.runExclusive(async (): Promise<RestoreOutcome> => {
      const q = bridge.liveRaw;

      // 6a) safety copy: serialize, write to a temp name, read back, verify, then rename into place
      const liveBytes = await bridge.serializeLive();
      const before: Expectation = { summary: await summarizeDb(q), schema: await readSchema(q) };
      const holdsRecords = before.summary.ledgerCount + before.summary.paymentCount + before.summary.memberCount + before.summary.periodCount > 0;
      const safetyName = safetyFileName(now(), before.summary.userVersion, !holdsRecords);
      try {
        inspectHeader(liveBytes, LATEST_VERSION);
        await store.writeTemp(SAFETY_TEMP_NAME, liveBytes);
        const readBack = await store.readBytes(SAFETY_TEMP_NAME);
        if (readBack.length !== liveBytes.length) throw new Error('the safety copy read back with a different size');
        if (!bytesEqual(readBack, liveBytes)) throw new Error('the safety copy read back with different content');
        const snapshot = await bridge.openMemory(readBack);
        snapshots.push(snapshot);
        const integrity = await snapshot.db.getAll<Record<string, string>>('PRAGMA integrity_check');
        if (!(integrity.length === 1 && Object.values(integrity[0] ?? {})[0] === 'ok')) throw new Error('the safety copy failed integrity_check');
        const copy = await summarizeDb(snapshot.db);
        const differing = diffTableCounts(before.summary.tableCounts, copy.tableCounts);
        if (differing.length > 0) throw new Error(`the safety copy has different row counts in: ${differing.join(', ')}`);
        if (copy.userVersion !== before.summary.userVersion) throw new Error('the safety copy has a different version');
        await store.rename(SAFETY_TEMP_NAME, safetyName);
      } catch (cause) {
        await bestEffortRemove(store, SAFETY_TEMP_NAME);
        throw new BackupError('safety_failed', `could not make a verified safety copy: ${errorText(cause)}`);
      }

      // 6b) replace the live data, 7) verify, recover on any difference
      const wanted: Expectation = { summary: prepared.candidate, schema: prepared.referenceSchema };
      let rollbackReason: string | null = null;
      try {
        await bridge.copyIntoLive(prepared.memory);
        const problems = await verifyLive(q, wanted);
        if (problems.length > 0) throw new Error(problems.join('; '));
      } catch (cause) {
        rollbackReason = errorText(cause);
        try {
          const snapshot = snapshots[0];
          if (!snapshot) throw new Error('no verified safety copy in memory');
          await bridge.copyIntoLive(snapshot);
          const problems = await verifyLive(q, before);
          if (problems.length > 0) throw new Error(problems.join('; '));
        } catch (recoveryCause) {
          throw new BackupError('restore_failed', `the restore failed (${rollbackReason}) and putting the old data back failed too (${errorText(recoveryCause)}); the safety copy was kept`);
        }
      }

      // Keep the newest safety copies only (a failure here is reported, never fatal). After a rollback nothing is
      // pruned: the old data is back, and the owner may want every copy to look at what went wrong.
      let pruneFailed = false;
      if (rollbackReason === null) {
        try {
          for (const name of safetyToPrune(await store.list())) await store.remove(name);
        } catch {
          pruneFailed = true;
        }
      }
      return { outcome: rollbackReason === null ? 'restored' : 'rolled_back', safetyName, rollbackReason, pruneFailed };
    });
    prepared.state = 'done';
    return result;
  } finally {
    prepared.state = 'done';
    // Closing a memory database must never hide the result (the live data may already have changed).
    for (const memory of [...snapshots, prepared.memory]) await closeQuietly(memory);
  }
}
