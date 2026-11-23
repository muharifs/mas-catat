// M7b review fixes (database-engineer): a marker that stays after a good restore, a safety copy of the readable live data
// before a recovery overwrites it, an older marker kept on top without a gap, leftovers at start. Runs on sql.js.
// Same caveat as restoreMarker.test.ts: Jest proves the logic and the order of steps, not the native calls.
import { BackupError, isSafetyFileName, RESTORE_MARKER_NAME, safetyFileName, SAFETY_TEMP_NAME, type RestoreMarker } from '@/domain/backup';
import {
  commitRestore,
  inspectRestoreMarker,
  LATEST_VERSION,
  loadRecoveryCopy,
  prepareRestore,
  recoverFromMarker,
  summarizeDb,
  type NativeBridge,
  type PreparedRestore,
} from './backup';
import type { Db } from './db';
import { createRepositories } from './index';
import { seedSampleData } from './testing/backupFixtures';
import { createSqlJsEnv, FakeSafetyStore, type SqlJsEnv } from './testing/sqlJsBridge';

const NOW = () => new Date(2026, 10, 6, 10, 0, 0);
const LATER = () => new Date(2026, 10, 20, 9, 0, 0);

async function dump(db: Db): Promise<Record<string, string[]>> {
  const tables = await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const out: Record<string, string[]> = {};
  for (const t of tables) out[t.name] = (await db.getAll<Record<string, unknown>>(`SELECT * FROM "${t.name}" ORDER BY rowid`)).map((r) => JSON.stringify(r));
  return out;
}

interface Setup {
  live: SqlJsEnv;
  store: FakeSafetyStore;
  prepared: PreparedRestore;
  before: Record<string, string[]>;
  fileBytes: Uint8Array;
}

async function setup(): Promise<Setup> {
  const live = await createSqlJsEnv();
  await seedSampleData(live.db, 'a');
  const other = await createSqlJsEnv();
  await seedSampleData(other.db, 'b');
  const fileBytes = other.liveBytes();
  const store = new FakeSafetyStore();
  const before = await dump(live.db);
  const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: fileBytes });
  return { live, store, prepared, before, fileBytes };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return e instanceof BackupError ? e.code : `other:${String(e)}`;
  }
  return 'none';
}

const silenceWarn = () => jest.spyOn(console, 'warn').mockImplementation(() => undefined);

const OLD_MARKER: RestoreMarker = {
  v: 1,
  kind: 'restore',
  stage: 'swapping',
  safetyName: 'pengaman-20260101-100000-v7.db',
  startedAt: '2026-01-01T10:00:00.000Z',
  before: { userVersion: 7, ledgerCount: 1, lastLedgerId: 'x' },
  after: { userVersion: 7, ledgerCount: 0, lastLedgerId: null, tableCounts: {} },
};

/** The first copy fails, the second (the automatic undo) works: a rollback. */
function failingFirstCopy(s: Setup): NativeBridge {
  let copies = 0;
  return {
    ...s.live.bridge,
    copyIntoLive: async (source) => {
      copies += 1;
      if (copies === 1) throw new Error('copy failed');
      await s.live.bridge.copyIntoLive(source);
    },
  };
}

describe('a marker that cannot be removed after a good restore', () => {
  it('is retried once and reported as markerCleared false; a normal restore reports true', async () => {
    const warn = silenceWarn();
    try {
      const ok = await setup();
      expect((await commitRestore(ok.live.bridge, ok.live.db, ok.prepared, ok.store, NOW)).markerCleared).toBe(true);

      const s = await setup();
      s.store.failOn = 'clearMarker';
      let attempts = 0;
      const original = s.store.clearMarker.bind(s.store);
      s.store.clearMarker = async () => {
        attempts += 1;
        await original();
      };
      const outcome = await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
      expect(outcome.outcome).toBe('restored');
      expect(outcome.markerCleared).toBe(false);
      expect(attempts).toBe(2);
    } finally {
      warn.mockRestore();
    }
  });

  it('a second try that works counts as cleared', async () => {
    const s = await setup();
    let attempts = 0;
    const original = s.store.clearMarker.bind(s.store);
    s.store.clearMarker = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('first try fails');
      await original();
    };
    const outcome = await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
    expect(outcome.markerCleared).toBe(true);
    expect(await s.store.readMarker()).toBeNull();
  });
});

describe('recovery makes a safety copy of the readable live data before it overwrites it', () => {
  /** A restore that worked but whose marker could not be removed, then the owner records new data. */
  async function stuckThenNewData() {
    const warn = silenceWarn();
    const s = await setup();
    s.store.failOn = 'clearMarker';
    await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
    s.store.failOn = null;
    warn.mockRestore();
    const marker = await s.store.readMarker();
    if (!marker || marker === 'corrupt') throw new Error('marker expected');
    const repos = createRepositories(s.live.db, { newId: () => 'new1', now: () => '2026-12-31T12:00:00.000Z' });
    await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-01-10', amount: 5_000, account: 'tunai', note: 'baru' });
    return { s, marker };
  }

  it('the new data is saved as a verified safety copy first, then the old data comes back', async () => {
    const { s, marker } = await stuckThenNewData();
    const outcome = await recoverFromMarker(s.live.bridge, s.live.db, s.store, marker, LATER);
    expect(outcome.previousCopyName).toBe(safetyFileName(LATER(), LATEST_VERSION));
    expect(outcome.liveDiffers).toBe(true); // one more ledger entry than the restore produced
    expect(outcome.markerCleared).toBe(true);
    const saved = s.store.files.get(outcome.previousCopyName ?? '');
    if (!saved) throw new Error('the copy of the new data is missing');
    const memory = await s.live.bridge.openMemory(saved);
    try {
      expect((await summarizeDb(memory.db)).ledgerCount).toBe(s.prepared.candidate.ledgerCount + 1);
    } finally {
      await memory.close();
    }
    expect(await dump(s.live.db)).toEqual(s.before); // the recovery itself still did its job
    expect(await s.store.readMarker()).toBeNull();
    expect(s.store.files.has(SAFETY_TEMP_NAME)).toBe(false);
    expect(s.live.openMemoryCount()).toBe(0);
  });

  it('pruning never removes the safety copy that was just used, even when it is the oldest', async () => {
    const { s, marker } = await stuckThenNewData();
    for (let i = 1; i <= 6; i += 1) s.store.files.set(`pengaman-2026111${i}-100000-v${LATEST_VERSION}.db`, new Uint8Array(1));
    const outcome = await recoverFromMarker(s.live.bridge, s.live.db, s.store, marker, LATER);
    expect(s.store.files.has(marker.safetyName)).toBe(true); // the source, the oldest by name
    expect(s.store.files.has(outcome.previousCopyName ?? '')).toBe(true);
    const names = [...s.store.files.keys()].filter(isSafetyFileName);
    expect(names.length).toBe(5 + 1); // five kept by the rotation plus the protected source
  });

  it('live data that equals the state after the restore is not "different", but is still copied', async () => {
    const warn = silenceWarn();
    try {
      const s = await setup();
      s.store.failOn = 'clearMarker';
      await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
      s.store.failOn = null;
      const marker = await s.store.readMarker();
      if (!marker || marker === 'corrupt') throw new Error('marker expected');
      const outcome = await recoverFromMarker(s.live.bridge, s.live.db, s.store, marker, LATER);
      expect(outcome.liveDiffers).toBe(false);
      expect(outcome.previousCopyName).not.toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('live data that cannot be read: no copy, no difference reported, and the recovery still works', async () => {
    const s = await setup();
    const failing: NativeBridge = { ...s.live.bridge, copyIntoLive: async () => Promise.reject(new Error('always fails')) };
    await codeOf(commitRestore(failing, s.live.db, s.prepared, s.store, NOW));
    const marker = await s.store.readMarker();
    if (!marker || marker === 'corrupt') throw new Error('marker expected');
    const copiesBefore = [...s.store.files.keys()].filter(isSafetyFileName).length;
    s.live.setLiveRaw(new Uint8Array(4096).fill(7));
    const outcome = await recoverFromMarker(s.live.bridge, s.live.db, s.store, marker);
    expect(outcome).toEqual({ previousCopyName: null, liveDiffers: false, markerCleared: true });
    expect([...s.store.files.keys()].filter(isSafetyFileName).length).toBe(copiesBefore);
    expect(await dump(s.live.db)).toEqual(s.before);
  });

  it('readable live data whose safety copy cannot be written stops the recovery: safety_failed, nothing overwritten, marker stays', async () => {
    const { s, marker } = await stuckThenNewData();
    const live = await dump(s.live.db);
    s.store.failOn = 'writeTemp';
    let copies = 0;
    const bridge: NativeBridge = {
      ...s.live.bridge,
      copyIntoLive: async (source) => {
        copies += 1;
        await s.live.bridge.copyIntoLive(source);
      },
    };
    expect(await codeOf(recoverFromMarker(bridge, s.live.db, s.store, marker))).toBe('safety_failed');
    expect(copies).toBe(0);
    expect(await dump(s.live.db)).toEqual(live);
    expect(await s.store.readMarker()).not.toBeNull();
    expect(s.live.openMemoryCount()).toBe(0);
  });

  it('a recovery whose marker cannot be removed reports markerCleared false', async () => {
    const warn = silenceWarn();
    try {
      const { s, marker } = await stuckThenNewData();
      s.store.failOn = 'clearMarker';
      const outcome = await recoverFromMarker(s.live.bridge, s.live.db, s.store, marker);
      expect(outcome.markerCleared).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('loadRecoveryCopy needs no live database: a memory opener is enough, and a bad copy is refused', async () => {
    const s = await setup();
    const failing: NativeBridge = { ...s.live.bridge, copyIntoLive: async () => Promise.reject(new Error('always fails')) };
    await codeOf(commitRestore(failing, s.live.db, s.prepared, s.store, NOW));
    const marker = await s.store.readMarker();
    if (!marker || marker === 'corrupt') throw new Error('marker expected');
    const opener = { openMemory: s.live.bridge.openMemory };
    const memory = await loadRecoveryCopy(opener, s.store, marker);
    expect((await summarizeDb(memory.db)).ledgerCount).toBe(marker.before.ledgerCount);
    await memory.close();
    s.store.files.set(marker.safetyName, s.fileBytes); // another database under that name
    expect(await codeOf(loadRecoveryCopy(opener, s.store, marker))).toBe('safety_missing');
    expect(s.live.openMemoryCount()).toBe(0);
  });
});

describe('an older marker goes back on top without a gap', () => {
  it('rollback: the older marker replaces the marker of this attempt, clearMarker is never called, a marker stands at every step', async () => {
    const s = await setup();
    await s.store.writeMarker(OLD_MARKER);
    s.store.calls.length = 0;
    s.store.markerWrites.length = 0;
    const presence: boolean[] = [];
    const originalWrite = s.store.writeMarker.bind(s.store);
    s.store.writeMarker = async (m) => {
      await originalWrite(m);
      presence.push(s.store.files.has(RESTORE_MARKER_NAME));
    };
    const outcome = await commitRestore(failingFirstCopy(s), s.live.db, s.prepared, s.store, NOW, { restoreMarkerAfter: OLD_MARKER });
    expect(outcome.outcome).toBe('rolled_back');
    expect(outcome.markerCleared).toBe(true);
    expect(s.store.calls).not.toContain('clearMarker');
    expect(s.store.markerWrites.map((m) => m.stage)).toEqual(['swapping', 'recovering', 'swapping']);
    expect(presence.every(Boolean)).toBe(true);
    expect(await s.store.readMarker()).toEqual(OLD_MARKER);
    expect(await dump(s.live.db)).toEqual(s.before);
  });

  it('rollback where the older marker cannot be written back: markerCleared false and a marker is still standing', async () => {
    const warn = silenceWarn();
    try {
      const s = await setup();
      const originalWrite = s.store.writeMarker.bind(s.store);
      s.store.writeMarker = async (m) => {
        if (m.safetyName === OLD_MARKER.safetyName) throw new Error('cannot write');
        await originalWrite(m);
      };
      const outcome = await commitRestore(failingFirstCopy(s), s.live.db, s.prepared, s.store, NOW, { restoreMarkerAfter: OLD_MARKER });
      expect(outcome.outcome).toBe('rolled_back');
      expect(outcome.markerCleared).toBe(false);
      const marker = await s.store.readMarker();
      expect(marker).not.toBeNull();
      expect(marker).not.toBe('corrupt');
    } finally {
      warn.mockRestore();
    }
  });

  it('restore_failed: the older marker is written back over the marker of this attempt', async () => {
    const s = await setup();
    const bridge: NativeBridge = { ...s.live.bridge, copyIntoLive: async () => Promise.reject(new Error('always fails')) };
    expect(await codeOf(commitRestore(bridge, s.live.db, s.prepared, s.store, NOW, { restoreMarkerAfter: OLD_MARKER }))).toBe('restore_failed');
    expect(await s.store.readMarker()).toEqual(OLD_MARKER);
  });

  it('a restore that worked removes the marker as usual, also with an older marker given', async () => {
    const s = await setup();
    await s.store.writeMarker(OLD_MARKER);
    const outcome = await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW, { restoreMarkerAfter: OLD_MARKER });
    expect(outcome.outcome).toBe('restored');
    expect(outcome.markerCleared).toBe(true);
    expect(await s.store.readMarker()).toBeNull();
  });

  it('safety_failed before the marker of this attempt is written leaves the older marker untouched', async () => {
    const s = await setup();
    await s.store.writeMarker(OLD_MARKER);
    s.store.failOn = 'writeTemp';
    expect(await codeOf(commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW, { restoreMarkerAfter: OLD_MARKER }))).toBe('safety_failed');
    expect(await s.store.readMarker()).toEqual(OLD_MARKER);
  });
});

describe('leftovers at start', () => {
  it('an orphan pengaman.tmp is removed like the marker temp file, without touching real safety copies', async () => {
    const store = new FakeSafetyStore();
    store.files.set(SAFETY_TEMP_NAME, new Uint8Array(10));
    store.files.set('pengaman-20261101-100000-v7.db', new Uint8Array(10));
    expect(await inspectRestoreMarker(store)).toEqual({ state: 'none' });
    expect(store.files.has(SAFETY_TEMP_NAME)).toBe(false);
    expect(store.files.has('pengaman-20261101-100000-v7.db')).toBe(true);
  });

  it('a failing removal of the orphan does not break the start', async () => {
    const store = new FakeSafetyStore();
    store.files.set(SAFETY_TEMP_NAME, new Uint8Array(10));
    store.removeFails = true;
    expect(await inspectRestoreMarker(store)).toEqual({ state: 'none' });
  });
});
