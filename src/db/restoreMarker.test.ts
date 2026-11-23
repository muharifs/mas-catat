// M7b: "restore in progress" marker (L6) and the backup health check (M2). Runs on sql.js.
//
// A crash is NOT a thrown error: commitRestore catches throws and rolls back. A real crash means the code after the
// crash point never runs. CrashSwitch (src/db/testing/sqlJsBridge.ts) captures the "disk" (live bytes and safety folder)
// at the crash point and returns a promise that never settles; the test then "restarts" from the captured state.
import {
  BackupError,
  parseRestoreMarker,
  RESTORE_MARKER_NAME,
  isSafetyFileName,
  RESTORE_MARKER_TEMP_NAME,
  safetyFileName,
  type RestoreMarker,
} from '@/domain/backup';
import {
  commitRestore,
  createBackupSnapshot,
  inspectRestoreMarker,
  LATEST_VERSION,
  prepareRestore,
  recoverFromMarker,
  summarizeDb,
  type NativeBridge,
  type PreparedRestore,
} from './backup';
import type { Db } from './db';
import { createSqlJsEnv, CrashSwitch, FakeSafetyStore, type CrashPoint, type SqlJsEnv } from './testing/sqlJsBridge';
import { seedSampleData } from './testing/backupFixtures';

const NOW = () => new Date(2026, 10, 6, 10, 0, 0);

async function dump(db: Db): Promise<Record<string, string[]>> {
  const tables = await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const out: Record<string, string[]> = {};
  for (const t of tables) out[t.name] = (await db.getAll<Record<string, unknown>>(`SELECT * FROM "${t.name}" ORDER BY rowid`)).map((r) => JSON.stringify(r));
  return out;
}

interface Setup {
  live: SqlJsEnv;
  store: FakeSafetyStore;
  crash: CrashSwitch;
  prepared: PreparedRestore;
  before: Record<string, string[]>;
  fileBytes: Uint8Array;
}

async function setup(kind: 'file' | 'empty' = 'file'): Promise<Setup> {
  const crash = new CrashSwitch();
  const live = await createSqlJsEnv({ crash });
  await seedSampleData(live.db, 'a');
  const other = await createSqlJsEnv();
  await seedSampleData(other.db, 'b');
  const fileBytes = other.liveBytes();
  const store = new FakeSafetyStore(crash);
  const before = await dump(live.db);
  const prepared = await prepareRestore(live.bridge, live.db, kind === 'file' ? { kind: 'file', bytes: fileBytes } : { kind: 'empty' });
  return { live, store, crash, prepared, before, fileBytes };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 2000 && !condition(); i += 1) await tick();
  if (!condition()) throw new Error('condition never became true');
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return e instanceof BackupError ? e.code : `other:${String(e)}`;
  }
  return 'none';
}

describe('commitRestore and the marker', () => {
  it('success: the marker is written before the first copy, still there when the result is verified, gone at the end', async () => {
    const s = await setup();
    const seen: string[] = [];
    const markerOnDisk = () => s.store.files.has(RESTORE_MARKER_NAME);
    const bridge: NativeBridge = {
      ...s.live.bridge,
      copyIntoLive: async (source) => {
        seen.push(`copy:marker=${markerOnDisk()}`);
        await s.live.bridge.copyIntoLive(source);
      },
      liveRaw: {
        ...s.live.bridge.liveRaw,
        getAll: async (sql, params) => {
          if (sql.includes('integrity_check')) seen.push(`verify:marker=${markerOnDisk()}`);
          return s.live.bridge.liveRaw.getAll(sql, params);
        },
      },
    };
    const outcome = await commitRestore(bridge, s.live.db, s.prepared, s.store, NOW);
    expect(outcome.outcome).toBe('restored');
    expect(seen[0]).toBe('copy:marker=true');
    expect(seen.filter((x) => x.startsWith('verify')).every((x) => x === 'verify:marker=true')).toBe(true);
    expect(s.store.calls).toEqual(['writeMarker:swapping', 'clearMarker']);
    expect(await s.store.readMarker()).toBeNull();
    expect(s.store.files.has(RESTORE_MARKER_TEMP_NAME)).toBe(false);
    expect(s.live.openMemoryCount()).toBe(0);
  });

  it('the marker records the safety copy, the counts before and the counts of the new data, and no names or money', async () => {
    const s = await setup();
    const before = await summarizeDb(s.live.db);
    let captured: RestoreMarker | null = null;
    const original = s.store.writeMarker.bind(s.store);
    s.store.writeMarker = async (m) => {
      captured ??= m;
      await original(m);
    };
    const outcome = await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
    expect(captured).toMatchObject({
      v: 1,
      kind: 'restore',
      stage: 'swapping',
      safetyName: outcome.safetyName,
      before: { userVersion: LATEST_VERSION, ledgerCount: before.ledgerCount, lastLedgerId: before.lastLedgerId },
      after: { userVersion: s.prepared.candidate.userVersion, ledgerCount: s.prepared.candidate.ledgerCount },
    });
    const text = JSON.stringify(captured);
    expect(text).not.toContain('Anggota');
    expect(text).not.toContain('Periode');
  });

  it('"Mulai dari nol" goes through the same path with kind reset', async () => {
    const s = await setup('empty');
    const outcome = await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
    expect(outcome.outcome).toBe('restored');
    expect(s.store.markerWrites[0]).toMatchObject({ kind: 'reset', stage: 'swapping', after: { ledgerCount: 0 } });
    expect(await s.store.readMarker()).toBeNull();
  });

  it('rollback that succeeds: the marker goes to stage recovering, then is removed after the old data is verified', async () => {
    const s = await setup();
    let copies = 0;
    const bridge: NativeBridge = {
      ...s.live.bridge,
      copyIntoLive: async (source) => {
        copies += 1;
        if (copies === 1) throw new Error('copy failed');
        await s.live.bridge.copyIntoLive(source);
      },
    };
    const outcome = await commitRestore(bridge, s.live.db, s.prepared, s.store, NOW);
    expect(outcome.outcome).toBe('rolled_back');
    expect(s.store.markerWrites.map((m) => m.stage)).toEqual(['swapping', 'recovering']);
    expect(await s.store.readMarker()).toBeNull();
    expect(await dump(s.live.db)).toEqual(s.before);
  });

  it('a failed stage update is harmless: the rollback still works', async () => {
    const s = await setup();
    s.store.failRecoveringMarker = true;
    let copies = 0;
    const bridge: NativeBridge = {
      ...s.live.bridge,
      copyIntoLive: async (source) => {
        copies += 1;
        if (copies === 1) throw new Error('copy failed');
        await s.live.bridge.copyIntoLive(source);
      },
    };
    expect((await commitRestore(bridge, s.live.db, s.prepared, s.store, NOW)).outcome).toBe('rolled_back');
    expect(await s.store.readMarker()).toBeNull();
  });

  it('restore_failed: the marker stays, with the safety copy next to it', async () => {
    const s = await setup();
    const bridge: NativeBridge = { ...s.live.bridge, copyIntoLive: async () => Promise.reject(new Error('always fails')) };
    expect(await codeOf(commitRestore(bridge, s.live.db, s.prepared, s.store, NOW))).toBe('restore_failed');
    const marker = await s.store.readMarker();
    expect(marker).not.toBeNull();
    expect(marker).not.toBe('corrupt');
    if (marker && marker !== 'corrupt') expect(s.store.files.has(marker.safetyName)).toBe(true);
    expect(s.live.openMemoryCount()).toBe(0);
  });

  it('a marker that cannot be written: safety_failed, the data is not touched, nothing is left behind', async () => {
    const s = await setup();
    s.store.failOn = 'writeMarker';
    let copies = 0;
    const bridge: NativeBridge = {
      ...s.live.bridge,
      copyIntoLive: async (source) => {
        copies += 1;
        await s.live.bridge.copyIntoLive(source);
      },
    };
    expect(await codeOf(commitRestore(bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
    expect(copies).toBe(0);
    expect(await dump(s.live.db)).toEqual(s.before);
    expect(await s.store.readMarker()).toBeNull();
    expect(s.store.files.has(RESTORE_MARKER_TEMP_NAME)).toBe(false);
    expect(s.live.openMemoryCount()).toBe(0);
  });

  it('a marker write failure leaves an OLDER marker (unfinished restore) alone', async () => {
    const s = await setup();
    const old: RestoreMarker = {
      v: 1,
      kind: 'restore',
      stage: 'swapping',
      safetyName: 'pengaman-20260101-100000-v7.db',
      startedAt: '2026-01-01T10:00:00.000Z',
      before: { userVersion: 7, ledgerCount: 1, lastLedgerId: 'x' },
      after: { userVersion: 7, ledgerCount: 0, lastLedgerId: null, tableCounts: {} },
    };
    await s.store.writeMarker(old);
    s.store.failOn = 'writeMarker';
    expect(await codeOf(commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
    expect(await s.store.readMarker()).toEqual(old);
  });

  it('a marker that cannot be removed does not fail a restore that worked', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const s = await setup();
      s.store.failOn = 'clearMarker';
      const outcome = await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
      expect(outcome.outcome).toBe('restored');
      expect(await s.store.readMarker()).not.toBeNull(); // the next start will notice
      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain('pengaman-'); // no path or file name in the log
    } finally {
      warn.mockRestore();
    }
  });

  it('pruning never removes the safety copy of an active marker, even when it is the oldest by name', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const s = await setup();
      s.store.failOn = 'clearMarker'; // the marker stays active
      for (let i = 1; i <= 6; i += 1) s.store.files.set(`pengaman-2026110${i}-100000-v${LATEST_VERSION}.db`, new Uint8Array(1));
      // The new copy is named 2026-01-05: older than all six others, so plain pruning would remove it first.
      const outcome = await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, () => new Date(2026, 0, 5, 10, 0, 0));
      expect(outcome.safetyName).toBe(safetyFileName(new Date(2026, 0, 5, 10, 0, 0), LATEST_VERSION));
      expect(s.store.files.has(outcome.safetyName)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('with an unreadable marker nothing is pruned at all', async () => {
    const s = await setup();
    s.store.failOn = 'clearMarker';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      for (let i = 1; i <= 6; i += 1) s.store.files.set(`pengaman-2026010${i}-100000-v${LATEST_VERSION}.db`, new Uint8Array(1));
      const original = s.store.readMarker.bind(s.store);
      s.store.readMarker = async () => ((await original()) === null ? null : 'corrupt');
      await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
      expect([...s.store.files.keys()].filter((n) => n.startsWith('pengaman-')).length).toBe(7);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('a crash at each step of a restore, then the next start', () => {
  async function crashAt(point: CrashPoint) {
    const s = await setup();
    s.crash.arm(point);
    void commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW); // never settles: the process is gone
    await waitFor(() => s.crash.snapshot !== null);
    const snapshot = s.crash.snapshot;
    if (!snapshot) throw new Error('no snapshot');
    // "Restart": a new connection on the bytes that were on disk, a new store on the files that were on disk.
    const env = await createSqlJsEnv({ initialBytes: snapshot.liveBytes, migrated: false });
    const store = new FakeSafetyStore();
    store.files = new Map([...snapshot.files].map(([name, bytes]) => [name, bytes.slice()]));
    return { s, env, store, snapshot };
  }

  it.each(['afterMarker', 'duringCopy', 'afterCopy', 'afterVerify'] as const)(
    'crash %s: the marker is found, the safety copy puts the old data back, the marker is gone',
    async (point) => {
      const { s, env, store } = await crashAt(point);
      const inspection = await inspectRestoreMarker(store);
      expect(inspection.state).toBe('found');
      if (inspection.state !== 'found') return;
      expect(inspection.marker.stage).toBe('swapping');
      await recoverFromMarker(env.bridge, env.db, store, inspection.marker);
      expect(await dump(env.db)).toEqual(s.before);
      expect(await store.readMarker()).toBeNull();
      expect(await summarizeDb(env.db)).toMatchObject({ userVersion: LATEST_VERSION });
      expect(env.openMemoryCount()).toBe(0);
    },
  );

  it.each(['afterCopy', 'afterVerify'] as const)('crash %s really leaves the NEW data in the live database before the recovery runs', async (point) => {
    const { s, env } = await crashAt(point);
    expect(await dump(env.db)).not.toEqual(s.before);
    expect((await summarizeDb(env.db)).memberCount).toBe(s.prepared.candidate.memberCount);
  });

  it('a crash in the middle of the recovery, then a second recovery: the same result', async () => {
    const { s, store: firstStore, snapshot: firstSnapshot } = await crashAt('duringCopy');
    const inspection = await inspectRestoreMarker(firstStore);
    if (inspection.state !== 'found') throw new Error('marker expected');
    // Recovery run 1 on a connection that dies halfway through its copy.
    const crash2 = new CrashSwitch().arm('duringRecovery');
    const env2 = await createSqlJsEnv({ initialBytes: firstSnapshot.liveBytes, migrated: false, crash: crash2 });
    const store2 = new FakeSafetyStore(crash2);
    store2.files = new Map([...firstStore.files].map(([name, bytes]) => [name, bytes.slice()]));
    void recoverFromMarker(env2.bridge, env2.db, store2, inspection.marker);
    await waitFor(() => crash2.snapshot !== null);
    const snap = crash2.snapshot;
    if (!snap) throw new Error('no snapshot');
    expect(snap.files.has(RESTORE_MARKER_NAME)).toBe(true); // the marker was NOT removed before the copy finished
    // Recovery run 2 after another restart.
    const env3 = await createSqlJsEnv({ initialBytes: snap.liveBytes, migrated: false });
    const store3 = new FakeSafetyStore();
    store3.files = new Map([...snap.files].map(([name, bytes]) => [name, bytes.slice()]));
    const again = await inspectRestoreMarker(store3);
    if (again.state !== 'found') throw new Error('marker expected');
    await recoverFromMarker(env3.bridge, env3.db, store3, again.marker);
    expect(await dump(env3.db)).toEqual(s.before);
    expect(await store3.readMarker()).toBeNull();
  });

  it('the live data can be garbage: setLiveRaw, then recovery restores the safety copy', async () => {
    const s = await setup();
    const marker = await commitThenKeepMarker(s);
    s.live.setLiveRaw(new Uint8Array(4096).fill(7));
    await recoverFromMarker(s.live.bridge, s.live.db, s.store, marker);
    expect(await dump(s.live.db)).toEqual(s.before);
    expect(await s.store.readMarker()).toBeNull();
  });

  /** Runs a restore that ends in restore_failed, so the marker stays; returns it. */
  async function commitThenKeepMarker(s: Setup): Promise<RestoreMarker> {
    const bridge: NativeBridge = { ...s.live.bridge, copyIntoLive: async () => Promise.reject(new Error('always fails')) };
    await codeOf(commitRestore(bridge, s.live.db, s.prepared, s.store, NOW));
    const marker = await s.store.readMarker();
    if (!marker || marker === 'corrupt') throw new Error('marker expected');
    return marker;
  }

  it('recovery is idempotent: running it again on the recovered data gives the same data', async () => {
    const s = await setup();
    const marker = await commitThenKeepMarker(s);
    await recoverFromMarker(s.live.bridge, s.live.db, s.store, marker);
    const once = await dump(s.live.db);
    await recoverFromMarker(s.live.bridge, s.live.db, s.store, marker);
    expect(await dump(s.live.db)).toEqual(once);
    expect(once).toEqual(s.before);
  });

  it('the copy is read into memory first: removing it from the folder during the copy changes nothing', async () => {
    const s = await setup();
    const marker = await commitThenKeepMarker(s);
    const bridge: NativeBridge = {
      ...s.live.bridge,
      copyIntoLive: async (source) => {
        s.store.files.delete(marker.safetyName); // rotation or pruning happens while the copy runs
        await s.live.bridge.copyIntoLive(source);
      },
    };
    await recoverFromMarker(bridge, s.live.db, s.store, marker);
    expect(await dump(s.live.db)).toEqual(s.before);
  });

  it('marker found but the safety copy is gone: safety_missing, nothing is overwritten, the marker stays', async () => {
    const s = await setup();
    const marker = await commitThenKeepMarker(s);
    s.store.files.delete(marker.safetyName);
    s.live.setLiveRaw(new Uint8Array(4096).fill(9));
    let copies = 0;
    const bridge: NativeBridge = {
      ...s.live.bridge,
      copyIntoLive: async (source) => {
        copies += 1;
        await s.live.bridge.copyIntoLive(source);
      },
    };
    expect(await codeOf(recoverFromMarker(bridge, s.live.db, s.store, marker))).toBe('safety_missing');
    expect(copies).toBe(0); // nothing was written over the live data
    expect(await s.store.readMarker()).not.toBeNull();
    expect(s.live.openMemoryCount()).toBe(0);
  });

  it('a safety copy that does not match the marker (another database under that name) is refused', async () => {
    const s = await setup();
    const marker = await commitThenKeepMarker(s);
    s.store.files.set(marker.safetyName, s.fileBytes); // a valid database, but not the one the marker describes
    let copies = 0;
    const bridge: NativeBridge = {
      ...s.live.bridge,
      copyIntoLive: async (source) => {
        copies += 1;
        await s.live.bridge.copyIntoLive(source);
      },
    };
    expect(await codeOf(recoverFromMarker(bridge, s.live.db, s.store, marker))).toBe('safety_missing');
    expect(copies).toBe(0);
    expect(await s.store.readMarker()).not.toBeNull();
  });

  it('a recovery whose copy does not verify throws restore_failed and keeps the marker', async () => {
    const s = await setup();
    const marker = await commitThenKeepMarker(s);
    const bridge: NativeBridge = { ...s.live.bridge, copyIntoLive: async () => undefined }; // copy that silently does nothing
    s.live.setLiveRaw(s.fileBytes); // live holds the other database
    expect(await codeOf(recoverFromMarker(bridge, s.live.db, s.store, marker))).toBe('restore_failed');
    expect(await s.store.readMarker()).not.toBeNull();
  });
});

describe('inspectRestoreMarker', () => {
  it('no marker: none', async () => {
    expect(await inspectRestoreMarker(new FakeSafetyStore())).toEqual({ state: 'none' });
  });

  it('an unreadable marker counts as present (corrupt)', async () => {
    const store = new FakeSafetyStore();
    store.files.set(RESTORE_MARKER_NAME, new TextEncoder().encode('{half a file'));
    expect(await inspectRestoreMarker(store)).toEqual({ state: 'corrupt' });
    expect(parseRestoreMarker('{half a file')).toBeNull();
  });

  it('removes a leftover temp file (a crash while the marker was being written means the data was never touched)', async () => {
    const store = new FakeSafetyStore();
    store.files.set(RESTORE_MARKER_TEMP_NAME, new TextEncoder().encode('{"v":1'));
    expect(await inspectRestoreMarker(store)).toEqual({ state: 'none' });
    expect(store.files.has(RESTORE_MARKER_TEMP_NAME)).toBe(false);
  });

  it('a corrupt marker is replaced by a normal restore of another file, and ends with no marker', async () => {
    const s = await setup();
    s.store.files.set(RESTORE_MARKER_NAME, new TextEncoder().encode('garbage'));
    const outcome = await commitRestore(s.live.bridge, s.live.db, s.prepared, s.store, NOW);
    expect(outcome.outcome).toBe('restored');
    expect(await s.store.readMarker()).toBeNull();
  });

  it('marker and temp names never look like safety copies', async () => {
    expect(isSafetyFileName(RESTORE_MARKER_NAME)).toBe(false);
    expect(isSafetyFileName(RESTORE_MARKER_TEMP_NAME)).toBe(false);
  });
});

describe('M2: the backup file is taken with a health report', () => {
  it('a healthy database gives ok true, with bytes and the version', async () => {
    const live = await createSqlJsEnv();
    await seedSampleData(live.db, 'a');
    const snapshot = await createBackupSnapshot(live.bridge, live.db);
    expect(snapshot.health).toEqual({ ok: true, problems: [] });
    expect(snapshot.userVersion).toBe(LATEST_VERSION);
    expect(snapshot.bytes.length).toBeGreaterThan(100);
  });

  it('an invariant violation gives ok false, and the backup is still made', async () => {
    const live = await createSqlJsEnv();
    await seedSampleData(live.db, 'a');
    await live.db.exec('PRAGMA ignore_check_constraints = ON');
    await live.db.exec('UPDATE payments SET amount = 7000 WHERE rowid = 1'); // not a multiple of Rp15.000
    await live.db.exec('PRAGMA ignore_check_constraints = OFF');
    const snapshot = await createBackupSnapshot(live.bridge, live.db);
    expect(snapshot.health.ok).toBe(false);
    expect(snapshot.health.problems.map((p) => p.code)).toContain('invariant');
    expect(snapshot.bytes.length).toBeGreaterThan(100);
  });
});
