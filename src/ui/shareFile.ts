// The ONLY module that touches the file system, the share sheet and the file picker (M7). If File.pickFileAsync
// turns out not to be reliable on a phone, expo-document-picker can replace pickBackupFile() here and nothing else changes.
//
// How this differs from the web: there is no download link and no <input type="file">. The app writes a file into
// its own cache folder, then hands it to Android's share sheet (the user picks Drive, WhatsApp, email...). To bring a
// file back in, the system file picker returns a handle; we check its size BEFORE reading any bytes.
//
// New expo-file-system API (SDK 58): `File` and `Directory` objects, `Paths.cache` (the system may clear it) and
// `Paths.document` (kept). Not the old expo-file-system/legacy functions.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SafetyStore } from '@/db/backup';
import { BackupError, isSafetyFileName, isShareCacheFileName } from '@/domain/backup';

export const BACKUP_MIME = 'application/octet-stream';
export const CSV_MIME = 'text/csv';

// ---------------------------------------------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------------------------------------------

/** Bytes exactly as they are: expo writes the whole underlying buffer, so a view on a bigger buffer is copied first. */
function exactBytes(data: Uint8Array): Uint8Array {
  return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data : data.slice();
}

async function shareThroughCache(name: string, data: string | Uint8Array, mimeType: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new BackupError('share_unavailable', 'the share sheet is not available on this device');
  const file = new File(Paths.cache, name);
  let shared = false;
  try {
    file.create({ overwrite: true });
    await file.write(typeof data === 'string' ? data : exactBytes(data));
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
    shared = true;
  } finally {
    // After a successful share the file stays: the receiving app (Drive, WhatsApp...) may read it later, and deleting
    // it at once could break the upload. It is swept the next time the Cadangan screen opens (sweepShareCache).
    // After a failure it is removed right away; a failed cleanup is logged without the path.
    if (!shared) removeQuietly(file);
  }
}

function removeQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    console.warn('could not delete a temporary export file');
  }
}

/**
 * Removes earlier export files (mascatat-*.db / *.csv) from the cache folder. Called when the Cadangan screen opens, so
 * a file lives until the next visit: long enough for the receiving app, and it never piles up.
 */
export function sweepShareCache(): void {
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (item instanceof File && isShareCacheFileName(item.name)) removeQuietly(item);
    }
  } catch {
    console.warn('could not sweep the temporary export files');
  }
}

/** Shares a database backup. Resolves when the share sheet is closed (we cannot know whether the user sent it). */
export function shareBackupFile(name: string, bytes: Uint8Array): Promise<void> {
  return shareThroughCache(name, bytes, BACKUP_MIME, 'Bagikan cadangan Mas Catat');
}

/** Shares a CSV text (BOM already included by the CSV builder). */
export function shareCsvFile(name: string, content: string): Promise<void> {
  return shareThroughCache(name, content, CSV_MIME, 'Bagikan berkas CSV');
}

// ---------------------------------------------------------------------------------------------------------------
// "Last shared" marker (a small JSON file, outside the database, not part of any restore)
// ---------------------------------------------------------------------------------------------------------------

const STATE_FILE = 'cadangan-status.json';

/** ISO time of the last shared backup, or null if never (or the marker cannot be read: treated as never). */
export function readLastShared(): string | null {
  const file = new File(Paths.document, STATE_FILE);
  try {
    if (!file.exists) return null;
    const parsed: unknown = JSON.parse(file.textSync());
    if (typeof parsed === 'object' && parsed !== null && 'lastSharedAt' in parsed && typeof parsed.lastSharedAt === 'string') {
      return parsed.lastSharedAt;
    }
    return null;
  } catch {
    console.warn('the backup marker could not be read; it is treated as never shared');
    return null;
  }
}

export function writeLastShared(isoTime: string): void {
  const file = new File(Paths.document, STATE_FILE);
  file.create({ overwrite: true });
  file.writeSync(JSON.stringify({ lastSharedAt: isoTime }));
}

// ---------------------------------------------------------------------------------------------------------------
// Safety copies (made before every restore) in Paths.document, so the system never clears them
// ---------------------------------------------------------------------------------------------------------------

const SAFETY_DIR = 'cadangan-pengaman';

function safetyDirectory(): Directory {
  const dir = new Directory(Paths.document, SAFETY_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function createSafetyStore(): SafetyStore {
  return {
    writeTemp: async (name, bytes) => {
      const file = new File(safetyDirectory(), name);
      file.create({ overwrite: true });
      await file.write(exactBytes(bytes));
    },
    readBytes: async (name) => new File(safetyDirectory(), name).bytes(),
    rename: async (from, to) => {
      const target = new File(safetyDirectory(), to);
      if (target.exists) target.delete();
      new File(safetyDirectory(), from).rename(to);
    },
    remove: async (name) => {
      const file = new File(safetyDirectory(), name);
      if (file.exists) file.delete();
    },
    list: async () => safetyDirectory().list().filter((item): item is File => item instanceof File).map((f) => f.name),
  };
}

/** Names of the safety copies, newest first. */
export async function listSafetyCopies(): Promise<string[]> {
  return (await createSafetyStore().list()).filter(isSafetyFileName).sort().reverse();
}

export function readSafetyCopy(name: string): Promise<Uint8Array> {
  if (!isSafetyFileName(name)) throw new BackupError('unreadable', 'not a safety copy name');
  return createSafetyStore().readBytes(name);
}

/** Offers a safety copy to the share sheet (non-blocking for the restore, which is already finished). */
export async function shareSafetyCopy(name: string): Promise<void> {
  await shareBackupFile(name, await readSafetyCopy(name));
}

// ---------------------------------------------------------------------------------------------------------------
// Picker
// ---------------------------------------------------------------------------------------------------------------

export interface PickedFile {
  /** Size in bytes as reported by the system, known BEFORE any byte is read. */
  size: number;
  readBytes(): Promise<Uint8Array>;
}

/**
 * Lets the owner choose a backup file. Any type is offered: a .db file has no reliable MIME type, so the
 * type is never trusted; the content is checked later. Returns null when the owner cancels.
 */
export async function pickBackupFile(): Promise<PickedFile | null> {
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  const file = picked.result;
  return { size: file.size, readBytes: () => file.bytes() };
}
