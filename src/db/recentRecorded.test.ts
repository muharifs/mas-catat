// Home "Terakhir" follows the order of RECORDING (listRecentRecorded), Riwayat keeps the transaction-date order (listKas).
import { createRepositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

async function setup() {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => '2026-11-20T12:00:00.000Z' });
  const m = (await repos.members.create('Ani')).id;
  await repos.periods.create({ name: 'P1', startDate: '2026-11-17', memberIds: [m] });
  return { db, repos };
}

describe('listRecentRecorded', () => {
  it('puts a back-dated entry typed last on top, while listKas keeps the date order', async () => {
    const { repos } = await setup();
    const a = await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-11-18', amount: 100_000, account: 'tunai' });
    const b = await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-11-19', amount: 5_000, account: 'tunai', note: 'x' });
    const c = await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-11-10', amount: 7_000, account: 'tunai', note: 'mundur' });

    expect((await repos.ledger.listRecentRecorded(3)).map((e) => e.id)).toEqual([c.id, b.id, a.id]);
    // Riwayat order is untouched: newest transaction date first, so the back-dated entry is last.
    expect((await repos.ledger.listKas()).map((e) => e.id)).toEqual([b.id, a.id, c.id]);
  });

  it('limits the list, returns items with their reversal id, and handles an empty ledger', async () => {
    const { repos } = await setup();
    expect(await repos.ledger.listRecentRecorded(3)).toEqual([]);
    const a = await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-11-18', amount: 5_000, account: 'tunai', note: 'a' });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-11-01', amount: 50_000, account: 'tunai' });
    const reversal = await repos.ledger.reverseEntry(a.id, 'salah');
    const top = await repos.ledger.listRecentRecorded(2);
    expect(top).toHaveLength(2);
    expect(top[0]?.id).toBe(reversal.id);
    expect(top.every((e) => e.id !== a.id)).toBe(true);
    expect((await repos.ledger.listRecentRecorded(10)).find((e) => e.id === a.id)?.reversedById).toBe(reversal.id);
  });

  it('uses insert order, not created_at: equal timestamps still keep the recording order', async () => {
    const { db, repos } = await setup(); // the injected clock gives every entry the same created_at
    const first = await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-11-18', amount: 10_000, account: 'tunai' });
    const second = await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-11-18', amount: 20_000, account: 'tunai' });
    const stamps = await db.getAll<{ created_at: string }>('SELECT DISTINCT created_at FROM ledger_entries');
    expect(stamps).toHaveLength(1);
    expect((await repos.ledger.listRecentRecorded(2)).map((e) => e.id)).toEqual([second.id, first.id]);
  });
});
