import {
  backupFileName,
  backupReminder,
  BackupError,
  checkFileSize,
  cashCountRecordId,
  classifyRestore,
  diffSchema,
  diffTableCounts,
  inspectHeader,
  isSafetyFileName,
  isShareCacheFileName,
  MAX_BACKUP_BYTES,
  missingTables,
  parseSafetyName,
  phraseMatches,
  PHRASE_RESET,
  PHRASE_RESTORE,
  requiredPhrase,
  safetyFileName,
  safetyToPrune,
  type SchemaObject,
} from './backup';

const MAGIC = 'SQLite format 3\u0000';

/** A synthetic file with a valid SQLite header (only the fields the check reads). */
function fakeDb(opts: { pageSize?: number; pageCount?: number; version?: number; length?: number; magic?: string } = {}): Uint8Array {
  const pageSize = opts.pageSize ?? 512;
  const pageCount = opts.pageCount ?? 2;
  const bytes = new Uint8Array(opts.length ?? pageSize * pageCount);
  const view = new DataView(bytes.buffer);
  const magic = opts.magic ?? MAGIC;
  for (let i = 0; i < magic.length; i += 1) bytes[i] = magic.charCodeAt(i);
  view.setUint16(16, pageSize === 65536 ? 1 : pageSize, false);
  view.setUint32(28, pageCount, false);
  view.setInt32(60, opts.version ?? 4, false);
  return bytes;
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof BackupError) return e.code;
    throw e;
  }
  return 'none';
}

describe('checkFileSize', () => {
  it.each([
    [0, 'file_empty'],
    [-1, 'file_empty'],
    [Number.NaN, 'file_empty'],
    [99, 'file_too_small'],
    [MAX_BACKUP_BYTES + 1, 'file_too_large'],
  ])('rejects size %p as %s', (size, code) => {
    expect(codeOf(() => checkFileSize(size))).toBe(code);
  });

  it.each([100, 4096, MAX_BACKUP_BYTES])('accepts size %p', (size) => {
    expect(codeOf(() => checkFileSize(size))).toBe('none');
  });
});

describe('inspectHeader', () => {
  it('accepts a good header and reads page size, page count and version', () => {
    expect(inspectHeader(fakeDb({ pageSize: 4096, pageCount: 3, version: 2 }), 4)).toEqual({ pageSize: 4096, pageCount: 3, userVersion: 2 });
  });

  it('reads page size 1 as 65536', () => {
    expect(inspectHeader(fakeDb({ pageSize: 65536, pageCount: 1, version: 1 }), 4).pageSize).toBe(65536);
  });

  it('rejects a file without the SQLite magic', () => {
    expect(codeOf(() => inspectHeader(fakeDb({ magic: 'Not a database!!\u0000' }), 4))).toBe('not_sqlite');
  });

  it('rejects text pretending to be a database', () => {
    const text = new TextEncoder().encode('hello world '.repeat(100));
    expect(codeOf(() => inspectHeader(text, 4))).toBe('not_sqlite');
  });

  it('rejects an impossible page size', () => {
    const bytes = fakeDb();
    new DataView(bytes.buffer).setUint16(16, 1000, false);
    expect(codeOf(() => inspectHeader(bytes, 4))).toBe('not_sqlite');
  });

  it('rejects a truncated file (size is not page count x page size)', () => {
    expect(codeOf(() => inspectHeader(fakeDb({ pageCount: 4, length: 512 * 3 }), 4))).toBe('size_mismatch');
  });

  it('rejects a file with extra bytes', () => {
    expect(codeOf(() => inspectHeader(fakeDb({ pageCount: 2, length: 1024 + 7 }), 4))).toBe('size_mismatch');
  });

  it('rejects a page count of zero', () => {
    expect(codeOf(() => inspectHeader(fakeDb({ pageCount: 0, length: 1024 }), 4))).toBe('size_mismatch');
  });

  it.each([0, -3])('rejects version %p', (version) => {
    expect(codeOf(() => inspectHeader(fakeDb({ version }), 4))).toBe('version_missing');
  });

  it('rejects a version newer than this app', () => {
    expect(codeOf(() => inspectHeader(fakeDb({ version: 5 }), 4))).toBe('version_newer');
  });

  it('accepts versions 1 to the latest', () => {
    for (const version of [1, 2, 3, 4]) expect(codeOf(() => inspectHeader(fakeDb({ version }), 4))).toBe('none');
  });

  it('applies the size limits too', () => {
    expect(codeOf(() => inspectHeader(new Uint8Array(0), 4))).toBe('file_empty');
    expect(codeOf(() => inspectHeader(new Uint8Array(50), 4))).toBe('file_too_small');
  });
});

describe('schema comparison', () => {
  const table = (name: string, sql = `CREATE TABLE ${name} (id TEXT)`): SchemaObject => ({ type: 'table', name, tbl_name: name, sql });
  const trigger = (name: string, tbl: string): SchemaObject => ({ type: 'trigger', name, tbl_name: tbl, sql: `CREATE TRIGGER ${name} ...` });
  const reference = [table('a'), table('b'), trigger('t1', 'a')];

  it('is empty for identical schemas', () => {
    expect(diffSchema(reference, [...reference])).toEqual([]);
  });

  it('flags a missing trigger', () => {
    expect(diffSchema(reference, [table('a'), table('b')])).toEqual(['missing trigger t1']);
  });

  it('flags an extra trigger and an extra view', () => {
    const extra = [...reference, trigger('evil', 'a'), { type: 'view', name: 'v', tbl_name: 'v', sql: 'CREATE VIEW v AS SELECT 1' }];
    expect(diffSchema(reference, extra)).toEqual(['unexpected trigger evil', 'unexpected view v']);
  });

  it('flags changed SQL text', () => {
    expect(diffSchema(reference, [table('a', 'CREATE TABLE a (id TEXT, x TEXT)'), table('b'), trigger('t1', 'a')])).toEqual(['different table a']);
  });

  it('lists missing tables only', () => {
    expect(missingTables(reference, [table('a'), trigger('t1', 'a')])).toEqual(['b']);
  });

  it('diffs table counts both ways', () => {
    expect(diffTableCounts({ a: 1, b: 2 }, { a: 1, b: 3, c: 0 })).toEqual(['b', 'c']);
    expect(diffTableCounts({ a: 1 }, { a: 1 })).toEqual([]);
  });
});

describe('classifyRestore', () => {
  const set = (...ids: string[]) => new Set(ids);

  it('same', () => {
    expect(classifyRestore(set('L:1', 'P:1'), set('L:1', 'P:1'))).toEqual({ kind: 'same', lost: 0, added: 0, cashCountsLost: 0, cashCountsAdded: 0 });
  });

  it('both empty is the same', () => {
    expect(classifyRestore(set(), set()).kind).toBe('same');
  });

  it('older: the file is a subset of live and the extra live entries are lost', () => {
    expect(classifyRestore(set('L:1'), set('L:1', 'L:2', 'P:1'))).toEqual({ kind: 'older', lost: 2, added: 0, cashCountsLost: 0, cashCountsAdded: 0 });
  });

  it('an empty file against live data is older', () => {
    expect(classifyRestore(set(), set('L:1'))).toEqual({ kind: 'older', lost: 1, added: 0, cashCountsLost: 0, cashCountsAdded: 0 });
  });

  it('newer: live is a subset of the file', () => {
    expect(classifyRestore(set('L:1', 'L:2'), set('L:1'))).toEqual({ kind: 'newer', lost: 0, added: 1, cashCountsLost: 0, cashCountsAdded: 0 });
  });

  it('diverged: each side has records the other lacks', () => {
    expect(classifyRestore(set('L:1', 'L:3'), set('L:1', 'L:2'))).toEqual({ kind: 'diverged', lost: 1, added: 1, cashCountsLost: 0, cashCountsAdded: 0 });
  });

  it('cash count rows are counted per batch, apart from the records', () => {
    const rows = (batch: string, ...ids: string[]) => ids.map((id) => cashCountRecordId(batch, id));
    // one count with Tunai + Debit = two rows = ONE lost count, and no lost "catatan"
    expect(classifyRestore(set('L:1'), set('L:1', ...rows('b1', 'r1', 'r2')))).toEqual({
      kind: 'older', lost: 0, added: 0, cashCountsLost: 1, cashCountsAdded: 0,
    });
    expect(classifyRestore(set('L:1', ...rows('b1', 'r1', 'r2'), ...rows('b2', 'r3')), set('L:1'))).toEqual({
      kind: 'newer', lost: 0, added: 0, cashCountsLost: 0, cashCountsAdded: 2,
    });
    expect(classifyRestore(set(...rows('b1', 'r1', 'r2')), set(...rows('b1', 'r1', 'r2')))).toMatchObject({ kind: 'same' });
  });

  it('records and cash counts are told apart, and each side adds to the kind', () => {
    expect(classifyRestore(set('L:1', ...['C:b9|r9']), set('L:1', 'L:2', 'C:b1|r1', 'C:b1|r2'))).toEqual({
      kind: 'diverged', lost: 1, added: 0, cashCountsLost: 1, cashCountsAdded: 1,
    });
    // only counts differ on both sides: still diverged, no record counted
    expect(classifyRestore(set('C:b9|r9'), set('C:b1|r1'))).toEqual({ kind: 'diverged', lost: 0, added: 0, cashCountsLost: 1, cashCountsAdded: 1 });
  });

  it('a ledger id and a payment id with the same text do not collide', () => {
    expect(classifyRestore(set('L:1'), set('P:1')).kind).toBe('diverged');
  });
});

describe('typed confirmation', () => {
  it('older and diverged need PULIHKAN', () => {
    expect(requiredPhrase('file', { kind: 'older', lost: 1, added: 0, cashCountsLost: 0, cashCountsAdded: 0 })).toBe(PHRASE_RESTORE);
    expect(requiredPhrase('file', { kind: 'diverged', lost: 1, added: 1, cashCountsLost: 0, cashCountsAdded: 0 })).toBe(PHRASE_RESTORE);
  });

  it('same and newer need only the two dialogs', () => {
    expect(requiredPhrase('file', { kind: 'same', lost: 0, added: 0, cashCountsLost: 0, cashCountsAdded: 0 })).toBeNull();
    expect(requiredPhrase('file', { kind: 'newer', lost: 0, added: 3, cashCountsLost: 0, cashCountsAdded: 0 })).toBeNull();
  });

  it('starting from zero always needs HAPUS SEMUA', () => {
    expect(requiredPhrase('empty', { kind: 'same', lost: 0, added: 0, cashCountsLost: 0, cashCountsAdded: 0 })).toBe(PHRASE_RESET);
    expect(requiredPhrase('empty', { kind: 'older', lost: 9, added: 0, cashCountsLost: 0, cashCountsAdded: 0 })).toBe(PHRASE_RESET);
  });

  it('matches the exact word (surrounding spaces are fine, other case is not)', () => {
    expect(phraseMatches(' PULIHKAN ', PHRASE_RESTORE)).toBe(true);
    expect(phraseMatches('pulihkan', PHRASE_RESTORE)).toBe(false);
    expect(phraseMatches('HAPUS  SEMUA', PHRASE_RESET)).toBe(false);
    expect(phraseMatches('HAPUS SEMUA', PHRASE_RESET)).toBe(true);
  });
});

describe('file names', () => {
  const when = new Date(2026, 10, 6, 9, 5, 7); // 2026-11-06 09:05:07 local time

  it('backup name has date, time and version, and no names', () => {
    expect(backupFileName(when, 4)).toBe('mascatat-20261106-0905-v4.db');
  });

  it('safety name includes seconds', () => {
    expect(safetyFileName(when, 4)).toBe('pengaman-20261106-090507-v4.db');
  });

  it('recognises and parses safety names', () => {
    expect(isSafetyFileName('pengaman-20261106-090507-v4.db')).toBe(true);
    expect(isSafetyFileName('pengaman.tmp')).toBe(false);
    expect(isSafetyFileName('mascatat-20261106-0905-v4.db')).toBe(false);
    expect(parseSafetyName('pengaman-20261106-090507-v4.db')).toEqual({ date: '2026-11-06', time: '09:05', userVersion: 4 });
    expect(parseSafetyName('x.db')).toBeNull();
  });

  it('keeps the 5 newest safety copies with data and never touches other files', () => {
    const names = [
      'pengaman-20261101-100000-v4.db',
      'pengaman-20261102-100000-v4.db',
      'pengaman-20261103-100000-v4.db',
      'pengaman-20261104-100000-v4.db',
      'pengaman-20261105-100000-v3.db',
      'pengaman-20261106-090507-v4.db',
      'pengaman-20261107-000001-v4.db',
      'notes.txt',
    ];
    expect(safetyToPrune(names)).toEqual(['pengaman-20261101-100000-v4.db', 'pengaman-20261102-100000-v4.db']);
    expect(safetyToPrune(names.slice(0, 5))).toEqual([]);
    expect(safetyToPrune(names, 2).length).toBe(5);
  });

  it('empty-database copies are counted apart and never push out a copy with data', () => {
    const withData = 'pengaman-20261101-100000-v4.db';
    const names = [withData, 'pengaman-20261102-100000-v4-kosong.db', 'pengaman-20261103-100000-v4-kosong.db', 'pengaman-20261104-100000-v4-kosong.db'];
    expect(safetyToPrune(names)).toEqual(['pengaman-20261102-100000-v4-kosong.db', 'pengaman-20261103-100000-v4-kosong.db']);
    expect(safetyToPrune(names)).not.toContain(withData);
  });

  it('recognises the share files that may be swept from the cache, and nothing else', () => {
    expect(isShareCacheFileName(backupFileName(new Date(2026, 10, 6, 9, 5), 4))).toBe(true);
    expect(isShareCacheFileName('mascatat-buku-kas-20261106.csv')).toBe(true);
    expect(isShareCacheFileName('pengaman-20261106-090507-v4.db')).toBe(false);
    expect(isShareCacheFileName('mascatat-x.txt')).toBe(false);
    expect(isShareCacheFileName('other.db')).toBe(false);
    expect(isShareCacheFileName('mascatat-../x.db')).toBe(false);
  });

  it('names an empty-database copy and parses it', () => {
    const name = safetyFileName(new Date(2026, 10, 6, 9, 5, 7), 4, true);
    expect(name).toBe('pengaman-20261106-090507-v4-kosong.db');
    expect(isSafetyFileName(name)).toBe(true);
    expect(parseSafetyName(name)).toEqual({ date: '2026-11-06', time: '09:05', userVersion: 4 });
  });
});

describe('backupReminder', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

  it('is due when there is data and nothing was ever shared', () => {
    expect(backupReminder(null, now, true)).toEqual({ due: true, daysSince: null });
  });

  it('is not due without data', () => {
    expect(backupReminder(null, now, false).due).toBe(false);
  });

  it('is not due within 7 days, due after 7 days', () => {
    expect(backupReminder(daysAgo(3), now, true)).toEqual({ due: false, daysSince: 3 });
    expect(backupReminder(daysAgo(7), now, true).due).toBe(false);
    expect(backupReminder(daysAgo(8), now, true)).toEqual({ due: true, daysSince: 8 });
  });

  it('treats an unreadable stored value as never', () => {
    expect(backupReminder('garbage', now, true)).toEqual({ due: true, daysSince: null });
  });

  it('a date in the future (clock change) is 0 days', () => {
    expect(backupReminder(daysAgo(-2), now, true)).toEqual({ due: false, daysSince: 0 });
  });
});
