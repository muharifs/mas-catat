// Pure rules for backup and restore (M7). No database, no file system, no native code: everything here is
// decided from bytes, names, numbers and id sets, so it is fully testable in Node.
//
// Policy (owner): restore REPLACES all data. There is never a merge. A backup newer than this app is refused.
// The app never runs SQL taken from a file. A file is only ever opened by SQLite itself (deserialize), checked,
// migrated as a copy in memory, and compared with a reference schema built from our own migrations.
import type { KasBalances } from './kas';
import type { IsoDate } from './types';

export type BackupErrorCode =
  | 'file_empty'
  | 'file_too_small'
  | 'file_too_large'
  | 'not_sqlite'
  | 'size_mismatch'
  | 'version_missing'
  | 'version_newer'
  | 'tables_missing'
  | 'schema_mismatch'
  | 'integrity'
  | 'foreign_keys'
  | 'invariant'
  | 'unreadable'
  | 'busy'
  | 'safety_failed'
  | 'restore_failed'
  | 'safety_missing'
  | 'share_unavailable';

/** Backup/restore problem. `message` is English for logs (no file paths); the UI maps `code` to Indonesian. */
export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

/**
 * Replacing a database file that cannot be opened failed. `afterDelete` tells the recovery screen how far it got:
 * false = the old file is still where it was (nothing was deleted), true = it was deleted (the new empty file may be missing).
 */
export class DamagedDatabaseError extends Error {
  constructor(
    public readonly afterDelete: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'DamagedDatabaseError';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// File checks (before anything is opened)
// ---------------------------------------------------------------------------------------------------------------

export const MIN_BACKUP_BYTES = 100;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/** Judged on file.size BEFORE the bytes are read. The MIME type is never trusted. */
export function checkFileSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) throw new BackupError('file_empty', 'the file is empty');
  if (size < MIN_BACKUP_BYTES) throw new BackupError('file_too_small', `the file is too small to be a database (${size} bytes)`);
  if (size > MAX_BACKUP_BYTES) throw new BackupError('file_too_large', `the file is larger than ${MAX_BACKUP_BYTES} bytes`);
}

export interface SqliteHeader {
  pageSize: number;
  pageCount: number;
  userVersion: number;
}

/**
 * Structural check of the SQLite file header (https://www.sqlite.org/fileformat.html):
 * magic string, size = page count x page size (page size at bytes 16-17, page count at bytes 28-31), and
 * user_version (bytes 60-63) from 1 up to `latestVersion`. Version 0 and newer versions are refused.
 */
export function inspectHeader(bytes: Uint8Array, latestVersion: number): SqliteHeader {
  checkFileSize(bytes.length);
  for (let i = 0; i < SQLITE_MAGIC.length; i += 1) {
    if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) throw new BackupError('not_sqlite', 'the file is not a SQLite database');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawPageSize = view.getUint16(16, false);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const validPageSize = pageSize >= 512 && pageSize <= 65536 && (pageSize & (pageSize - 1)) === 0;
  if (!validPageSize) throw new BackupError('not_sqlite', `invalid page size ${rawPageSize}`);
  const pageCount = view.getUint32(28, false);
  if (pageCount === 0 || pageCount * pageSize !== bytes.length) {
    throw new BackupError('size_mismatch', `file size ${bytes.length} does not match ${pageCount} pages of ${pageSize} bytes`);
  }
  const userVersion = view.getInt32(60, false);
  if (userVersion < 1) throw new BackupError('version_missing', `database version ${userVersion} is not a Mas Catat version`);
  if (userVersion > latestVersion) {
    throw new BackupError('version_newer', `database version ${userVersion} is newer than this app supports (${latestVersion})`);
  }
  return { pageSize, pageCount, userVersion };
}

// ---------------------------------------------------------------------------------------------------------------
// Schema fingerprint
// ---------------------------------------------------------------------------------------------------------------

/** One row of: SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name. */
export interface SchemaObject {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

export const SCHEMA_FINGERPRINT_SQL =
  "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name";

const keyOf = (o: SchemaObject) => `${o.type} ${o.name}`;

/** Names of tables the reference has and the candidate lacks. */
export function missingTables(reference: readonly SchemaObject[], candidate: readonly SchemaObject[]): string[] {
  const have = new Set(candidate.filter((o) => o.type === 'table').map((o) => o.name));
  return reference.filter((o) => o.type === 'table' && !have.has(o.name)).map((o) => o.name);
}

/**
 * Differences between the reference schema and the candidate, as short English lines (empty = identical).
 * Extra or missing triggers, views and indexes count, and so does any difference in the stored SQL text.
 */
export function diffSchema(reference: readonly SchemaObject[], candidate: readonly SchemaObject[]): string[] {
  const refMap = new Map(reference.map((o) => [keyOf(o), o]));
  const candMap = new Map(candidate.map((o) => [keyOf(o), o]));
  const problems: string[] = [];
  for (const [key, ref] of refMap) {
    const cand = candMap.get(key);
    if (!cand) problems.push(`missing ${key}`);
    else if (cand.sql !== ref.sql || cand.tbl_name !== ref.tbl_name) problems.push(`different ${key}`);
  }
  for (const key of candMap.keys()) if (!refMap.has(key)) problems.push(`unexpected ${key}`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------
// Summary and classification against the live data
// ---------------------------------------------------------------------------------------------------------------

/** What the owner sees before a restore, and what the post-restore verification compares. */
export interface DbSummary {
  userVersion: number;
  ledgerCount: number;
  paymentCount: number;
  /** Saved Cek kas counts (one per save: the Tunai and Debit rows of a save count once). 0 for a version 6 backup. */
  cashCountBatches: number;
  memberCount: number;
  periodCount: number;
  /** Latest entry date (YYYY-MM-DD), or null without entries. */
  lastEntryDate: IsoDate | null;
  /** Id of the last ledger entry by insertion order (rowid), or null. */
  lastLedgerId: string | null;
  kas: KasBalances;
  /** Row count of every table: a cheap whole-database fingerprint. */
  tableCounts: Record<string, number>;
}

/** Table names and counts must match one for one. Returns the differing table names. */
export function diffTableCounts(expected: Record<string, number>, actual: Record<string, number>): string[] {
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...names].filter((n) => expected[n] !== actual[n]).sort();
}

/** 'changed' = every record id is the same, but meeting, period or member state differs (see classifyRestore). */
export type RestoreKind = 'same' | 'older' | 'newer' | 'diverged' | 'changed';

export interface RestoreClassification {
  kind: RestoreKind;
  /** Records in the live data that the file does not have: they are LOST by this restore. Cek kas counts are NOT included. */
  lost: number;
  /** Records in the file that the live data does not have yet. Cek kas counts are NOT included. */
  added: number;
  /** Cek kas counts (saves, not rows) in the live data that the file does not have: LOST by this restore. */
  cashCountsLost: number;
  /** Cek kas counts (saves, not rows) in the file that the live data does not have yet. */
  cashCountsAdded: number;
  /**
   * Number of state keys (meeting `W:`, period `T:`, member `M:`) that exist on BOTH sides with a different value: closing a
   * meeting, choosing host or date, ending a period, archiving or renaming a member write no ledger entry or payment, so
   * the id sets alone cannot see them. Keys that exist on one side only are not counted (they show up as missing/new rows).
   */
  stateChanged: number;
}

/** Record id of one cash_counts row: "C:<batch id>|<row id>". A count (batch) is lost or added as a whole. */
export function cashCountRecordId(batchId: string, rowId: string): string {
  return `C:${batchId}|${rowId}`;
}

/** The batch id inside a cash count record id, or null for any other kind of record id. */
function cashCountBatchOf(id: string): string | null {
  if (!id.startsWith('C:')) return null;
  const bar = id.indexOf('|');
  return bar === -1 ? id.slice(2) : id.slice(2, bar);
}

/**
 * Compares the record ids (ledger entries, payments, skips, cash counts) of the file with the live data:
 * - same: identical sets;
 * - older: the file is a subset of live (live has more: those entries are lost);
 * - newer: live is a subset of the file (the file has more);
 * - diverged: each has records the other lacks (two phones, or edits after the backup).
 * Cash count rows are counted per batch (one saved count, however many rows it has) in their own fields, so a
 * count with Tunai and Debit is one count, and never inflates the number of "catatan".
 * The two optional state maps (see loadStateFingerprints) catch changes that leave the id sets equal; a backup that would
 * otherwise be 'same' becomes 'changed'. Values are compared as the strings they are, never parsed.
 */
export function classifyRestore(
  candidateIds: ReadonlySet<string>,
  liveIds: ReadonlySet<string>,
  candidateState: ReadonlyMap<string, string> = new Map(),
  liveState: ReadonlyMap<string, string> = new Map(),
): RestoreClassification {
  let lost = 0;
  let added = 0;
  const lostBatches = new Set<string>();
  const addedBatches = new Set<string>();
  for (const id of liveIds) {
    if (candidateIds.has(id)) continue;
    const batch = cashCountBatchOf(id);
    if (batch === null) lost += 1;
    else lostBatches.add(batch);
  }
  for (const id of candidateIds) {
    if (liveIds.has(id)) continue;
    const batch = cashCountBatchOf(id);
    if (batch === null) added += 1;
    else addedBatches.add(batch);
  }
  const cashCountsLost = lostBatches.size;
  const cashCountsAdded = addedBatches.size;
  const anyLost = lost + cashCountsLost > 0;
  const anyAdded = added + cashCountsAdded > 0;
  let stateChanged = 0;
  for (const [key, value] of liveState) {
    const other = candidateState.get(key);
    if (other !== undefined && other !== value) stateChanged += 1;
  }
  const idKind: Exclude<RestoreKind, 'changed'> = !anyLost && !anyAdded ? 'same' : anyLost && !anyAdded ? 'older' : !anyLost ? 'newer' : 'diverged';
  const kind: RestoreKind = idKind === 'same' && stateChanged > 0 ? 'changed' : idKind;
  return { kind, lost, added, cashCountsLost, cashCountsAdded, stateChanged };
}

export const PHRASE_RESTORE = 'PULIHKAN';
export const PHRASE_RESET = 'HAPUS SEMUA';

/** The word the owner must type before the restore may start, or null when two dialogs are enough. */
export function requiredPhrase(source: 'file' | 'empty', classification: RestoreClassification): string | null {
  if (source === 'empty') return PHRASE_RESET;
  const loses = classification.kind === 'older' || classification.kind === 'diverged' || classification.stateChanged > 0;
  return loses ? PHRASE_RESTORE : null;
}

export function phraseMatches(input: string, phrase: string): boolean {
  return input.trim() === phrase;
}

// ---------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** "mascatat-20261106-1435-v4.db": phone local time, the database version, no member names. */
export function backupFileName(now: Date, userVersion: number): string {
  return `mascatat-${stamp(now)}-${pad(now.getHours())}${pad(now.getMinutes())}-v${userVersion}.db`;
}

/** Files the app puts in the cache folder to share: database backups and CSV exports. Only these are ever swept. */
export function isShareCacheFileName(name: string): boolean {
  return /^mascatat-[A-Za-z0-9-]+\.(db|csv)$/.test(name);
}

/** "rusak-20261120-143005.db": a data file that could not be opened, kept before it was replaced. Never listed as a safety copy. */
export function damagedCopyName(now: Date): string {
  return `rusak-${stamp(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.db`;
}

/** Safety copy made before every restore. Seconds are included so two restores in one minute never collide. */
export function safetyFileName(now: Date, userVersion: number, empty = false): string {
  return `pengaman-${stamp(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-v${userVersion}${empty ? EMPTY_MARK : ''}.db`;
}

/** Temporary name while the safety copy is being written and checked; it never matches the safety pattern. */
export const SAFETY_TEMP_NAME = 'pengaman.tmp';
/** Newest safety copies WITH data that are kept. */
export const SAFETY_KEEP = 5;
/** Newest safety copies of an EMPTY database that are kept. They never use up the quota of copies with data. */
export const SAFETY_KEEP_EMPTY = 1;
/** Name marker of a safety copy made from a database without any records. */
const EMPTY_MARK = '-kosong';
const SAFETY_PATTERN = /^pengaman-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-v(\d+)(-kosong)?\.db$/;

export function isSafetyFileName(name: string): boolean {
  return SAFETY_PATTERN.test(name);
}

/** Date and time in a safety copy name, for display. */
export function parseSafetyName(name: string): { date: IsoDate; time: string; userVersion: number } | null {
  const m = SAFETY_PATTERN.exec(name);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, userVersion: Number(m[7]) };
}

/**
 * Safety copies to delete: only the newest `keep` copies with data remain, plus the newest `keepEmpty` empty ones.
 * Empty copies are counted apart, so repeated "Mulai dari nol" can never push out the only copy that holds real data.
 * Names sort by time. Other names are never listed.
 */
export function safetyToPrune(names: readonly string[], keep: number = SAFETY_KEEP, keepEmpty: number = SAFETY_KEEP_EMPTY): string[] {
  const sorted = names.filter(isSafetyFileName).sort();
  const withData = sorted.filter((n) => !n.endsWith(`${EMPTY_MARK}.db`));
  const empty = sorted.filter((n) => n.endsWith(`${EMPTY_MARK}.db`));
  return [...withData.slice(0, Math.max(0, withData.length - keep)), ...empty.slice(0, Math.max(0, empty.length - keepEmpty))].sort();
}

// ---------------------------------------------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------------------------------------------

export const REMINDER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupReminder {
  due: boolean;
  /** Whole days since the last share, or null when never (or the stored value is unreadable). */
  daysSince: number | null;
}

/**
 * Reminder on Home: due when the last share is more than about 7 days ago, or never. Nothing to remind about when
 * the database holds no data yet (`hasData` false).
 */
export function backupReminder(lastSharedAt: string | null, now: Date, hasData: boolean): BackupReminder {
  const last = lastSharedAt === null ? Number.NaN : Date.parse(lastSharedAt);
  if (Number.isNaN(last)) return { due: hasData, daysSince: null };
  const elapsed = now.getTime() - last;
  return { due: hasData && elapsed > REMINDER_DAYS * DAY_MS, daysSince: Math.max(0, Math.floor(elapsed / DAY_MS)) };
}

// ---------------------------------------------------------------------------------------------------------------
// "Restore in progress" marker (L6)
// ---------------------------------------------------------------------------------------------------------------
// A small JSON file written right before the live data is replaced and removed after the result was verified. If the
// app or the phone dies in between, the next start finds it and offers to put the safety copy back. It holds no member
// names and no money: only file names, counts and the id of the last ledger entry.

export const RESTORE_MARKER_NAME = 'restore-berjalan.json';
/** Temp name while the marker is written; like the marker it never matches the safety pattern. */
export const RESTORE_MARKER_TEMP_NAME = 'restore-berjalan.tmp';

export interface MarkerBefore {
  userVersion: number;
  ledgerCount: number;
  lastLedgerId: string | null;
}

export interface MarkerAfter extends MarkerBefore {
  tableCounts: Record<string, number>;
}

export interface RestoreMarker {
  v: 1;
  /** 'reset' = "Mulai dari nol" (the same commit path as a restore). */
  kind: 'restore' | 'reset';
  /** 'swapping' = the copy into the live data may be running; 'recovering' = the automatic rollback has started. */
  stage: 'swapping' | 'recovering';
  /** The safety copy made before the swap (always a valid safety name). */
  safetyName: string;
  startedAt: string;
  before: MarkerBefore;
  after: MarkerAfter;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isIdOrNull = (v: unknown): v is string | null => v === null || (typeof v === 'string' && v.length > 0 && v.length <= 200);

function parseBefore(v: unknown): MarkerBefore | null {
  if (!isRecord(v)) return null;
  const { userVersion, ledgerCount, lastLedgerId } = v;
  if (!isCount(userVersion) || userVersion < 1 || !isCount(ledgerCount) || !isIdOrNull(lastLedgerId)) return null;
  return { userVersion, ledgerCount, lastLedgerId };
}

/** Strict parser: any unknown shape, wrong type or invalid safety name gives null (the caller treats that as corrupt). */
export function parseRestoreMarker(text: string): RestoreMarker | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== 1) return null;
  if (raw.kind !== 'restore' && raw.kind !== 'reset') return null;
  if (raw.stage !== 'swapping' && raw.stage !== 'recovering') return null;
  if (typeof raw.safetyName !== 'string' || !isSafetyFileName(raw.safetyName)) return null;
  if (typeof raw.startedAt !== 'string' || Number.isNaN(Date.parse(raw.startedAt))) return null;
  const before = parseBefore(raw.before);
  const after = parseBefore(raw.after);
  if (!before || !after || !isRecord(raw.after)) return null;
  const counts = raw.after.tableCounts;
  if (!isRecord(counts)) return null;
  const tableCounts: Record<string, number> = {};
  for (const [name, n] of Object.entries(counts)) {
    if (!isCount(n)) return null;
    tableCounts[name] = n;
  }
  return { v: 1, kind: raw.kind, stage: raw.stage, safetyName: raw.safetyName, startedAt: raw.startedAt, before, after: { ...after, tableCounts } };
}

export function serializeRestoreMarker(marker: RestoreMarker): string {
  return JSON.stringify(marker);
}
