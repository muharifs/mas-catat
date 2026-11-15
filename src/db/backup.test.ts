// M7 backup/restore tests. They run on sql.js behind the NativeBridge/SafetyStore seams, so they prove the LOGIC
// (checks, order of steps, automatic recovery, nothing touched before the copy) but NOT that serializeAsync,
// deserializeDatabaseAsync, backupDatabaseAsync, sharing or the file picker work on a phone.
import { BackupError, diffSchema, parseSafetyName, safetyFileName, type BackupErrorCode } from '@/domain/backup';
import { computeKasBalances } from '@/domain/kas';
import { commitRestore, createBackupSnapshot, discardRestore, healthCheck, LATEST_VERSION, loadRecordIds, prepareRestore, readSchema, summarizeDb, type NativeBridge, type PreparedRestore } from './backup';
import type { Db } from './db';
import { createRepositories } from './index';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { seedClosedPeriodHistory, seedSampleData } from './testing/backupFixtures';
import { createSqlJsEnv, FakeSafetyStore, type SqlJsEnv } from './testing/sqlJsBridge';
import { loadSqlJsEngine } from './testing/sqlJsDriver';

type Summary = Awaited<ReturnType<typeof summarizeDb>>;
const NOW = () => new Date(2026, 10, 6, 10, 0, 0);

async function codeOfAsync(promise: Promise<unknown>): Promise<BackupErrorCode | 'none'> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof BackupError) return e.code;
    throw e;
  }
  return 'none';
}

/** Adds one distinct ledger entry (a different id prefix keeps two databases from sharing ids). */
async function addEntry(db: Db, tag: string, amount = 10_000): Promise<void> {
  const repos = createRepositories(db, { newId: () => `x${tag}`, now: () => '2026-12-31T12:00:00.000Z' });
  await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-02-01', amount, account: 'debit' });
}

async function seededEnv(prefix = 'a'): Promise<SqlJsEnv> {
  const env = await createSqlJsEnv();
  await seedSampleData(env.db, prefix);
  return env;
}

/** The same live data, as an independent copy that can then change on its own. */
async function cloneEnv(env: SqlJsEnv): Promise<SqlJsEnv> {
  return createSqlJsEnv({ initialBytes: env.liveBytes(), migrated: false });
}

async function fileInput(env: SqlJsEnv) {
  return { kind: 'file' as const, bytes: env.liveBytes() };
}

/** A fully restored database must look like `source`: same counts, same last entry, same kas. */
async function expectSameData(actual: SqlJsEnv, expected: SqlJsEnv): Promise<void> {
  const a = await summarizeDb(actual.db);
  const e = await summarizeDb(expected.db);
  expect(a).toEqual(e);
  expect([...(await loadRecordIds(actual.db))].sort()).toEqual([...(await loadRecordIds(expected.db))].sort());
}

describe('Db.runExclusive', () => {
  it('waits for a running transaction, and later calls wait for it', async () => {
    const env = await createSqlJsEnv();
    const order: string[] = [];
    const tx = env.db.transaction(async (t) => {
      await t.exec('CREATE TABLE scratch (x INTEGER)');
      await new Promise((r) => setTimeout(r, 30));
      order.push('transaction done');
    });
    const exclusive = env.db.runExclusive(async () => {
      order.push('exclusive start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('exclusive end');
    });
    const after = env.db.getFirst('SELECT 1 AS one').then(() => order.push('query after'));
    await Promise.all([tx, exclusive, after]);
    expect(order).toEqual(['transaction done', 'exclusive start', 'exclusive end', 'query after']);
  });

  it('does not open a transaction by itself', async () => {
    const env = await createSqlJsEnv();
    await env.db.runExclusive(async () => {
      const row = await env.bridge.liveRaw.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM sqlite_master');
      expect(row).not.toBeNull();
    });
    // BEGIN would fail if one were still open
    await env.db.transaction(async (tx) => {
      await tx.exec('SELECT 1');
    });
  });

  it('keeps the queue alive after fn throws', async () => {
    const env = await createSqlJsEnv();
    await expect(env.db.runExclusive(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(env.db.getFirst('SELECT 1 AS one')).resolves.toEqual({ one: 1 });
  });
});

describe('createBackupSnapshot', () => {
  it('returns consistent bytes with a valid header and the user_version', async () => {
    const env = await seededEnv();
    const { bytes, userVersion } = await createBackupSnapshot(env.bridge, env.db);
    expect(userVersion).toBe(LATEST_VERSION);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('waits for a transaction in progress', async () => {
    const env = await seededEnv();
    const order: string[] = [];
    const tx = env.db.transaction(async (t) => {
      await t.run("INSERT INTO members (id, name, created_at) VALUES ('late', 'Late', 'x')");
      await new Promise((r) => setTimeout(r, 30));
      order.push('tx committed');
    });
    const snap = createBackupSnapshot(env.bridge, env.db).then((s) => {
      order.push('snapshot');
      return s;
    });
    const [, { bytes }] = await Promise.all([tx, snap]);
    expect(order).toEqual(['tx committed', 'snapshot']);
    // the snapshot includes the committed row
    const copy = await createSqlJsEnv({ initialBytes: bytes, migrated: false });
    expect((await copy.db.getFirst<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE id = 'late'"))?.n).toBe(1);
  });
});

describe('healthCheck', () => {
  it('passes a database written by the repositories (sample history)', async () => {
    const env = await seededEnv();
    expect(await healthCheck(env.db)).toEqual({ ok: true, problems: [] });
  });

  it('passes a database with a closed period, write-off, titipan and carry-over', async () => {
    const env = await createSqlJsEnv();
    await seedClosedPeriodHistory(env.db);
    expect(await healthCheck(env.db)).toEqual({ ok: true, problems: [] });
  });

  it('passes an empty migrated database', async () => {
    const env = await createSqlJsEnv();
    expect((await healthCheck(env.db)).ok).toBe(true);
  });

  async function problemsAfter(mutate: (db: Db, ids: string[], periodId: string) => Promise<void>): Promise<string[]> {
    const env = await createSqlJsEnv();
    const { memberIds, periodId } = await seedSampleData(env.db);
    await mutate(env.db, memberIds, periodId);
    return (await healthCheck(env.db)).problems.map((p) => `${p.code}:${p.detail.split(':')[0]}`);
  }

  it('flags a week paid above Rp15.000 (allocation + offset + titipan)', async () => {
    const problems = await problemsAfter(async (db, ids, periodId) => {
      await db.run(
        "INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('bad', ?, ?, '2026-01-06', 15000, 'x')",
        [periodId, ids[3] as string],
      );
      await db.run("INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES ('bad', ?, ?, 2, 15000, '2026-01-06')", [periodId, ids[3] as string]);
      await db.run("INSERT INTO credit_applications (kind, from_period_id, member_id, to_period_id, week, amount, created_at) VALUES ('settle_debt', ?, ?, ?, 2, 5000, 'x')", [periodId, ids[3] as string, periodId]);
    });
    // The settle_debt application above also takes more credit out of the pool than the payment put in, so the new
    // credit invariant (migration 0006) fires too: 15.000 received - 15.000 allocated - 5.000 applied < 0.
    expect(problems).toEqual(['invariant:week_paid_above_due', 'invariant:member_credit_negative']);
  });

  it('flags two host payouts in force for one week', async () => {
    const problems = await problemsAfter(async (db, ids, periodId) => {
      await db.run(
        "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account) VALUES ('dup', ?, '2026-01-07', 40000, 'out', 'host_payout', ?, 1, '', 'x', 'tunai')",
        [periodId, ids[0] as string],
      );
    });
    expect(problems).toEqual(['invariant:two_host_payouts_in_force_for_one_week']);
  });

  it('flags a closed period that still has an open meeting', async () => {
    const problems = await problemsAfter(async (db, _ids, periodId) => {
      await db.run("UPDATE periods SET status = 'closed', end_date = '2026-02-01' WHERE id = ?", [periodId]);
    });
    expect(problems).toEqual(['invariant:closed_period_with_open_meeting']);
  });

  it('flags a period whose meeting count differs from its member count', async () => {
    const problems = await problemsAfter(async (db, _ids, periodId) => {
      await db.run('DELETE FROM weeks WHERE period_id = ? AND number = 4', [periodId]);
    });
    expect(problems).toContain('invariant:meeting_count_differs_from_member_count');
  });

  describe('amount invariants (rows planted with CHECK constraints switched off)', () => {
    const plant = (sql: (periodId: string, memberId: string) => string) =>
      problemsAfter(async (db, ids, periodId) => {
        await db.exec('PRAGMA ignore_check_constraints = ON');
        await db.exec(sql(periodId, ids[3] as string));
        await db.exec('PRAGMA ignore_check_constraints = OFF');
      });
    const ledgerRow = (amount: string) => (periodId: string) =>
      `INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account) VALUES ('bad', '${periodId}', '2026-01-07', ${amount}, 'in', 'opening_balance', NULL, NULL, '', 'x', 'tunai')`;

    it('flags a ledger amount of zero, a negative one and a fraction', async () => {
      for (const amount of ['0', '-5000', '1.5']) {
        expect(await plant(ledgerRow(amount))).toContain('invariant:ledger_amount_not_positive_integer');
      }
    });

    it('flags a payment that is not a positive whole amount, or not a multiple of Rp15.000', async () => {
      const payment = (amount: string) => (periodId: string, memberId: string) =>
        `INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('bad', '${periodId}', '${memberId}', '2026-01-06', ${amount}, 'x')`;
      expect(await plant(payment('20000'))).toEqual(['invariant:payment_not_multiple_of_weekly_due']);
      expect(await plant(payment('0'))).toContain('invariant:payment_amount_not_positive_integer');
      expect(await plant(payment('15000.5'))).toContain('invariant:payment_amount_not_positive_integer');
    });

    it('flags an allocation with a bad amount', async () => {
      const problems = await plant(
        (periodId, memberId) =>
          `INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('bad', '${periodId}', '${memberId}', '2026-01-06', 15000, 'x');
           INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES ('bad', '${periodId}', '${memberId}', 2, -1, '2026-01-06')`,
      );
      expect(problems).toContain('invariant:allocation_amount_not_positive_integer');
    });
  });

  it('flags a foreign key violation', async () => {
    const problems = await problemsAfter(async (db) => {
      await db.exec('PRAGMA foreign_keys = OFF');
      await db.run("INSERT INTO members (id, name, created_at) VALUES ('m', 'M', 'x')");
      await db.run("INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('orphan', 'no-such-period', 'm', '2026-01-06', 15000, 'x')");
    });
    expect(problems).toContain('foreign_keys:foreign_key_check');
  });
});

describe('prepareRestore: files that are refused', () => {
  async function refusal(input: Uint8Array): Promise<BackupErrorCode | 'none'> {
    const env = await seededEnv();
    const before = env.liveBytes();
    const code = await codeOfAsync(prepareRestore(env.bridge, env.db, { kind: 'file', bytes: input }));
    expect(env.liveBytes()).toEqual(before); // live untouched
    expect(env.openMemoryCount()).toBe(0); // nothing left open
    return code;
  }

  it('empty file', async () => expect(await refusal(new Uint8Array(0))).toBe('file_empty'));
  it('tiny file', async () => expect(await refusal(new Uint8Array(40))).toBe('file_too_small'));
  it('foreign file (text)', async () => expect(await refusal(new TextEncoder().encode('name;amount\n'.repeat(60)))).toBe('not_sqlite'));

  it('truncated database', async () => {
    const source = await seededEnv('t');
    const bytes = source.liveBytes();
    expect(await refusal(bytes.slice(0, bytes.length - 4096))).toBe('size_mismatch');
  });

  it('a SQLite database with version 0 (not ours)', async () => {
    const SQL = await loadSqlJsEngine();
    const foreign = new SQL.Database();
    foreign.run('CREATE TABLE notes (x TEXT)');
    expect(await refusal(foreign.export())).toBe('version_missing');
  });

  it('a database newer than this app', async () => {
    const source = await seededEnv('n');
    await source.db.exec(`PRAGMA user_version = ${LATEST_VERSION + 1}`);
    expect(await refusal(source.liveBytes())).toBe('version_newer');
  });

  it('a file of this version with a table missing', async () => {
    const source = await seededEnv('m');
    await source.db.exec('PRAGMA foreign_keys = OFF');
    await source.db.exec('DROP TABLE credit_applications');
    expect(await refusal(source.liveBytes())).toBe('tables_missing');
  });

  it('a missing trigger', async () => {
    const source = await seededEnv('g');
    await source.db.exec('DROP TRIGGER ledger_entries_no_delete');
    expect(await refusal(source.liveBytes())).toBe('schema_mismatch');
  });

  it('an extra trigger', async () => {
    const source = await seededEnv('x');
    await source.db.exec('CREATE TRIGGER sneaky AFTER INSERT ON members BEGIN SELECT 1; END');
    expect(await refusal(source.liveBytes())).toBe('schema_mismatch');
  });

  it('an extra view', async () => {
    const source = await seededEnv('v');
    await source.db.exec('CREATE VIEW all_members AS SELECT * FROM members');
    expect(await refusal(source.liveBytes())).toBe('schema_mismatch');
  });

  it('an extra index', async () => {
    const source = await seededEnv('i');
    await source.db.exec('CREATE INDEX sneaky_idx ON members (name)');
    expect(await refusal(source.liveBytes())).toBe('schema_mismatch');
  });

  it('a table with a changed definition', async () => {
    const source = await seededEnv('d');
    await source.db.exec('ALTER TABLE members ADD COLUMN extra TEXT');
    expect(await refusal(source.liveBytes())).toBe('schema_mismatch');
  });

  it('data that breaks an invariant (two payouts for one week)', async () => {
    const source = await seededEnv('p');
    const row = await source.db.getFirst<{ period_id: string; member_id: string }>("SELECT period_id, member_id FROM ledger_entries WHERE type = 'host_payout' LIMIT 1");
    await source.db.run(
      "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account) VALUES ('dup', ?, '2026-01-07', 40000, 'out', 'host_payout', ?, 1, '', 'x', 'tunai')",
      [row?.period_id as string, row?.member_id as string],
    );
    expect(await refusal(source.liveBytes())).toBe('invariant');
  });

  it('data with a foreign key violation', async () => {
    const source = await seededEnv('k');
    await source.db.exec('PRAGMA foreign_keys = OFF');
    await source.db.run("INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('orphan', 'ghost', 'ghost', '2026-01-06', 15000, 'x')");
    expect(await refusal(source.liveBytes())).toBe('foreign_keys');
  });

  it('garbage after a valid header (the pages are not a database)', async () => {
    const source = await seededEnv('z');
    const bytes = source.liveBytes();
    const damaged = bytes.slice();
    for (let i = 100; i < damaged.length; i += 1) damaged[i] = (i * 31) & 0xff; // keeps header + size, ruins every page
    expect(await refusal(damaged)).toBe('unreadable');
  });
});

describe('prepareRestore: old backups are migrated as a copy', () => {
  /** A database at schema version `version` holding one small, valid history written with plain SQL. */
  async function legacyBytes(version: number, extraSql = ''): Promise<Uint8Array> {
    const env = await createSqlJsEnv({ migrated: false });
    await migrate(env.db, MIGRATIONS.slice(0, version));
    const t = 'x';
    await env.db.exec(`
      INSERT INTO members (id, name, created_at) VALUES ('m1', 'Anggota 1', '${t}');
      INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('p1', 'Periode', 1, 'active', '2026-01-06', '${t}');
      INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1);
      INSERT INTO weeks (period_id, number, date, host_member_id, status) VALUES ('p1', 1, '2026-01-06', 'm1', 'open');
      INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('pay1', 'p1', 'm1', '2026-01-06', 15000, '${t}');
      INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES ('pay1', 'p1', 'm1', 1, 15000, '2026-01-06');
      INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
        VALUES ('led1', 'p1', '2026-01-06', 15000, 'in', 'member_payment', 'm1', NULL, '', '${t}');
    `);
    if (extraSql) await env.db.exec(extraSql);
    return env.liveBytes();
  }

  it.each([1, 2, 3, 4, 5, 6])('a version %i backup is accepted, migrated and matches the fingerprint', async (version) => {
    const live = await seededEnv();
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: await legacyBytes(version) });
    try {
      expect(prepared.originalVersion).toBe(version);
      expect(prepared.candidate.userVersion).toBe(LATEST_VERSION);
      expect(prepared.candidate.ledgerCount).toBe(1);
      expect(prepared.candidate.paymentCount).toBe(1);
      expect(prepared.candidate.memberCount).toBe(1);
      const reference = await readSchema(prepared.memory.db);
      expect(reference).toEqual(prepared.referenceSchema);
      // the original file was not changed: only the copy was migrated
    } finally {
      await discardRestore(prepared);
    }
    expect(live.openMemoryCount()).toBe(0);
  });

  it('a version 4 backup restores to the latest version with archived_at NULL and no schema difference', async () => {
    const live = await seededEnv();
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: await legacyBytes(4) });
    try {
      expect(prepared.originalVersion).toBe(4);
      expect(prepared.candidate.userVersion).toBe(LATEST_VERSION);
      const rows = await prepared.memory.db.getAll<{ archived_at: string | null }>('SELECT archived_at FROM members');
      expect(rows).toEqual([{ archived_at: null }]);
      expect(diffSchema(prepared.referenceSchema, await readSchema(prepared.memory.db))).toEqual([]);
    } finally {
      await discardRestore(prepared);
    }
  });

  it('a version 5 backup with an archived member round-trips', async () => {
    const bytes = await legacyBytes(5, "INSERT INTO members (id, name, created_at, archived_at) VALUES ('arch', 'Diarsipkan', 'x', '2026-11-01T00:00:00.000Z')");
    const live = await createSqlJsEnv();
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes });
    try {
      expect(prepared.originalVersion).toBe(5);
      const row = await prepared.memory.db.getFirst<{ archived_at: string | null }>("SELECT archived_at FROM members WHERE id = 'arch'");
      expect(row?.archived_at).toBe('2026-11-01T00:00:00.000Z');
    } finally {
      await discardRestore(prepared);
    }
  });

  it('a backup newer than the latest version is refused as version_newer', async () => {
    const source = await seededEnv('s');
    await source.db.exec(`PRAGMA user_version = ${LATEST_VERSION + 1}`);
    const live = await seededEnv('l');
    expect(await codeOfAsync(prepareRestore(live.bridge, live.db, { kind: 'file', bytes: source.liveBytes() }))).toBe('version_newer');
  });

  it('the live data is only read while preparing', async () => {
    const live = await seededEnv();
    const before = live.liveBytes();
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: await legacyBytes(2) });
    await discardRestore(prepared);
    expect(live.liveBytes()).toEqual(before);
  });
});

describe('prepareRestore: classification against live', () => {
  it('same', async () => {
    const live = await seededEnv();
    const prepared = await prepareRestore(live.bridge, live.db, await fileInput(live));
    expect(prepared.classification).toEqual({ kind: 'same', lost: 0, added: 0 });
    await discardRestore(prepared);
  });

  it('older: entries made after the backup would be lost', async () => {
    const live = await seededEnv();
    const bytes = live.liveBytes();
    await addEntry(live.db, 'late1');
    await addEntry(live.db, 'late2');
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes });
    expect(prepared.classification).toEqual({ kind: 'older', lost: 2, added: 0 });
    await discardRestore(prepared);
  });

  it('newer: the file has more than live', async () => {
    const live = await seededEnv();
    const other = await cloneEnv(live);
    await addEntry(other.db, 'new1');
    const prepared = await prepareRestore(live.bridge, live.db, await fileInput(other));
    expect(prepared.classification).toEqual({ kind: 'newer', lost: 0, added: 1 });
    await discardRestore(prepared);
  });

  it('diverged: both sides have entries the other lacks', async () => {
    const live = await seededEnv();
    const other = await cloneEnv(live);
    await addEntry(other.db, 'phone2');
    await addEntry(live.db, 'phone1');
    const prepared = await prepareRestore(live.bridge, live.db, await fileInput(other));
    expect(prepared.classification).toEqual({ kind: 'diverged', lost: 1, added: 1 });
    await discardRestore(prepared);
  });

  it('shows the summary numbers of the file and of live', async () => {
    const live = await seededEnv('a');
    const otherEnv = await seededEnv('b');
    const prepared = await prepareRestore(live.bridge, live.db, await fileInput(otherEnv));
    expect(prepared.candidate.memberCount).toBe(4);
    expect(prepared.candidate.periodCount).toBe(1);
    expect(prepared.candidate.lastEntryDate).toBe('2026-12-31');
    expect(prepared.candidate.kas).toEqual((await createRepositories(otherEnv.db).ledger.getKasBalances()));
    expect(prepared.classification.kind).toBe('diverged');
    await discardRestore(prepared);
  });
});

describe('commitRestore: happy path', () => {
  it('replaces all data, keeps a verified safety copy and closes every memory database', async () => {
    const live = await seededEnv('a');
    const source = await seededEnv('b');
    const liveBefore = await summarizeDb(live.db);
    const store = new FakeSafetyStore();

    const prepared = await prepareRestore(live.bridge, live.db, await fileInput(source));
    const outcome = await commitRestore(live.bridge, live.db, prepared, store, NOW);

    expect(outcome.outcome).toBe('restored');
    expect(outcome.rollbackReason).toBeNull();
    await expectSameData(live, source);
    expect(live.openMemoryCount()).toBe(0);

    // the safety copy holds the OLD data and has the agreed name
    expect(outcome.safetyName).toBe(safetyFileName(NOW(), LATEST_VERSION));
    expect(parseSafetyName(outcome.safetyName)).not.toBeNull();
    expect([...store.files.keys()]).toEqual([outcome.safetyName]); // no temp file left
    const safety = await createSqlJsEnv({ initialBytes: store.files.get(outcome.safetyName) as Uint8Array, migrated: false });
    expect(await summarizeDb(safety.db)).toEqual(liveBefore);
  });

  it('the live database keeps working after a restore (foreign keys on, triggers in place, new entries possible)', async () => {
    const live = await seededEnv('a');
    const source = await seededEnv('b');
    const prepared = await prepareRestore(live.bridge, live.db, await fileInput(source));
    await commitRestore(live.bridge, live.db, prepared, new FakeSafetyStore(), NOW);
    expect((await live.db.getFirst<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys).toBe(1);
    await expect(live.db.run('DELETE FROM ledger_entries')).rejects.toThrow(/append-only/);
    await addEntry(live.db, 'after');
    expect((await healthCheck(live.db)).ok).toBe(true);
  });

  it('round trip: backup, restore into an empty phone, same kas balances and records', async () => {
    const original = await createSqlJsEnv();
    await seedClosedPeriodHistory(original.db);
    const balances = computeKasBalances(
      (await original.db.getAll<{ direction: 'in' | 'out'; amount: number; account: 'tunai' | 'debit' | 'piutang' | null; to_account: 'tunai' | 'debit' | 'piutang' | null }>('SELECT direction, amount, account, to_account FROM ledger_entries')).map((e) => ({
        direction: e.direction,
        amount: e.amount,
        account: e.account,
        toAccount: e.to_account,
      })),
    );
    expect(balances.actual).not.toBe(0);

    const { bytes } = await createBackupSnapshot(original.bridge, original.db);

    const newPhone = await createSqlJsEnv(); // empty, migrated: what a fresh install looks like
    const prepared = await prepareRestore(newPhone.bridge, newPhone.db, { kind: 'file', bytes });
    expect(prepared.classification.kind).toBe('newer');
    await commitRestore(newPhone.bridge, newPhone.db, prepared, new FakeSafetyStore(), NOW);

    await expectSameData(newPhone, original);
    expect(await createRepositories(newPhone.db).ledger.getKasBalances()).toEqual(await createRepositories(original.db).ledger.getKasBalances());
    expect(await createRepositories(newPhone.db).ledger.getKasBalances()).toEqual(balances);
    expect((await healthCheck(newPhone.db)).ok).toBe(true);
  });

  it('a restore from an old version file leaves the live database at the latest version', async () => {
    const live = await seededEnv();
    const old = await createSqlJsEnv({ migrated: false });
    await migrate(old.db, MIGRATIONS.slice(0, 2));
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: old.liveBytes() });
    await commitRestore(live.bridge, live.db, prepared, new FakeSafetyStore(), NOW);
    expect((await live.db.getFirst<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(LATEST_VERSION);
    expect((await summarizeDb(live.db)).ledgerCount).toBe(0);
  });

  it('keeps only the 5 newest safety copies', async () => {
    const live = await seededEnv('a');
    const store = new FakeSafetyStore();
    const names: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const source = await seededEnv(`s${i}`);
      const prepared = await prepareRestore(live.bridge, live.db, await fileInput(source));
      const outcome = await commitRestore(live.bridge, live.db, prepared, store, () => new Date(2026, 10, 6, 10, 0, i));
      names.push(outcome.safetyName);
    }
    expect([...store.files.keys()].sort()).toEqual(names.slice(2).sort());
  });

  it('a failed cleanup is reported, not fatal', async () => {
    const live = await seededEnv('a');
    const store = new FakeSafetyStore();
    for (let i = 0; i < 7; i += 1) {
      const prepared = await prepareRestore(live.bridge, live.db, await fileInput(await seededEnv(`q${i}`)));
      if (i === 6) store.removeFails = true;
      const outcome = await commitRestore(live.bridge, live.db, prepared, store, () => new Date(2026, 10, 6, 10, 0, i));
      expect(outcome.outcome).toBe('restored');
      expect(outcome.pruneFailed).toBe(i === 6);
    }
  });

  it('Mulai dari nol three times in a row still leaves the copy with the original data', async () => {
    const live = await seededEnv('a');
    const original = await summarizeDb(live.db);
    const store = new FakeSafetyStore();
    for (let i = 0; i < 3; i += 1) {
      const prepared = await prepareRestore(live.bridge, live.db, { kind: 'empty' });
      await commitRestore(live.bridge, live.db, prepared, store, () => new Date(2026, 10, 6, 10, 0, i));
    }
    const withData: Summary[] = [];
    for (const name of store.files.keys()) {
      const copy = await createSqlJsEnv({ initialBytes: await store.readBytes(name), migrated: false });
      const summary = await summarizeDb(copy.db);
      if (summary.ledgerCount > 0) withData.push(summary);
    }
    expect(withData).toEqual([original]);
    expect([...store.files.keys()].filter((n) => n.endsWith('-kosong.db')).length).toBe(1);
  });

  it('a rolled back restore prunes nothing', async () => {
    const live = await seededEnv('a');
    const store = new FakeSafetyStore();
    for (let i = 0; i < 6; i += 1) store.files.set(`pengaman-2026010${i + 1}-100000-v${LATEST_VERSION}.db`, new Uint8Array(1));
    const prepared = await prepareRestore(live.bridge, live.db, await fileInput(await seededEnv('b')));
    const bridge: NativeBridge = {
      ...live.bridge,
      copyIntoLive: async (source) => {
        if (source === prepared.memory) throw new Error('backup failed');
        await live.bridge.copyIntoLive(source);
      },
    };
    const outcome = await commitRestore(bridge, live.db, prepared, store, NOW);
    expect(outcome.outcome).toBe('rolled_back');
    expect(store.files.size).toBe(7);
  });

  it('closing a memory database that throws never hides a successful restore', async () => {
    const live = await seededEnv('a');
    const source = await seededEnv('b');
    const bridge: NativeBridge = {
      ...live.bridge,
      openMemory: async (bytes) => {
        const memory = await live.bridge.openMemory(bytes);
        const realClose = memory.close.bind(memory);
        // Same object (the test bridge looks memory databases up by identity); only close misbehaves.
        memory.close = async () => {
          await realClose();
          throw new Error('close failed');
        };
        return memory;
      },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const prepared = await prepareRestore(bridge, live.db, await fileInput(source));
    const outcome = await commitRestore(bridge, live.db, prepared, new FakeSafetyStore(), NOW);
    warn.mockRestore();
    expect(outcome.outcome).toBe('restored');
    await expectSameData(live, source);
  });

  it('discardRestore does not throw when closing fails', async () => {
    const live = await seededEnv('a');
    const bridge: NativeBridge = {
      ...live.bridge,
      openMemory: async (bytes) => {
        const memory = await live.bridge.openMemory(bytes);
        return { ...memory, close: async () => Promise.reject(new Error('close failed')) };
      },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const prepared = await prepareRestore(bridge, live.db, { kind: 'empty' });
    await expect(discardRestore(prepared)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('a second start of the same restore is refused (double tap)', async () => {
    const live = await seededEnv('a');
    const prepared = await prepareRestore(live.bridge, live.db, await fileInput(await seededEnv('b')));
    const store = new FakeSafetyStore();
    const first = commitRestore(live.bridge, live.db, prepared, store, NOW);
    const second = commitRestore(live.bridge, live.db, prepared, store, NOW);
    expect(await codeOfAsync(second)).toBe('busy');
    expect((await first).outcome).toBe('restored');
  });
});

describe('commitRestore: failures leave the data intact or recover automatically', () => {
  interface Setup {
    live: SqlJsEnv;
    source: SqlJsEnv;
    before: Awaited<ReturnType<typeof summarizeDb>>;
    beforeBytes: Uint8Array;
    prepared: PreparedRestore;
    store: FakeSafetyStore;
  }

  async function setup(bridgeWrap?: (b: NativeBridge, real: SqlJsEnv) => NativeBridge): Promise<Setup & { bridge: NativeBridge }> {
    const live = await seededEnv('a');
    const source = await seededEnv('b');
    const bridge = bridgeWrap ? bridgeWrap(live.bridge, live) : live.bridge;
    const prepared = await prepareRestore(bridge, live.db, await fileInput(source));
    return { live, source, before: await summarizeDb(live.db), beforeBytes: live.liveBytes(), prepared, store: new FakeSafetyStore(), bridge };
  }

  async function expectUntouched(s: Setup): Promise<void> {
    expect(await summarizeDb(s.live.db)).toEqual(s.before);
    expect((await healthCheck(s.live.db)).ok).toBe(true);
    expect(s.live.openMemoryCount()).toBe(0);
  }

  describe('before the live data is touched (nothing changes, an error is thrown)', () => {
    it('serializing the live database fails', async () => {
      const s = await setup((b) => ({ ...b, serializeLive: async () => Promise.reject(new Error('serialize failed')) }));
      expect(await codeOfAsync(commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
      await expectUntouched(s);
      expect(s.live.liveBytes()).toEqual(s.beforeBytes); // byte for byte the same
      expect(s.store.files.size).toBe(0);
    });

    it('reading the live data (before the safety copy) fails', async () => {
      const s = await setup((b) => ({
        ...b,
        liveRaw: { ...b.liveRaw, getAll: async () => Promise.reject(new Error('read failed')) },
      }));
      expect(await codeOfAsync(commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
      await expectUntouched(s);
      expect(s.live.liveBytes()).toEqual(s.beforeBytes);
      expect(s.store.files.size).toBe(0);
    });

    it('the safety copy renames fine but a later step fails: never safety_failed', async () => {
      const s = await setup();
      let copies = 0;
      const bridge: NativeBridge = {
        ...s.bridge,
        copyIntoLive: async (source) => {
          copies += 1;
          if (copies === 1) throw new Error('copy failed');
          await s.bridge.copyIntoLive(source);
        },
      };
      const outcome = await commitRestore(bridge, s.live.db, s.prepared, s.store, NOW);
      expect(outcome.outcome).toBe('rolled_back');
      const s2 = await setup((b) => ({ ...b, copyIntoLive: async () => Promise.reject(new Error('always fails')) }));
      const code = await codeOfAsync(commitRestore(s2.bridge, s2.live.db, s2.prepared, s2.store, NOW));
      expect(code).toBe('restore_failed');
      expect(code).not.toBe('safety_failed');
    });

    it.each(['writeTemp', 'readBytes', 'rename'] as const)('the safety store fails at %s', async (step) => {
      const s = await setup();
      s.store.failOn = step;
      expect(await codeOfAsync(commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
      await expectUntouched(s);
      expect(s.store.files.has('pengaman.tmp')).toBe(false); // temp file cleaned up
    });

    it('the safety copy is truncated when read back', async () => {
      const s = await setup();
      s.store.truncateReadBy = 512;
      expect(await codeOfAsync(commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
      await expectUntouched(s);
    });

    it('the safety copy is corrupt when read back', async () => {
      const s = await setup();
      s.store.corruptRead = true;
      expect(await codeOfAsync(commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
      await expectUntouched(s);
    });

    it('the safety copy has the same size but other bytes when read back', async () => {
      const s = await setup();
      s.store.corruptRead = true; // flips one byte, size unchanged
      expect(await codeOfAsync(commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
      await expectUntouched(s);
    });

    it('opening the safety copy in memory fails', async () => {
      let failOpen = false;
      const s = await setup((b) => ({
        ...b,
        openMemory: async (bytes) => (failOpen ? Promise.reject(new Error('cannot open')) : b.openMemory(bytes)),
      }));
      failOpen = true; // prepareRestore is done; the next open is the one for the safety copy
      expect(await codeOfAsync(commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('safety_failed');
      failOpen = false;
      await expectUntouched(s);
    });
  });

  describe('after the copy started (verification differs: the old data is put back automatically)', () => {
    function copyBehaviour(modes: ('ok' | 'throw' | 'ignore' | 'wipe')[]) {
      return (b: NativeBridge): NativeBridge => {
        let call = 0;
        return {
          ...b,
          copyIntoLive: async (source) => {
            const mode = modes[call] ?? 'ok';
            call += 1;
            if (mode === 'throw') throw new Error('backup failed');
            if (mode === 'ignore') return; // expo-sqlite ignores backup_step's result: the copy may silently not happen
            if (mode === 'wipe') {
              const empty = await b.openMemory(null);
              try {
                await migrate(empty.db);
                await b.copyIntoLive(empty);
              } finally {
                await empty.close();
              }
              return;
            }
            await b.copyIntoLive(source);
          },
        };
      };
    }

    it.each(['throw', 'ignore', 'wipe'] as const)('the first copy %s: rolled back, old data intact', async (mode) => {
      const s = await setup(copyBehaviour([mode]));
      const outcome = await commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW);
      expect(outcome.outcome).toBe('rolled_back');
      expect(outcome.rollbackReason).toBeTruthy();
      await expectUntouched(s);
      expect(s.store.files.has(outcome.safetyName)).toBe(true); // the safety copy stays
    });

    it('the copy and the recovery both fail: restore_failed, safety copy kept', async () => {
      const s = await setup(copyBehaviour(['wipe', 'throw']));
      const error = await commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BackupError);
      expect((error as BackupError).code).toBe('restore_failed');
      expect([...s.store.files.keys()].some((n) => n.startsWith('pengaman-'))).toBe(true);
      expect(s.live.openMemoryCount()).toBe(0);
    });

    it('the recovery copy is verified too (a recovery that restores the wrong thing is not trusted)', async () => {
      const s = await setup(copyBehaviour(['wipe', 'wipe']));
      expect(await codeOfAsync(commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW))).toBe('restore_failed');
    });

    it('the error text holds no file path', async () => {
      const s = await setup(copyBehaviour(['wipe', 'throw']));
      const error = (await commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW).catch((e: unknown) => e)) as Error;
      expect(error.message).not.toMatch(/[\\/]/);
    });
  });

  it('foreign_keys switched off by the copy is switched on again and the restore stands', async () => {
    const s = await setup();
    s.live.dropForeignKeysOnCopy.value = true;
    const outcome = await commitRestore(s.bridge, s.live.db, s.prepared, s.store, NOW);
    expect(outcome.outcome).toBe('restored');
    expect((await s.live.db.getFirst<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys).toBe(1);
  });
});

describe('Pulihkan salinan pengaman (same path)', () => {
  it('brings back the data from before the last restore', async () => {
    const live = await seededEnv('a');
    const original = await cloneEnv(live);
    const store = new FakeSafetyStore();

    const first = await prepareRestore(live.bridge, live.db, await fileInput(await seededEnv('b')));
    const outcome = await commitRestore(live.bridge, live.db, first, store, NOW);
    expect((await summarizeDb(live.db)).memberCount).toBe(4);

    const safetyBytes = await store.readBytes(outcome.safetyName);
    const second = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: safetyBytes });
    expect(second.classification.kind).toBe('diverged'); // the data of b is lost again, hence PULIHKAN is required
    await commitRestore(live.bridge, live.db, second, store, () => new Date(2026, 10, 6, 10, 5, 0));
    await expectSameData(live, original);
  });
});

describe('Mulai dari nol', () => {
  it('replaces everything with an empty migrated database, after a safety copy', async () => {
    const live = await seededEnv('a');
    const before = await summarizeDb(live.db);
    const store = new FakeSafetyStore();

    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'empty' });
    expect(prepared.source).toBe('empty');
    expect(prepared.classification.kind).toBe('older');
    expect(prepared.classification.lost).toBe(before.ledgerCount + before.paymentCount);
    expect(prepared.candidate.ledgerCount).toBe(0);

    const outcome = await commitRestore(live.bridge, live.db, prepared, store, NOW);
    expect(outcome.outcome).toBe('restored');

    const after = await summarizeDb(live.db);
    expect(after.ledgerCount).toBe(0);
    expect(after.memberCount).toBe(0);
    expect(after.userVersion).toBe(LATEST_VERSION);
    expect(after.kas.actual).toBe(0);
    expect((await healthCheck(live.db)).ok).toBe(true);

    // the old data is not gone: it is in the safety copy
    const safety = await createSqlJsEnv({ initialBytes: await store.readBytes(outcome.safetyName), migrated: false });
    expect(await summarizeDb(safety.db)).toEqual(before);
  });

  it('the new empty database is usable (a member and a period can be created)', async () => {
    const live = await seededEnv('a');
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'empty' });
    await commitRestore(live.bridge, live.db, prepared, new FakeSafetyStore(), NOW);
    const repos = createRepositories(live.db);
    const member = await repos.members.create('Baru');
    expect((await repos.members.list()).map((m) => m.id)).toEqual([member.id]);
    await repos.periods.create({ name: 'P1', startDate: '2027-01-05', memberIds: [member.id] });
    expect((await healthCheck(live.db)).ok).toBe(true);
  });

  it('on an already empty database it is classified as the same', async () => {
    const live = await createSqlJsEnv();
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'empty' });
    expect(prepared.classification.kind).toBe('same');
    await discardRestore(prepared);
  });

  it('a failure while resetting recovers the old data', async () => {
    const live = await seededEnv('a');
    const before = await summarizeDb(live.db);
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'empty' });
    let calls = 0;
    const bridge: NativeBridge = {
      ...live.bridge,
      copyIntoLive: async (source) => {
        calls += 1;
        if (calls === 1) throw new Error('backup failed');
        await live.bridge.copyIntoLive(source);
      },
    };
    const outcome = await commitRestore(bridge, live.db, prepared, new FakeSafetyStore(), NOW);
    expect(outcome.outcome).toBe('rolled_back');
    expect(await summarizeDb(live.db)).toEqual(before);
  });
});

describe('the reference schema', () => {
  it('is built from MIGRATIONS, not written down: adding a migration changes it', async () => {
    const env = await createSqlJsEnv({ migrated: false });
    const extra = [...MIGRATIONS, { version: MIGRATIONS.length + 1, name: 'probe', sql: 'CREATE TABLE probe (x INTEGER);' }];
    await migrate(env.db, extra);
    const names = (await readSchema(env.db)).map((o) => o.name);
    expect(names).toContain('probe');
    const fresh = await createSqlJsEnv();
    expect((await readSchema(fresh.db)).map((o) => o.name)).not.toContain('probe');
  });
});
