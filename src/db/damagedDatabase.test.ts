// Replacing a database file that cannot be opened (L6 last resort). The three native steps are fakes: Jest proves the ORDER
// and the "nothing is deleted without a verified copy" rule, not that the real copy, delete and open work on a phone.
import { damagedCopyName, DamagedDatabaseError, isSafetyFileName } from '@/domain/backup';
import { isDatabaseNotFound, replaceDamagedDatabase, type SetAsideResult } from './damagedDatabase';

function steps(options: { setAside?: () => Promise<SetAsideResult>; deleteDatabase?: () => Promise<void>; open?: () => Promise<string> } = {}) {
  const calls: string[] = [];
  return {
    calls,
    steps: {
      setAside: async () => {
        calls.push('setAside');
        return options.setAside ? options.setAside() : 'copied';
      },
      deleteDatabase: async () => {
        calls.push('delete');
        if (options.deleteDatabase) await options.deleteDatabase();
      },
      open: async () => {
        calls.push('open');
        return options.open ? options.open() : 'opened';
      },
    },
  };
}

async function failure(promise: Promise<unknown>): Promise<DamagedDatabaseError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DamagedDatabaseError) return e;
    throw e;
  }
  throw new Error('expected a DamagedDatabaseError');
}

describe('replaceDamagedDatabase', () => {
  it('keeps a copy, then deletes, then opens: in that order', async () => {
    const s = steps();
    expect(await replaceDamagedDatabase(s.steps)).toBe('opened');
    expect(s.calls).toEqual(['setAside', 'delete', 'open']);
  });

  it('a copy that cannot be made: nothing is deleted and nothing is opened', async () => {
    const s = steps({ setAside: () => Promise.reject(new Error('disk full')) });
    const error = await failure(replaceDamagedDatabase(s.steps));
    expect(error.afterDelete).toBe(false);
    expect(s.calls).toEqual(['setAside']);
  });

  it('no visible file: nothing is deleted, the file is just opened', async () => {
    const s = steps({ setAside: async () => 'absent' });
    expect(await replaceDamagedDatabase(s.steps)).toBe('opened');
    expect(s.calls).toEqual(['setAside', 'open']);
  });

  it('no visible file and the open fails: not "after delete" (nothing was deleted)', async () => {
    const s = steps({ setAside: async () => 'absent', open: () => Promise.reject(new Error('still broken')) });
    expect((await failure(replaceDamagedDatabase(s.steps))).afterDelete).toBe(false);
  });

  it('a delete that fails (not a "not found"): reported as before the delete, nothing is opened', async () => {
    const s = steps({ deleteDatabase: () => Promise.reject(new Error('Failed to delete database file')) });
    const error = await failure(replaceDamagedDatabase(s.steps));
    expect(error.afterDelete).toBe(false);
    expect(s.calls).toEqual(['setAside', 'delete']);
  });

  it('"not found" on the delete counts as deleted and the new file is opened', async () => {
    const s = steps({ deleteDatabase: () => Promise.reject(new Error("Database 'mascatat.db' not found")) });
    expect(await replaceDamagedDatabase(s.steps)).toBe('opened');
    expect(s.calls).toEqual(['setAside', 'delete', 'open']);
  });

  it('the open fails after a successful delete: afterDelete is true (never a harmless retry)', async () => {
    const s = steps({ open: () => Promise.reject(new Error('cannot create')) });
    const error = await failure(replaceDamagedDatabase(s.steps));
    expect(error.afterDelete).toBe(true);
    expect(s.calls).toEqual(['setAside', 'delete', 'open']);
  });

  it('the open fails after a "not found" delete: also afterDelete', async () => {
    const s = steps({
      deleteDatabase: () => Promise.reject(new Error("Database 'x' not found")),
      open: () => Promise.reject(new Error('cannot create')),
    });
    expect((await failure(replaceDamagedDatabase(s.steps))).afterDelete).toBe(true);
  });
});

describe('isDatabaseNotFound', () => {
  it('recognises the expo-sqlite message and code, and nothing else', () => {
    expect(isDatabaseNotFound(new Error("Database 'mascatat.db' not found"))).toBe(true);
    expect(isDatabaseNotFound({ code: 'ERR_DATABASE_NOT_FOUND', message: 'x' })).toBe(true);
    expect(isDatabaseNotFound(new Error('Failed to delete database file'))).toBe(false);
    expect(isDatabaseNotFound(new Error('no such table: members'))).toBe(false);
    expect(isDatabaseNotFound(null)).toBe(false);
    expect(isDatabaseNotFound('Database not found')).toBe(false);
  });
});

describe('damagedCopyName', () => {
  it('uses the phone time, ends in .db and never looks like a safety copy', () => {
    const name = damagedCopyName(new Date(2026, 10, 20, 14, 30, 5));
    expect(name).toBe('rusak-20261120-143005.db');
    expect(isSafetyFileName(name)).toBe(false);
  });
});
