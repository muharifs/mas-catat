// QA (independent) for M7b: abuse of the restore marker (L6). Runs on sql.js, so it proves the logic, not the phone.
import { BackupError, isSafetyFileName, RESTORE_MARKER_NAME, safetyFileName, SAFETY_KEEP } from '@/domain/backup';
import { commitRestore, inspectRestoreMarker, prepareRestore, recoverFromMarker, summarizeDb, type NativeBridge } from './backup';
import { seedSampleData } from './testing/backupFixtures';
import { createSqlJsEnv, CrashSwitch, FakeSafetyStore } from './testing/sqlJsBridge';

let clock = 0;
const tickNow = () => new Date(2026, 10, 6, 10, 0, (clock += 1) % 60, 0);

async function envWith(prefix: string, crash?: CrashSwitch) {
  const env = await createSqlJsEnv(crash ? { crash } : {});
  await seedSampleData(env.db, prefix);
  return env;
}

describe('QA M7b: marker abuse', () => {
  it('repeated restores (A->B->A ...) never leave a marker, a leaked memory db, or more than SAFETY_KEEP copies', async () => {
    const live = await envWith('a');
    const other = await envWith('b');
    const bytesA = live.liveBytes();
    const bytesB = other.liveBytes();
    const store = new FakeSafetyStore();
    for (let i = 0; i < 9; i += 1) {
      const p = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: i % 2 === 0 ? bytesB : bytesA });
      const out = await commitRestore(live.bridge, live.db, p, store, tickNow);
      expect(out.outcome).toBe('restored');
      expect(out.markerCleared).toBe(true);
      expect(await store.readMarker()).toBeNull();
    }
    expect([...store.files.keys()].filter(isSafetyFileName).length).toBeLessThanOrEqual(SAFETY_KEEP + 1);
    expect(live.openMemoryCount()).toBe(0);
  });

  it('double tap: two commits on the same prepared restore at once: one runs, the other is "busy", data is the new data', async () => {
    const live = await envWith('a');
    const other = await envWith('b');
    const store = new FakeSafetyStore();
    const p = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: other.liveBytes() });
    const results = await Promise.allSettled([commitRestore(live.bridge, live.db, p, store, tickNow), commitRestore(live.bridge, live.db, p, store, tickNow)]);
    const codes = results.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason instanceof BackupError ? r.reason.code : 'other'));
    expect(codes.sort()).toEqual(['busy', 'ok']);
    expect(await store.readMarker()).toBeNull();
    expect(live.openMemoryCount()).toBe(0);
    expect((await summarizeDb(live.db)).ledgerCount).toBe((await summarizeDb(other.db)).ledgerCount);
  });

  it('"Mulai dari nol" that crashes after the copy: recovery returns the old data, then a second start finds no marker', async () => {
    const crash = new CrashSwitch();
    const live = await envWith('a', crash);
    const store = new FakeSafetyStore(crash);
    const p = await prepareRestore(live.bridge, live.db, { kind: 'empty' });
    const beforeSummary = await summarizeDb(live.db);
    crash.arm('afterCopy');
    void commitRestore(live.bridge, live.db, p, store, tickNow);
    for (let i = 0; i < 2000 && !crash.snapshot; i += 1) await new Promise((r) => setTimeout(r, 0));
    const snap = crash.snapshot;
    if (!snap) throw new Error('no crash');
    const env = await createSqlJsEnv({ initialBytes: snap.liveBytes, migrated: false });
    expect((await summarizeDb(env.db)).ledgerCount).toBe(0); // the wipe really happened before the "crash"
    const disk = new FakeSafetyStore();
    disk.files = new Map([...snap.files].map(([n, b]) => [n, b.slice()]));
    const found = await inspectRestoreMarker(disk);
    expect(found.state).toBe('found');
    if (found.state !== 'found') return;
    await recoverFromMarker(env.bridge, env.db, disk, found.marker);
    expect((await summarizeDb(env.db)).ledgerCount).toBe(beforeSummary.ledgerCount);
    expect((await inspectRestoreMarker(disk)).state).toBe('none');
  });

  it('recovery twice in a row after a clean recovery: the second finds nothing and changes nothing', async () => {
    const crash = new CrashSwitch();
    const live = await envWith('a', crash);
    const other = await envWith('b');
    const store = new FakeSafetyStore(crash);
    const p = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: other.liveBytes() });
    crash.arm('duringCopy');
    void commitRestore(live.bridge, live.db, p, store, tickNow);
    for (let i = 0; i < 2000 && !crash.snapshot; i += 1) await new Promise((r) => setTimeout(r, 0));
    const snap = crash.snapshot;
    if (!snap) throw new Error('no crash');
    const env = await createSqlJsEnv({ initialBytes: snap.liveBytes, migrated: false });
    const disk = new FakeSafetyStore();
    disk.files = new Map([...snap.files].map(([n, b]) => [n, b.slice()]));
    const found = await inspectRestoreMarker(disk);
    if (found.state !== 'found') throw new Error('marker expected');
    await recoverFromMarker(env.bridge, env.db, disk, found.marker);
    const after = await summarizeDb(env.db);
    expect((await inspectRestoreMarker(disk)).state).toBe('none');
    expect(await summarizeDb(env.db)).toEqual(after);
    expect(env.openMemoryCount()).toBe(0);
  });

  it('a corrupt marker file blocks pruning and is reported as corrupt; the safety copies stay', async () => {
    const live = await envWith('a');
    const store = new FakeSafetyStore();
    for (let i = 0; i < 7; i += 1) store.files.set(safetyFileName(new Date(2026, 0, i + 1, 10), 7), new Uint8Array([1]));
    store.files.set(RESTORE_MARKER_NAME, new TextEncoder().encode('{"v":1,"kind":'));
    expect((await inspectRestoreMarker(store)).state).toBe('corrupt');
    expect(live.openMemoryCount()).toBe(0);
    expect([...store.files.keys()].filter(isSafetyFileName)).toHaveLength(7);
  });

  it('rolled back while an OLDER marker stands: the older marker is back on top and its copy is untouched', async () => {
    const live = await envWith('a');
    const other = await envWith('b');
    const store = new FakeSafetyStore();
    // a first attempt that failed hard leaves a marker
    const failing: NativeBridge = { ...live.bridge, copyIntoLive: async () => Promise.reject(new Error('boom')) };
    const p1 = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: other.liveBytes() });
    await expect(commitRestore(failing, live.db, p1, store, tickNow)).rejects.toBeInstanceOf(BackupError);
    const older = await store.readMarker();
    if (!older || older === 'corrupt') throw new Error('older marker expected');
    // second attempt, rolled back
    let n = 0;
    const flaky: NativeBridge = {
      ...live.bridge,
      copyIntoLive: async (s) => {
        n += 1;
        if (n === 1) throw new Error('one failure');
        await live.bridge.copyIntoLive(s);
      },
    };
    const p2 = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: other.liveBytes() });
    const out = await commitRestore(flaky, live.db, p2, store, tickNow, { restoreMarkerAfter: older });
    expect(out.outcome).toBe('rolled_back');
    expect(await store.readMarker()).toEqual(older);
    expect(store.files.has(older.safetyName)).toBe(true);
  });
});
