// Replacing a database file that cannot be opened (last resort of the "restore in progress" recovery, L6).
// Driver-agnostic on purpose: the three native steps are passed in, so the ORDER of the steps (and that nothing is deleted
// before a copy exists) is proven in Jest. Only a phone shows that the real steps work on a really damaged file.
import { DamagedDatabaseError } from '@/domain/backup';

/** 'copied' = a copy of the file was written and its size read back; 'absent' = no file is visible, so there is nothing to keep. */
export type SetAsideResult = 'copied' | 'absent';

export interface ReplaceSteps<T> {
  /** Copies the unreadable file (and its sidecars) to a safe place and verifies the copy. Must throw when it cannot. */
  setAside: () => Promise<SetAsideResult>;
  /** Deletes the database file. A "not found" error is treated as success by the caller of this module (see isDatabaseNotFound). */
  deleteDatabase: () => Promise<void>;
  /** Opens (creating) the database. */
  open: () => Promise<T>;
}

/** expo-sqlite says "Database 'x' not found" (ERR_DATABASE_NOT_FOUND) when the file is already gone: the goal of the delete is met. */
export function isDatabaseNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { message, code } = error as { message?: unknown; code?: unknown };
  const text = `${typeof code === 'string' ? code : ''} ${typeof message === 'string' ? message : ''}`;
  return /ERR_DATABASE_NOT_FOUND|DatabaseNotFound|database .* not found|no such database/i.test(text);
}

/**
 * Order: keep a copy, delete, open a new empty database. The old file is deleted only after the copy was verified. When no copy
 * could be made (or nothing is visible to copy) NOTHING is deleted: with 'absent' the file is simply opened (which creates it when it
 * is really missing, and fails again when it exists but cannot be seen).
 * Errors are DamagedDatabaseError: `afterDelete` false = the old file is untouched, true = it is gone.
 */
export async function replaceDamagedDatabase<T>(steps: ReplaceSteps<T>): Promise<T> {
  let kept: SetAsideResult;
  try {
    kept = await steps.setAside();
  } catch (cause) {
    throw new DamagedDatabaseError(false, `could not keep a copy of the unreadable data file: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  let deleted = false;
  if (kept === 'copied') {
    try {
      await steps.deleteDatabase();
      deleted = true;
    } catch (cause) {
      if (!isDatabaseNotFound(cause)) {
        throw new DamagedDatabaseError(false, `could not delete the unreadable data file: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      deleted = true; // already gone
    }
  }
  try {
    return await steps.open();
  } catch (cause) {
    throw new DamagedDatabaseError(deleted, `could not open a new data file: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
