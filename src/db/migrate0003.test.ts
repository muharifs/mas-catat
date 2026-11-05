// Migration 0003 is the riskiest one of M5a: it back-fills payments.ledger_entry_id from existing data.
// These tests start from a real version 2 database holding M4-style data.
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
  "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account) VALUES (?, 'p1', ?, ?, ?, ?, ?, ?, '', 't', ?)";
const PAYMENT = "INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES (?, 'p1', ?, ?, ?, 't')";

/** Writes a payment and its member_payment entry the way M4's payments.record did: both, in order. */
async function m4Payment(db: Db, paymentId: string, entryId: string, member: string, date: string, amount: number): Promise<void> {
  await db.run(PAYMENT, [paymentId, member, date, amount]);
  await db.run(LEDGER, [entryId, date, amount, 'in', 'member_payment', member, null, 'tunai']);
}

/** A version 2 database holding M4-style data, including identical payments on the same day. */
async function v2WithM4Data(): Promise<Db> {
  const db = await createSqlJsDb();
  await migrate(db, MIGRATIONS.slice(0, 2));
  await db.run("INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', 't'), ('m2', 'Budi', 't'), ('m3', 'Cici', 't')");
  await db.run("INSERT INTO periods (id, name, member_count, start_date, created_at) VALUES ('p1', 'P', 3, '2026-01-01', 't')");
  await db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1), ('p1', 'm2', 2), ('p1', 'm3', 3)");
  await db.run(
    "INSERT INTO weeks (period_id, number, date, host_member_id) VALUES ('p1', 1, '2026-01-01', 'm1'), ('p1', 2, '2026-01-08', 'm2'), ('p1', 3, '2026-01-15', 'm3')",
  );
  await m4Payment(db, 'pa1', 'e1', 'm1', '2026-01-04', 15_000); // identical to pa2 and pa5
  await m4Payment(db, 'pa2', 'e2', 'm1', '2026-01-04', 15_000);
  await m4Payment(db, 'pa3', 'e3', 'm2', '2026-01-04', 15_000); // same day and amount, other member
  await db.run(LEDGER, ['e4', '2026-01-04', 30_000, 'out', 'host_payout', 'm1', 1, null]); // pre-pos payout, no payment
  await m4Payment(db, 'pa4', 'e5', 'm1', '2026-01-04', 30_000); // same day, other amount
  await db.run(LEDGER, ['e6', '2026-01-04', 15_000, 'in', 'host_offset', 'm1', 3, null]);
  await db.run("INSERT INTO offset_credits (ledger_entry_id, period_id, member_id, week, amount) VALUES ('e6', 'p1', 'm1', 3, 15000)");
  await m4Payment(db, 'pa5', 'e7', 'm1', '2026-01-04', 15_000); // third identical one, after other entries
  await db.run(PAYMENT, ['pa6', 'm3', '2026-01-04', 15_000]); // a payment whose ledger entry is missing
  await db.run("INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES ('pa1', 'p1', 'm1', 1, 15000, '2026-01-04')");
  await db.run("INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES ('pa2', 'p1', 'm1', 2, 15000, '2026-01-04')");
  return db;
}

describe('migration 0003 (kas moves and corrections)', () => {
  it('upgrades version 2 with M4 data and pairs the n-th payment with the n-th entry, identical ones included', async () => {
    const db = await v2WithM4Data();
    expect(await userVersion(db)).toBe(2);
    const before = {
      entries: await db.getAll<Record<string, unknown>>('SELECT * FROM ledger_entries ORDER BY rowid'),
      payments: await count(db, 'payments'),
      allocations: await db.getAll('SELECT * FROM allocations ORDER BY rowid'),
    };

    expect(await migrate(db)).toEqual({ from: 2, to: MIGRATIONS.length });
    expect(await userVersion(db)).toBe(3);

    const links = await db.getAll<{ id: string; ledger_entry_id: string | null }>('SELECT id, ledger_entry_id FROM payments ORDER BY rowid');
    expect(links.map((l) => [l.id, l.ledger_entry_id])).toEqual([
      ['pa1', 'e1'],
      ['pa2', 'e2'],
      ['pa3', 'e3'],
      ['pa4', 'e5'],
      ['pa5', 'e7'],
      ['pa6', null], // no matching ledger entry: stays unlinked, nothing is guessed
    ]);

    // Nothing that existed changed; the new column is NULL on old rows.
    const after = await db.getAll<Record<string, unknown>>('SELECT * FROM ledger_entries ORDER BY rowid');
    expect(after.every((r) => r.to_account === null)).toBe(true);
    const withoutNewColumn = after.map(({ to_account: _ignored, ...rest }) => rest);
    expect(withoutNewColumn).toEqual(before.entries);
    expect(await count(db, 'payments')).toBe(before.payments);
    expect(await db.getAll('SELECT * FROM allocations ORDER BY rowid')).toEqual(before.allocations);
    expect(await count(db, 'offset_credits')).toBe(1);
  });

  it('keeps old rows working with the new code: reverse the SECOND of three identical payments', async () => {
    const db = await v2WithM4Data();
    await migrate(db);
    const repos = createRepositories(db, { newId: () => 'new1', now: () => '2026-12-31T12:00:00.000Z' });

    const reversal = await repos.payments.reverse('pa2', 'dobel');
    expect(reversal).toMatchObject({ reversesEntryId: 'e2', amount: 15_000, direction: 'out', account: 'tunai', memberId: 'm1' });
    // Only pa2's allocation (week 2) stops counting; pa1 (week 1) and the offset (week 3) stay.
    const statuses = await repos.payments.getWeekStatuses('p1', 'm1');
    expect(statuses.map((s) => [s.paid, s.offset])).toEqual([
      [15_000, 0],
      [0, 0],
      [0, 15_000],
    ]);
    expect((await repos.ledger.getEntry('e2'))?.reversedById).toBe('new1');
    expect((await repos.ledger.getEntry('e1'))?.reversedById).toBeNull();
    // The payment without a ledger entry cannot be reversed (no guessing).
    await expect(repos.payments.reverse('pa6', 'x')).rejects.toThrow(/no ledger entry/);
    // Entries from before pos existed (e4, e6) stay out of the balances: 5 payments (90.000) minus the reversal (15.000).
    expect(await repos.ledger.getKasBalances()).toMatchObject({ tunai: 75_000, debit: 0, piutang: 0 });
  });

  it('is idempotent and adds the new structures', async () => {
    const db = await v2WithM4Data();
    await migrate(db);
    expect(await migrate(db)).toEqual({ from: 3, to: 3 });
    const names = (await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')")).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['payment_reversals', 'ux_ledger_reverses', 'ux_payments_ledger_entry']));
    await expect(
      db.run(
        "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, created_at, account, to_account) VALUES ('z', 'p1', '2026-01-01', 1, 'out', 'transfer', 't', 'tunai', 'bank')",
      ),
    ).rejects.toThrow(/CHECK/i);
  });

  it('also upgrades an empty version 2 database', async () => {
    const db = await createSqlJsDb();
    await migrate(db, MIGRATIONS.slice(0, 2));
    expect(await migrate(db)).toEqual({ from: 2, to: MIGRATIONS.length });
  });
});
