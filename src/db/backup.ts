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
// A "restore in progress" marker (L6) is written after the safety copy is in place and before the live data is touched,
// and removed only after the result was verified. A marker found at the next start means the swap did not finish.
import { computeKasBalances } from '@/domain/kas';
import { WEEKLY_DUE } from '@/domain/money';
import {
  BackupError,
  cashCountRecordId,
  classifyRestore,
  diffSchema,
  diffTableCounts,
  inspectHeader,
  missingTables,
  RESTORE_MARKER_TEMP_NAME,
  safetyFileName,
  safetyToPrune,
  SAFETY_TEMP_NAME,
  SCHEMA_FINGERPRINT_SQL,
  type BackupErrorCode,
  type DbSummary,
  type RestoreClassification,
  type RestoreMarker,
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

/** The only thing the checks on a file or a safety copy need from the bridge: a way to open an in-memory database. */
export type MemoryOpener = Pick<NativeBridge, 'openMemory'>;

export interface SafetyStore {
  writeTemp(name: string, bytes: Uint8Array): Promise<void>;
  readBytes(name: string): Promise<Uint8Array>;
  rename(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Names of the files in the safety folder (any name; the caller filters). */
  list(): Promise<string[]>;
  /**
   * The "restore in progress" marker lives in the same folder but is NOT a safety copy (its name never matches
   * isSafetyFileName). writeMarker must be atomic: write a temp file, read it back and parse it, then rename it into
   * place, so a crash leaves either no marker or a whole one.
   */
  writeMarker(marker: RestoreMarker): Promise<void>;
  /** null = no marker, 'corrupt' = a marker file exists but cannot be read or parsed (treated as present). */
  readMarker(): Promise<RestoreMarker | null | 'corrupt'>;
  clearMarker(): Promise<void>;
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
export async function buildReferenceSchema(bridge: MemoryOpener, version: number): Promise<SchemaObject[]> {
  const scratch = await bridge.openMemory(null);
  try {
    await migrate(scratch.db, MIGRATIONS.slice(0, version));
    return await readSchema(scratch.db);
  } finally {
    await closeQuietly(scratch);
  }
}

/**
 * Ids of all ledger entries, payments, skips (S:), skip undos (U:, by skip id), cash counts (C:, by batch id and row id),
 * members (M:) and periods (T:), prefixed so the kinds never collide.
 * Skips and undos MUST be here: without them a backup from before a skip would look "the same" as the live data.
 * Members and periods are here so a member or period added after the backup counts as lost by the restore.
 */
export async function loadRecordIds(q: Queryable): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const r of await q.getAll<{ id: string }>('SELECT id FROM ledger_entries')) ids.add(`L:${r.id}`);
  for (const r of await q.getAll<{ id: string }>('SELECT id FROM payments')) ids.add(`P:${r.id}`);
  for (const r of await q.getAll<{ id: string }>('SELECT id FROM week_skips')) ids.add(`S:${r.id}`);
  for (const r of await q.getAll<{ skip_id: string }>('SELECT skip_id FROM week_skip_undos')) ids.add(`U:${r.skip_id}`);
  for (const r of await q.getAll<{ id: string; batch_id: string }>('SELECT id, batch_id FROM cash_counts')) ids.add(cashCountRecordId(r.batch_id, r.id));
  for (const r of await q.getAll<{ id: string }>('SELECT id FROM members')) ids.add(`M:${r.id}`);
  for (const r of await q.getAll<{ id: string }>('SELECT id FROM periods')) ids.add(`T:${r.id}`);
  return ids;
}

/**
 * State that changes without a new ledger entry or payment: meeting status, host and date; period status, dates and name;
 * member name and archived flag. One key per row, the value is the JSON of a fixed tuple, so two sides are equal exactly when
 * the strings are equal. No raw timestamps (closed_at, archived_at: only a flag), no dependence on row order.
 */
export async function loadStateFingerprints(q: Queryable): Promise<Map<string, string>> {
  const state = new Map<string, string>();
  const weeks = await q.getAll<{ period_id: string; number: number; status: string; host_member_id: string | null; date: string }>(
    'SELECT period_id, number, status, host_member_id, date FROM weeks',
  );
  for (const w of weeks) state.set(`W:${w.period_id}|${w.number}`, JSON.stringify([w.status, w.host_member_id, w.date]));
  const periods = await q.getAll<{ id: string; status: string; start_date: string; end_date: string | null; name: string }>(
    'SELECT id, status, start_date, end_date, name FROM periods',
  );
  for (const p of periods) state.set(`T:${p.id}`, JSON.stringify([p.status, p.start_date, p.end_date, p.name]));
  const members = await q.getAll<{ id: string; name: string; archived: number }>(
    'SELECT id, name, CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END AS archived FROM members',
  );
  for (const m of members) state.set(`M:${m.id}`, JSON.stringify([m.name, m.archived === 1 ? 1 : 0]));
  return state;
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
  const batches = await q.getFirst<{ n: number }>('SELECT COUNT(DISTINCT batch_id) AS n FROM cash_counts');
  const lastDate = await q.getFirst<{ d: string | null }>('SELECT MAX(date) AS d FROM ledger_entries');
  return {
    userVersion: await readUserVersion(q),
    ledgerCount: tableCounts.ledger_entries ?? 0,
    paymentCount: tableCounts.payments ?? 0,
    cashCountBatches: batches?.n ?? 0,
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
  {
    id: 'cash_count_inconsistent',
    sql: `SELECT id FROM cash_counts
           WHERE typeof(expected) <> 'integer' OR typeof(counted) <> 'integer' OR typeof(difference) <> 'integer'
              OR counted < 0 OR difference <> counted - expected OR account NOT IN ('tunai', 'debit')`,
  },
  {
    id: 'two_skips_in_force_for_one_week',
    sql: 'SELECT period_id, week FROM skipped_weeks GROUP BY period_id, week HAVING COUNT(*) > 1',
  },
  {
    id: 'skip_not_last_meeting',
    sql: 'SELECT s.id FROM week_skips s JOIN periods p ON p.id = s.period_id WHERE s.week <> p.member_count',
  },
  {
    id: 'skip_with_open_earlier_meeting',
    sql: `SELECT k.skip_id FROM skipped_weeks k
           WHERE EXISTS (SELECT 1 FROM weeks w WHERE w.period_id = k.period_id AND w.number < k.week AND w.status <> 'closed')`,
  },
  {
    id: 'skip_with_host_payout_in_force',
    sql: `SELECT k.skip_id FROM skipped_weeks k
           WHERE EXISTS (SELECT 1 FROM ledger_entries e
                          WHERE e.period_id = k.period_id AND e.week = k.week AND e.type IN ('host_payout', 'host_offset')
                            AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id))`,
  },
  {
    id: 'skipped_week_closed_in_active_period',
    sql: `SELECT k.skip_id FROM skipped_weeks k
            JOIN periods p ON p.id = k.period_id
            JOIN weeks w ON w.period_id = k.period_id AND w.number = k.week
           WHERE p.status = 'active' AND w.status = 'closed'`,
  },
  {
    // Same arithmetic as loadAvailableCredit (src/db/creditBalance.ts): received - allocated - applied - refunded + released offsets.
    id: 'member_credit_negative',
    sql: `SELECT period_id, member_id FROM (
            SELECT pm.period_id, pm.member_id,
              COALESCE((SELECT SUM(p.amount) FROM payments p
                         WHERE p.period_id = pm.period_id AND p.member_id = pm.member_id
                           AND p.id NOT IN (SELECT payment_id FROM payment_reversals)), 0)
              - COALESCE((SELECT SUM(a.amount) FROM allocations a
                           WHERE a.period_id = pm.period_id AND a.member_id = pm.member_id
                             AND a.payment_id NOT IN (SELECT payment_id FROM payment_reversals)
                             AND NOT EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = a.period_id AND k.week = a.week)), 0)
              - COALESCE((SELECT SUM(c.amount) FROM credit_applications c
                           WHERE c.from_period_id = pm.period_id AND c.member_id = pm.member_id
                             AND NOT EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = c.to_period_id AND k.week = c.week)), 0)
              - COALESCE((SELECT SUM(e.amount) FROM ledger_entries e
                           WHERE e.type = 'credit_refund' AND e.period_id = pm.period_id AND e.member_id = pm.member_id), 0)
              + COALESCE((SELECT SUM(o.amount) FROM offset_credits o
                           WHERE o.period_id = pm.period_id AND o.member_id = pm.member_id
                             AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = o.ledger_entry_id)
                             AND EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = o.period_id AND k.week = o.week)), 0)
              AS credit
            FROM period_members pm
          ) WHERE credit < 0`,
  },
  {
    id: 'archived_member_in_active_period',
    sql: `SELECT m.id FROM members m
           WHERE m.archived_at IS NOT NULL
             AND EXISTS (SELECT 1 FROM period_members pm JOIN periods p ON p.id = pm.period_id
                          WHERE pm.member_id = m.id AND p.status = 'active')`,
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

export interface BackupSnapshot {
  bytes: Uint8Array;
  userVersion: number;
  /** Health of the live data at the moment of the backup. Never blocks the backup: the file may be the only proof of the data. */
  health: HealthReport;
}

/** Consistent bytes of the live database, taken while no transaction runs. Checked for a sane header, and the live data is health-checked (M2). */
export async function createBackupSnapshot(bridge: NativeBridge, db: Db): Promise<BackupSnapshot> {
  return db.runExclusive(async () => {
    let health: HealthReport;
    try {
      health = await healthCheck(bridge.liveRaw);
    } catch (cause) {
      // A check that cannot run is itself a warning; the backup still goes ahead.
      health = { ok: false, problems: [{ code: 'integrity', detail: `the health check could not run: ${errorText(cause)}` }] };
    }
    const bytes = await bridge.serializeLive();
    const header = inspectHeader(bytes, LATEST_VERSION);
    return { bytes, userVersion: header.userVersion, health };
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
export async function prepareRestore(bridge: MemoryOpener, db: Db, input: RestoreInput): Promise<PreparedRestore> {
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
    const [candidate, live, candidateIds, liveIds, candidateState, liveState] = await Promise.all([
      summarizeDb(memory.db),
      summarizeDb(db),
      loadRecordIds(memory.db),
      loadRecordIds(db),
      loadStateFingerprints(memory.db),
      loadStateFingerprints(db),
    ]);
    return {
      source: input.kind === 'file' ? 'file' : 'empty',
      memory,
      originalVersion,
      candidate,
      live,
      classification: classifyRestore(candidateIds, liveIds, candidateState, liveState),
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
  /**
   * The "restore in progress" marker of this attempt is gone (or, after a rollback with `restoreMarkerAfter`, replaced by that
   * marker). false = it is still standing after one retry: the next start may show the recovery screen although nothing is wrong.
   */
  markerCleared: boolean;
}

export interface CommitOptions {
  /**
   * The marker of an earlier unfinished restore (recovery screen, another file). After a rollback or a failed restore it is
   * written back OVER the marker of this attempt, so there is no moment without a marker. Without it the marker is removed.
   */
  restoreMarkerAfter?: RestoreMarker;
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

/** Tries twice. false = the marker is still there: the caller tells the owner (see MARKER_NOT_CLEARED_TEXT). */
async function clearMarkerQuietly(store: SafetyStore): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await store.clearMarker();
      return true;
    } catch {
      // The restore itself succeeded: a marker that cannot be removed must not turn that into a failure. The next start
      // will find it and offer the safety copy, so the owner is told instead of being left unaware.
    }
  }
  console.warn('could not remove the restore marker');
  return false;
}

/** Writes an older marker back (tries twice). The write is atomic, so a marker is always standing. */
async function writeMarkerQuietly(store: SafetyStore, marker: RestoreMarker): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await store.writeMarker(marker);
      return true;
    } catch {
      // Tried again, then reported by the caller.
    }
  }
  console.warn('could not write the restore marker back');
  return false;
}

/**
 * `liveBytes` were taken by the caller. Writes them to the temp name, reads them back, opens the read-back copy in memory
 * (pushed on `keep`, the caller closes it), checks integrity, row counts and version, then renames the temp file to `name`.
 * Throws on any problem; the caller removes the temp file.
 */
async function writeVerifiedSafetyCopy(
  bridge: MemoryOpener,
  store: SafetyStore,
  liveBytes: Uint8Array,
  summary: DbSummary,
  name: string,
  keep: MemoryDb[],
): Promise<void> {
  inspectHeader(liveBytes, LATEST_VERSION);
  await store.writeTemp(SAFETY_TEMP_NAME, liveBytes);
  const readBack = await store.readBytes(SAFETY_TEMP_NAME);
  if (readBack.length !== liveBytes.length) throw new Error('the safety copy read back with a different size');
  if (!bytesEqual(readBack, liveBytes)) throw new Error('the safety copy read back with different content');
  const snapshot = await bridge.openMemory(readBack);
  keep.push(snapshot);
  const integrity = await snapshot.db.getAll<Record<string, string>>('PRAGMA integrity_check');
  if (!(integrity.length === 1 && Object.values(integrity[0] ?? {})[0] === 'ok')) throw new Error('the safety copy failed integrity_check');
  const copy = await summarizeDb(snapshot.db);
  const differing = diffTableCounts(summary.tableCounts, copy.tableCounts);
  if (differing.length > 0) throw new Error(`the safety copy has different row counts in: ${differing.join(', ')}`);
  if (copy.userVersion !== summary.userVersion) throw new Error('the safety copy has a different version');
  await store.rename(SAFETY_TEMP_NAME, name);
}

const holdsRecords = (s: DbSummary) => s.ledgerCount + s.paymentCount + s.memberCount + s.periodCount > 0;

/** Removes old safety copies, never the one a marker points at; with an unreadable marker nothing is removed. */
async function pruneSafetyCopies(store: SafetyStore, justMade: string, alsoKeep: readonly string[] = []): Promise<void> {
  const marker = await store.readMarker();
  if (marker === 'corrupt') return;
  const protectedNames = new Set([justMade, ...alsoKeep, ...(marker ? [marker.safetyName] : [])]);
  for (const name of safetyToPrune(await store.list())) {
    if (!protectedNames.has(name)) await store.remove(name);
  }
}

/**
 * Steps 6 and 7. Everything runs inside db.runExclusive, so no transaction and no other query interleaves.
 * - A failure BEFORE the live data is touched (live data cannot be read, or the safety copy or the marker cannot be
 *   written or verified) throws `safety_failed` and changes nothing.
 * - A failure AFTER (copy error, or verification differs) restores the safety copy automatically and reports
 *   'rolled_back'. Only if that recovery also fails does it throw a restore_failed error; then the marker stays.
 * - The marker is written after the safety copy is in place and before the first byte of the live data is replaced, and
 *   removed only after the live data was verified (the new data, or the old data after a rollback).
 * The memory copies are closed in the end, whatever happened.
 */
export async function commitRestore(
  bridge: NativeBridge,
  db: Db,
  prepared: PreparedRestore,
  store: SafetyStore,
  now: () => Date = () => new Date(),
  options: CommitOptions = {},
): Promise<RestoreOutcome> {
  if (prepared.state !== 'ready') throw new BackupError('busy', 'this restore was already started');
  prepared.state = 'committing';
  // The verified safety copy opened in memory (also the source of an automatic recovery). Closed in the end.
  const snapshots: MemoryDb[] = [];
  try {
    const result = await db.runExclusive(async (): Promise<RestoreOutcome> => {
      const q = bridge.liveRaw;

      // 6a) safety copy: serialize, write to a temp name, read back, verify, then rename into place; then the marker
      // Boundary: every failure up to and including the marker write below is classified `safety_failed`. Until the
      // marker is in place only reads and temp files happen, so the live data cannot have changed. Nothing after
      // it is ever classified `safety_failed`.
      let before: Expectation;
      let safetyName: string;
      let marker: RestoreMarker;
      try {
        const liveBytes = await bridge.serializeLive();
        before = { summary: await summarizeDb(q), schema: await readSchema(q) };
        safetyName = safetyFileName(now(), before.summary.userVersion, !holdsRecords(before.summary));
        await writeVerifiedSafetyCopy(bridge, store, liveBytes, before.summary, safetyName, snapshots);
        marker = {
          v: 1,
          kind: prepared.source === 'empty' ? 'reset' : 'restore',
          stage: 'swapping',
          safetyName,
          startedAt: now().toISOString(),
          before: { userVersion: before.summary.userVersion, ledgerCount: before.summary.ledgerCount, lastLedgerId: before.summary.lastLedgerId },
          after: {
            userVersion: prepared.candidate.userVersion,
            ledgerCount: prepared.candidate.ledgerCount,
            lastLedgerId: prepared.candidate.lastLedgerId,
            tableCounts: prepared.candidate.tableCounts,
          },
        };
        try {
          await store.writeMarker(marker);
        } catch (markerCause) {
          // A marker of THIS attempt that is half there is removed; an older marker (from an unfinished restore) is left alone.
          try {
            const found = await store.readMarker();
            if (found !== null && found !== 'corrupt' && found.startedAt === marker.startedAt) await store.clearMarker();
          } catch {
            // Nothing more to do; the original error is reported.
          }
          throw markerCause;
        }
      } catch (cause) {
        await bestEffortRemove(store, SAFETY_TEMP_NAME);
        await bestEffortRemove(store, RESTORE_MARKER_TEMP_NAME);
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
          try {
            await store.writeMarker({ ...marker, stage: 'recovering' });
          } catch {
            // Informational only: the marker is already there, and recovery works the same in both stages.
          }
          await bridge.copyIntoLive(snapshot);
          const problems = await verifyLive(q, before);
          if (problems.length > 0) throw new Error(problems.join('; '));
        } catch (recoveryCause) {
          // The marker is NOT removed: the next start must offer the safety copy.
          // The marker of this attempt points at a copy of the state BEFORE this attempt (which may itself be the half replaced
          // data of the unfinished restore). The older marker points at the better copy, so it goes back on top, best effort.
          if (options.restoreMarkerAfter) await writeMarkerQuietly(store, options.restoreMarkerAfter);
          throw new BackupError('restore_failed', `the restore failed (${rollbackReason}) and putting the old data back failed too (${errorText(recoveryCause)}); the safety copy was kept`);
        }
      }

      // The live data is verified (new data, or the old data after a rollback): the restore is no longer "in progress".
      // After a rollback with an older unfinished marker, that marker replaces this one directly (no gap without a marker).
      const markerCleared =
        rollbackReason !== null && options.restoreMarkerAfter
          ? await writeMarkerQuietly(store, options.restoreMarkerAfter)
          : await clearMarkerQuietly(store);

      // Keep the newest safety copies only (a failure here is reported, never fatal). After a rollback nothing is
      // pruned: the old data is back, and the owner may want every copy to look at what went wrong.
      let pruneFailed = false;
      if (rollbackReason === null) {
        try {
          await pruneSafetyCopies(store, safetyName);
        } catch {
          pruneFailed = true;
        }
      }
      return { outcome: rollbackReason === null ? 'restored' : 'rolled_back', safetyName, rollbackReason, pruneFailed, markerCleared };
    });
    prepared.state = 'done';
    return result;
  } finally {
    prepared.state = 'done';
    // Closing a memory database must never hide the result (the live data may already have changed).
    for (const memory of [...snapshots, prepared.memory]) await closeQuietly(memory);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Restore in progress: look at the marker at start, put the safety copy back
// ---------------------------------------------------------------------------------------------------------------

export type MarkerInspection = { state: 'none' } | { state: 'found'; marker: RestoreMarker } | { state: 'corrupt' };

/**
 * Called once at app start, after the database is open. Leftover temp files are removed (the marker temp file and the safety
 * temp file can only mean the crash came while they were being written, before the live data was touched). An unreadable
 * marker counts as present: when in doubt the app stays blocked.
 */
export async function inspectRestoreMarker(store: SafetyStore): Promise<MarkerInspection> {
  await bestEffortRemove(store, RESTORE_MARKER_TEMP_NAME);
  await bestEffortRemove(store, SAFETY_TEMP_NAME);
  const marker = await store.readMarker();
  if (marker === null) return { state: 'none' };
  if (marker === 'corrupt') return { state: 'corrupt' };
  return { state: 'found', marker };
}

/**
 * Reads the safety copy named in the marker into memory and checks it (header, integrity, the counts the marker recorded,
 * schema; an older copy is migrated in memory). Touches nothing else: no live data is needed, so the recovery screen can run it
 * BEFORE it deletes a database file that cannot be opened. Throws `safety_missing`; the memory copy is closed on any problem.
 * On success the caller owns the returned memory copy and closes it.
 */
export async function loadRecoveryCopy(bridge: MemoryOpener, store: SafetyStore, marker: RestoreMarker): Promise<MemoryDb> {
  let memory: MemoryDb | null = null;
  try {
    let bytes: Uint8Array;
    try {
      bytes = await store.readBytes(marker.safetyName);
    } catch (cause) {
      throw new BackupError('safety_missing', `the safety copy cannot be read: ${errorText(cause)}`);
    }
    try {
      inspectHeader(bytes, LATEST_VERSION);
      memory = await bridge.openMemory(bytes);
      const integrity = await memory.db.getAll<Record<string, string>>('PRAGMA integrity_check');
      if (!(integrity.length === 1 && Object.values(integrity[0] ?? {})[0] === 'ok')) throw new Error('the safety copy failed integrity_check');
      const copy = await summarizeDb(memory.db);
      if (copy.userVersion !== marker.before.userVersion) throw new Error('the safety copy has a different version than the marker says');
      if (copy.ledgerCount !== marker.before.ledgerCount) throw new Error('the safety copy has a different number of ledger entries than the marker says');
      if (copy.lastLedgerId !== marker.before.lastLedgerId) throw new Error('the safety copy has a different last ledger entry than the marker says');
      if (copy.userVersion < LATEST_VERSION) await migrate(memory.db);
      const reference = await buildReferenceSchema(bridge, LATEST_VERSION);
      const diff = diffSchema(reference, await readSchema(memory.db));
      if (diff.length > 0) throw new Error(`the safety copy has a different schema: ${diff.slice(0, 3).join('; ')}`);
    } catch (cause) {
      throw new BackupError('safety_missing', `the safety copy cannot be used: ${errorText(cause)}`);
    }
    return memory;
  } catch (error) {
    if (memory) await closeQuietly(memory);
    throw error;
  }
}

export interface RecoveryOutcome {
  /**
   * Name of the safety copy made of the data that was in the phone just before it was overwritten (a restore that did finish,
   * with new records after it, would otherwise be lost). null = the live data could not be read, or held no records.
   */
  previousCopyName: string | null;
  /** The readable live data matched neither the state before nor the state after the unfinished restore (marker.before / marker.after). */
  liveDiffers: boolean;
  /** false = the marker is still standing after one retry (the next start shows the recovery screen again). */
  markerCleared: boolean;
}

const sameState = (s: DbSummary, ref: { userVersion: number; ledgerCount: number; lastLedgerId: string | null }) =>
  s.userVersion === ref.userVersion && s.ledgerCount === ref.ledgerCount && s.lastLedgerId === ref.lastLedgerId;

/** A safety copy name that does not exist yet (the same second twice would otherwise overwrite a copy, maybe the source). */
async function freshSafetyName(store: SafetyStore, userVersion: number, now: () => Date): Promise<string> {
  const existing = new Set(await store.list());
  const base = now().getTime();
  for (let i = 0; i < 60; i += 1) {
    const name = safetyFileName(new Date(base + i * 1000), userVersion, false);
    if (!existing.has(name)) return name;
  }
  throw new Error('no free safety copy name');
}

/**
 * Puts a checked recovery copy (see loadRecoveryCopy) into the live database. Does NOT close `source`.
 * Before anything is overwritten: if the live data can be read and holds records, a verified safety copy of it is made first
 * (best effort only when the live data cannot be read at all, the usual case after a crash). A copy that cannot be made while the
 * live data IS readable stops the recovery with `safety_failed`: overwriting would be the only copy of that data.
 */
export async function applyRecoveryCopy(
  bridge: NativeBridge,
  db: Db,
  store: SafetyStore,
  marker: RestoreMarker,
  source: MemoryDb,
  now: () => Date = () => new Date(),
): Promise<RecoveryOutcome> {
  return db.runExclusive(async (): Promise<RecoveryOutcome> => {
    const q = bridge.liveRaw;

    // 1) what is in the phone right now
    let live: DbSummary | null = null;
    let liveBytes: Uint8Array | null = null;
    try {
      const integrity = await q.getAll<Record<string, string>>('PRAGMA integrity_check');
      if (!(integrity.length === 1 && Object.values(integrity[0] ?? {})[0] === 'ok')) throw new Error('integrity_check failed');
      live = await summarizeDb(q);
      liveBytes = await bridge.serializeLive();
    } catch {
      live = null; // not readable: nothing to protect, the recovery goes ahead
      liveBytes = null;
    }

    // 2) a verified safety copy of it, before it is overwritten
    let previousCopyName: string | null = null;
    let liveDiffers = false;
    if (live && liveBytes) {
      const isAfter = sameState(live, marker.after) && diffTableCounts(marker.after.tableCounts, live.tableCounts).length === 0;
      liveDiffers = !sameState(live, marker.before) && !isAfter;
      if (holdsRecords(live)) {
        const snapshots: MemoryDb[] = [];
        try {
          const name = await freshSafetyName(store, live.userVersion, now);
          await writeVerifiedSafetyCopy(bridge, store, liveBytes, live, name, snapshots);
          previousCopyName = name;
        } catch (cause) {
          await bestEffortRemove(store, SAFETY_TEMP_NAME);
          throw new BackupError('safety_failed', `could not make a verified safety copy of the current data: ${errorText(cause)}`);
        } finally {
          for (const memory of snapshots) await closeQuietly(memory);
        }
      }
    }

    // 3) copy the recovery copy in, verify
    const wanted: Expectation = { summary: await summarizeDb(source.db), schema: await readSchema(source.db) };
    try {
      await bridge.copyIntoLive(source);
      const problems = await verifyLive(q, wanted);
      if (problems.length > 0) throw new Error(problems.join('; '));
    } catch (cause) {
      // The marker stays: the live data is not known to be good.
      throw new BackupError('restore_failed', `putting the safety copy back failed: ${errorText(cause)}`);
    }
    const markerCleared = await clearMarkerQuietly(store);

    // 4) tidy up; the copy that was just used and the new one are never removed (a failure here is harmless)
    if (previousCopyName) {
      try {
        await pruneSafetyCopies(store, previousCopyName, [marker.safetyName]);
      } catch {
        console.warn('could not remove old safety copies');
      }
    }
    return { previousCopyName, liveDiffers, markerCleared };
  });
}

/**
 * Puts the safety copy named in the marker back as the live data. The copy is read into memory FIRST (loadRecoveryCopy), so
 * nothing that happens to the folder afterwards (rotation, pruning) can pull the source away. The copy must pass the checks and
 * match what the marker recorded for the data before the restore; otherwise nothing is touched and the marker stays.
 * Idempotent: running it again after a crash gives the same result. The marker is removed only after the live data was verified.
 */
export async function recoverFromMarker(
  bridge: NativeBridge,
  db: Db,
  store: SafetyStore,
  marker: RestoreMarker,
  now: () => Date = () => new Date(),
): Promise<RecoveryOutcome> {
  const source = await loadRecoveryCopy(bridge, store, marker);
  try {
    return await applyRecoveryCopy(bridge, db, store, marker, source, now);
  } finally {
    await closeQuietly(source);
  }
}
