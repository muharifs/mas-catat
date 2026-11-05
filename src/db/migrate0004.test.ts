// Migration 0004 on existing data: these tests start from a real version 3 database (an ended period with credit)
// and upgrade it. They run on sql.js, so the SQL is proven here but the expo-sqlite adapter only on the phone.
import type { Db } from './db';
import { createRepositories } from './index';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createSqlJsDb } from './testing/sqlJsDriver';

const userVersion = async (db: Db): Promise<number> =>
  (await db.getFirst<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? -1;
const count = async (db: Db, table: string): Promise<number> =>
  (await db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? -1;

const LEDGER =
  "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account) VALUES (?, 'p1', ?, ?, ?, ?, 'm1', ?, '', 't', ?)";

/** A version 3 database: one ENDED period (N=1) where the member paid 30.000 for 15.000 of dues = 15.000 credit. */
async function v3WithEndedPeriod(): Promise<Db> {
  const db = await createSqlJsDb();
  await migrate(db, MIGRATIONS.slice(0, 3));
  await db.run("INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', 't')");
  await db.run("INSERT INTO periods (id, name, member_count, status, start_date, end_date, created_at) VALUES ('p1', 'Lama', 1, 'closed', '2026-01-04', '2026-01-10', 't')");
  await db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1)");
  await db.run("INSERT INTO weeks (period_id, number, date, host_member_id, status, closed_at) VALUES ('p1', 1, '2026-01-04', 'm1', 'closed', 't')");
  await db.run(LEDGER, ['e1', '2026-01-04', 30_000, 'in', 'member_payment', null, 'tunai']);
  await db.run("INSERT INTO payments (id, period_id, member_id, date, amount, created_at, ledger_entry_id) VALUES ('pa1', 'p1', 'm1', '2026-01-04', 30000, 't', 'e1')");
  await db.run("INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES ('pa1', 'p1', 'm1', 1, 15000, '2026-01-04')");
  await db.run(LEDGER, ['e2', '2026-01-05', 10_000, 'out', 'host_payout', 1, 'tunai']);
  await db.run(LEDGER, ['e3', '2026-01-05', 5_000, 'in', 'host_offset', 1, null]); // an old entry without pos
  return db;
}

describe('migration 0004 (period close and member credit)', () => {
  it('upgrades version 3 with existing data and changes none of it', async () => {
    const db = await v3WithEndedPeriod();
    expect(await userVersion(db)).toBe(3);
    const snapshot = async () => ({
      ledger: await db.getAll('SELECT * FROM ledger_entries ORDER BY rowid'),
      payments: await db.getAll('SELECT * FROM payments ORDER BY rowid'),
      allocations: await db.getAll('SELECT * FROM allocations ORDER BY rowid'),
      periods: await db.getAll('SELECT * FROM periods ORDER BY rowid'),
      weeks: await db.getAll('SELECT * FROM weeks ORDER BY number'),
    });
    const before = await snapshot();

    expect(await migrate(db)).toEqual({ from: 3, to: MIGRATIONS.length });
    expect(await userVersion(db)).toBe(4);

    expect(await snapshot()).toEqual(before); // no back-fill, nothing rewritten
    expect(await count(db, 'credit_applications')).toBe(0);
    const names = (await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')")).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'credit_applications',
        'ux_ledger_writeoff',
        'credit_applications_no_update',
        'credit_applications_no_delete',
        'ledger_writeoff_shape',
        'ledger_refund_shape',
      ]),
    );
    expect(await migrate(db)).toEqual({ from: 4, to: 4 }); // idempotent
  });

  it('also upgrades an empty version 3 database', async () => {
    const db = await createSqlJsDb();
    await migrate(db, MIGRATIONS.slice(0, 3));
    expect(await migrate(db)).toEqual({ from: 3, to: MIGRATIONS.length });
  });

  it('shows the credit of an old ended period, refunds it, or carries it into a new period', async () => {
    const refundDb = await v3WithEndedPeriod();
    await migrate(refundDb);
    let n = 0;
    const deps = { newId: () => `n${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' };
    const repos = createRepositories(refundDb, deps);
    expect(await repos.credits.listRefundable()).toEqual([{ periodId: 'p1', periodName: 'Lama', memberId: 'm1', amount: 15_000 }]);
    const entry = await repos.credits.refund('p1', 'm1', '2026-12-30', 'tunai');
    expect(entry).toMatchObject({ type: 'credit_refund', amount: 15_000, account: 'tunai', periodId: 'p1' });
    expect(await repos.credits.listRefundable()).toEqual([]);

    const carryDb = await v3WithEndedPeriod();
    await migrate(carryDb);
    const carryRepos = createRepositories(carryDb, deps);
    const next = await carryRepos.periods.create({ name: 'Baru', startDate: '2027-01-01', memberIds: ['m1'] });
    expect((await carryRepos.payments.getWeekStatuses(next.id, 'm1')).map((s) => [s.credited, s.outstanding])).toEqual([[15_000, 0]]);
    expect(await carryRepos.credits.getAvailable('p1', 'm1')).toBe(0);
  });

  it('enforces the new constraints in the database itself', async () => {
    const db = await v3WithEndedPeriod();
    await migrate(db);
    const writeoff = "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account) VALUES (?, 'p1', '2026-01-10', 1000, 'out', 'debt_writeoff', 'm1', NULL, '', 't', NULL)";
    await db.run(writeoff, ['w1']);
    await expect(db.run(writeoff, ['w2'])).rejects.toThrow(/UNIQUE/i);
    await expect(
      db.run("INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account) VALUES ('w3', 'p1', '2026-01-10', 1000, 'out', 'debt_writeoff', NULL, NULL, '', 't', NULL)"),
    ).rejects.toThrow(/debt_writeoff/);
    await expect(
      db.run("INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account) VALUES ('r1', 'p1', '2026-01-10', 1000, 'out', 'credit_refund', 'm1', NULL, '', 't', 'piutang')"),
    ).rejects.toThrow(/credit_refund/);

    const apply = (kind: string, from: string, to: string, amount: number | string) =>
      db.run('INSERT INTO credit_applications (kind, from_period_id, member_id, to_period_id, week, amount, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)', [kind, from, 'm1', to, amount, 't']);
    await db.run("INSERT INTO periods (id, name, member_count, start_date, created_at) VALUES ('p2', 'Baru', 1, '2027-01-01', 't')");
    await db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p2', 'm1', 1)");
    await db.run("INSERT INTO weeks (period_id, number, date) VALUES ('p2', 1, '2027-01-01')");
    await expect(apply('other', 'p1', 'p2', 1000)).rejects.toThrow(/CHECK/i); // kind
    await expect(apply('settle_debt', 'p1', 'p2', 1000)).rejects.toThrow(/CHECK/i); // settle_debt stays in one period
    await expect(apply('carry_over', 'p1', 'p1', 1000)).rejects.toThrow(/CHECK/i); // carry_over crosses periods
    await expect(apply('carry_over', 'p1', 'p2', 0)).rejects.toThrow(/CHECK/i); // amount > 0
    await expect(apply('carry_over', 'p1', 'p2', 1.5)).rejects.toThrow(/CHECK/i); // integer only
    await apply('carry_over', 'p1', 'p2', 1000);
    await expect(db.run('UPDATE credit_applications SET amount = 5')).rejects.toThrow(/append-only/);
    await expect(db.run('DELETE FROM credit_applications')).rejects.toThrow(/append-only/);
  });
});
