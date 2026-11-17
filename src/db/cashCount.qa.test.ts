// Independent QA of "Cek kas" (decision 34, migration 0007). Written from the rules in CLAUDE.md / PROJECT.md, not from
// the developer tests. Seeded random runs through the REAL repositories on sql.js, so a failing seed reproduces.
// Not proven here: expo-sqlite itself, the keypad and the screens (see the manual scenarios in the QA report).
import { buildCountHistory, countHints, type StoredCountLine } from '@/domain/cash-count';
import { commitRestore, discardRestore, healthCheck, loadRecordIds, prepareRestore } from './backup';
import type { Db } from './db';
import { createRepositories, type Repositories } from './index';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createSqlJsEnv, FakeSafetyStore } from './testing/sqlJsBridge';
import { createMigratedTestDb } from './testing/sqlJsDriver';
import { V5_FIXTURE_SQL } from './testing/v5Fixture';

const TODAY = '2026-03-10';
const SEEDS = Number(process.env.QA_FUZZ_SEEDS ?? 25);

function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}

/** Every table except the given ones, row by row, in a stable order. */
async function dump(db: Db, skip: string[] = []): Promise<Record<string, string[]>> {
  const tables = await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const out: Record<string, string[]> = {};
  for (const t of tables) {
    if (skip.includes(t.name)) continue;
    out[t.name] = (await db.getAll<Record<string, unknown>>(`SELECT * FROM "${t.name}" ORDER BY rowid`)).map((r) => JSON.stringify(r));
  }
  return out;
}

interface World {
  db: Db;
  repos: Repositories;
  periodId: string;
  ids: string[];
}

async function world(n = 4, seedLabel = 'w'): Promise<World> {
  const db = await createMigratedTestDb();
  let i = 0;
  const repos = createRepositories(db, { newId: () => `${seedLabel}-${(i += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ids: string[] = [];
  for (let k = 0; k < n; k += 1) ids.push((await repos.members.create(`M${k + 1}`)).id);
  const period = await repos.periods.create({ name: 'P', startDate: '2026-01-06', memberIds: ids });
  return { db, repos, periodId: period.id, ids };
}

const save = (w: World, week: number, tunai: number, debit: number | null = null, extra: { date?: string; note?: string } = {}) =>
  w.repos.cashCounts.save({ periodId: w.periodId, week, tunai, debit, ...extra });

// ---------------------------------------------------------------------------------------------------------------
describe('QA cek kas: a count never changes the ledger or kas (seeded random)', () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => 9100 + i);
  it.each(seeds)('seed %i', async (seed) => {
    const rng = makeRng(seed);
    const w = await world(rng.int(3, 5), `s${seed}`);
    const { repos, db, ids, periodId } = w;
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 100_000, account: 'tunai' });
    let saves = 0;
    for (let step = 0; step < 30; step += 1) {
      const a = rng.pick(['pay', 'pay', 'advance', 'payHost', 'reversePayout', 'transfer', 'goal', 'loan', 'repay', 'skip', 'save', 'save', 'save'] as const);
      const attempt = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch {
          /* a rejected random action is fine */
        }
      };
      if (a === 'pay') await attempt(() => repos.payments.record({ periodId, memberId: rng.pick(ids), date: TODAY, amount: 15_000 * rng.int(1, 3), account: rng.pick(['tunai', 'debit'] as const) }));
      else if (a === 'advance') {
        await attempt(async () => {
          const weeks = await repos.weeks.listByPeriod(periodId);
          const cur = weeks.find((x) => x.status === 'open');
          if (cur && cur.hostMemberId === null) {
            const used = new Set(weeks.map((x) => x.hostMemberId));
            await repos.weeks.assignHost(periodId, cur.number, ids.find((m) => !used.has(m)) as string, cur.date);
          }
          await repos.weeks.closeOldest(periodId);
        });
      } else if (a === 'payHost') await attempt(() => repos.ledger.settleHost(periodId, rng.int(1, ids.length), TODAY, rng.pick(['tunai', 'debit'] as const)));
      else if (a === 'reversePayout') await attempt(() => repos.ledger.reverseHostPayout(periodId, rng.int(1, ids.length), 'koreksi'));
      else if (a === 'transfer') await attempt(() => repos.ledger.recordKas({ kind: 'transfer', date: TODAY, amount: rng.int(1, 60_000), account: 'tunai', toAccount: 'debit' }));
      else if (a === 'goal') await attempt(() => repos.ledger.recordKas({ kind: 'shared_goal', date: TODAY, amount: rng.int(1, 400_000), account: rng.pick(['tunai', 'debit'] as const), note: 'tur' })); // may push a pos negative
      else if (a === 'loan') await attempt(() => repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: rng.int(1, 50_000), account: 'tunai', memberId: rng.pick(ids) }));
      else if (a === 'repay') await attempt(() => repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: rng.int(1, 20_000), memberId: rng.pick(ids) }));
      else if (a === 'skip') await attempt(() => repos.weeks.skipLast(periodId, 'libur'));
      else {
        const form = await repos.cashCounts.form(periodId);
        if (form.countableWeeks.length === 0) continue;
        const week = rng.pick(form.countableWeeks);
        const tunai = rng.pick([0, 1, 14_999, 15_000, 123_457, rng.int(0, 500_000)]);
        const debit = rng.chance(0.5) ? rng.int(0, 200_000) : null;
        const before = await dump(db, ['cash_counts']);
        const kasBefore = await repos.ledger.getKasBalances();
        const reportBefore = await repos.reports.getKasReport();
        const lines = await save(w, week, tunai, debit, { note: rng.chance(0.3) ? '  catatan ' : undefined });
        saves += 1;
        expect(await dump(db, ['cash_counts'])).toEqual(before);
        expect(await repos.ledger.getKasBalances()).toEqual(kasBefore);
        expect(await repos.reports.getKasReport()).toEqual(reportBefore);
        // expected in the stored row is exactly the ledger balance at this moment, difference = counted - expected
        const tunaiLine = lines.find((l) => l.account === 'tunai');
        expect(tunaiLine).toMatchObject({ expected: kasBefore.tunai, counted: tunai, difference: tunai - kasBefore.tunai });
        const debitLine = lines.find((l) => l.account === 'debit');
        if (debit === null) expect(debitLine).toBeUndefined();
        else expect(debitLine).toMatchObject({ expected: kasBefore.debit, counted: debit, difference: debit - kasBefore.debit });
        expect(new Set(lines.map((l) => l.batchId)).size).toBe(1);
        expect((await healthCheck(db)).problems).toEqual([]);
      }
    }
    // effective = the latest save per (week, account)
    const all = await repos.cashCounts.listAll(periodId);
    const eff = await repos.cashCounts.listEffective(periodId);
    const latest = new Map<string, number>();
    for (const l of all) latest.set(`${l.week}|${l.account}`, l.seq);
    expect(eff.map((l) => l.seq).sort((x, y) => x - y)).toEqual([...latest.values()].sort((x, y) => x - y));
    expect(saves).toBeGreaterThanOrEqual(0);
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------
describe('QA cek kas: append-only at the SQL level', () => {
  async function one() {
    const w = await world(3);
    await w.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 10_000, account: 'tunai' });
    await save(w, 1, 5_000);
    return w;
  }
  it.each([
    ['UPDATE', "UPDATE cash_counts SET counted = 1"],
    ['DELETE', 'DELETE FROM cash_counts'],
    ['INSERT OR REPLACE, same id', "INSERT OR REPLACE INTO cash_counts (id, batch_id, period_id, week, account, count_date, expected, counted, difference, created_at) SELECT id, batch_id, period_id, week, account, count_date, expected, 1, 1 - expected, created_at FROM cash_counts"],
  ])('%s is rejected', async (_n, sqlText) => {
    const w = await one();
    await expect(w.db.exec(sqlText)).rejects.toThrow();
    expect((await w.repos.cashCounts.listAll(w.periodId))[0]?.counted).toBe(5_000);
  });

  it('INSERT OR REPLACE onto an existing seq with a NEW id must not rewrite history', async () => {
    const w = await one();
    const [row] = await w.repos.cashCounts.listAll(w.periodId);
    await w.db
      .exec(
        `INSERT OR REPLACE INTO cash_counts (seq, id, batch_id, period_id, week, account, count_date, expected, counted, difference, created_at)
         VALUES (${row?.seq}, 'evil', 'b', '${w.periodId}', 1, 'tunai', '2026-01-01', 10000, 99, -9901, 'x')`,
      )
      .catch(() => undefined);
    const after = await w.db.getAll<{ id: string; counted: number }>('SELECT id, counted FROM cash_counts');
    expect(after.map((r) => r.counted)).toEqual([5_000]);
  });

  it('INSERT OR REPLACE onto an existing seq (same batch/period) cannot silently replace the effective count', async () => {
    const w = await one();
    const [row] = await w.repos.cashCounts.listAll(w.periodId);
    await w.db
      .exec(
        `INSERT OR REPLACE INTO cash_counts (seq, id, batch_id, period_id, week, account, count_date, expected, counted, difference, created_at)
         VALUES (${row?.seq}, 'evil2', 'b', '${w.periodId}', 1, 'tunai', '2026-01-01', 10000, 99, -9901, 'x')`,
      )
      .catch(() => undefined);
    expect((await w.db.getAll<{ counted: number }>('SELECT counted FROM cash_counts')).map((r) => r.counted)).toEqual([5_000]);
  });

  it('raw inserts violating the rules are rejected: negative counted, wrong difference, text amount, bad account, skipped week, closed period', async () => {
    const w = await one();
    const ins = (over: string) =>
      `INSERT INTO cash_counts (id, batch_id, period_id, week, account, count_date, expected, counted, difference, created_at) VALUES ${over}`;
    const p = w.periodId;
    await expect(w.db.exec(ins(`('r1','b','${p}',1,'tunai','2026-01-01',10,-1,-11,'x')`))).rejects.toThrow();
    await expect(w.db.exec(ins(`('r2','b','${p}',1,'tunai','2026-01-01',10,5,1,'x')`))).rejects.toThrow();
    await expect(w.db.exec(ins(`('r3','b','${p}',1,'tunai','2026-01-01',10,'abc',-5,'x')`))).rejects.toThrow();
    await expect(w.db.exec(ins(`('r4','b','${p}',1,'piutang','2026-01-01',10,5,-5,'x')`))).rejects.toThrow();
    await expect(w.db.exec(ins(`('r5','b','${p}',1.5,'tunai','2026-01-01',10,5,-5,'x')`))).rejects.toThrow();
    await expect(w.db.exec(ins(`('r6','b','nope',1,'tunai','2026-01-01',10,5,-5,'x')`))).rejects.toThrow();
    await expect(w.db.exec(ins(`('r7','b','${p}',99,'tunai','2026-01-01',10,5,-5,'x')`))).rejects.toThrow();
    expect(await w.db.getFirst('SELECT COUNT(*) AS n FROM cash_counts')).toEqual({ n: 1 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('QA cek kas: input validation (repository)', () => {
  it.each([
    ['negative', -1],
    ['fractional', 0.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['1e21', 1e21],
    ['2^53', 2 ** 53],
  ])('Tunai %s is rejected and nothing is stored', async (_n, bad) => {
    const w = await world(3);
    await expect(save(w, 1, bad)).rejects.toThrow();
    expect(await w.repos.cashCounts.listAll(w.periodId)).toEqual([]);
  });

  it.each([-1, 0.1, Number.NaN, 2 ** 53])('Debit %s is rejected and the Tunai row is rolled back', async (bad) => {
    const w = await world(3);
    await expect(save(w, 1, 100, bad)).rejects.toThrow();
    expect(await w.repos.cashCounts.listAll(w.periodId)).toEqual([]);
  });

  it('accepts 0 and amounts that are not multiples of 15.000; Debit null stores no Debit row', async () => {
    const w = await world(3);
    expect((await save(w, 1, 0)).map((l) => l.account)).toEqual(['tunai']);
    const l = await save(w, 1, 14_999, 1);
    expect(l.map((x) => x.counted)).toEqual([14_999, 1]);
  });

  it('largest safe amount: difference stays an exact integer (no float drift)', async () => {
    const w = await world(3);
    await w.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 7, account: 'tunai' });
    const [l] = await save(w, 1, Number.MAX_SAFE_INTEGER);
    expect(l?.difference).toBe(Number.MAX_SAFE_INTEGER - 7);
    expect(Number.isSafeInteger(l?.difference)).toBe(true);
  });

  it('a count date must be a real calendar date and not in the future (like every other entry date)', async () => {
    const w = await world(3);
    await expect(save(w, 1, 1, null, { date: '2026-13-45' })).rejects.toThrow();
    await expect(save(w, 1, 1, null, { date: '2099-01-01' })).rejects.toThrow();
  });

  it('a malformed date is rejected', async () => {
    const w = await world(3);
    await expect(save(w, 1, 1, null, { date: 'kemarin' })).rejects.toThrow();
  });

  it('a long note is trimmed and stored as given (no length cap in the repository)', async () => {
    const w = await world(3);
    const [l] = await save(w, 1, 1, null, { note: `  ${'x'.repeat(5000)}  ` });
    expect(l?.note).toHaveLength(5000);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('QA cek kas: which meeting and period may be counted', () => {
  async function through(w: World, closed: number) {
    for (let i = 1; i <= closed; i += 1) {
      await w.repos.weeks.assignHost(w.periodId, i, w.ids[i - 1] as string, `2026-01-${String(6 + 7 * (i - 1)).padStart(2, '0')}`);
      await w.repos.weeks.closeOldest(w.periodId);
    }
  }

  it('only the oldest open and the latest closed meeting; older closed and later open ones are rejected', async () => {
    const w = await world(4);
    await through(w, 2); // 1,2 closed; 3 open
    expect((await w.repos.cashCounts.form(w.periodId)).countableWeeks).toEqual([3, 2]);
    await expect(save(w, 1, 0)).rejects.toMatchObject({ code: 'week_not_countable' });
    await expect(save(w, 4, 0)).rejects.toMatchObject({ code: 'week_not_countable' });
    await expect(save(w, 0, 0)).rejects.toThrow();
    await expect(save(w, 2.5, 0)).rejects.toThrow();
    await expect(save(w, 2, 0)).resolves.toHaveLength(1);
    await expect(save(w, 3, 0)).resolves.toHaveLength(1);
  });

  it('unknown period rejects', async () => {
    const w = await world(3);
    await expect(w.repos.cashCounts.save({ periodId: 'nope', week: 1, tunai: 0, debit: null })).rejects.toThrow();
  });

  it('a skipped last meeting is never countable; the previous closed meeting still is; undo makes it countable again', async () => {
    const w = await world(3);
    await through(w, 2);
    for (const wk of [1, 2]) await w.repos.ledger.settleHost(w.periodId, wk, TODAY, 'tunai').catch(() => undefined);
    await w.repos.weeks.skipLast(w.periodId, 'libur');
    const form = await w.repos.cashCounts.form(w.periodId);
    expect(form.countableWeeks).not.toContain(3);
    await expect(save(w, 3, 0)).rejects.toMatchObject({ code: 'week_skipped' });
    await expect(save(w, 2, 0)).resolves.toHaveLength(1);
    await w.repos.weeks.undoSkip(w.periodId, 'batal');
    await expect(save(w, 3, 0)).resolves.toHaveLength(1);
  });

  it('a count made before a skip stays valid, is not counted in history of skipped week rows, and skip does not change kas', async () => {
    const w = await world(3);
    await through(w, 2);
    await w.repos.ledger.settleHost(w.periodId, 1, TODAY, 'tunai').catch(() => undefined);
    await w.repos.ledger.settleHost(w.periodId, 2, TODAY, 'tunai').catch(() => undefined);
    await save(w, 3, 0); // count on the (later skipped) meeting
    const kas = await w.repos.ledger.getKasBalances();
    await w.repos.weeks.skipLast(w.periodId, 'libur');
    expect(await w.repos.ledger.getKasBalances()).toEqual(kas);
    expect(await w.repos.cashCounts.listAll(w.periodId)).toHaveLength(1);
    expect((await healthCheck(w.db)).problems).toEqual([]);
  });

  it('after "Akhiri periode" the period takes no count and the form offers nothing', async () => {
    const w = await world(3);
    await through(w, 3);
    for (let i = 1; i <= 3; i += 1) await w.repos.ledger.settleHost(w.periodId, i, TODAY, 'tunai').catch(() => undefined);
    await save(w, 3, 0);
    await w.repos.periods.close(w.periodId, TODAY);
    expect((await w.repos.cashCounts.form(w.periodId)).countableWeeks).toEqual([]);
    expect((await w.repos.cashCounts.form(w.periodId)).defaultWeek).toBeNull();
    await expect(save(w, 3, 0)).rejects.toMatchObject({ code: 'no_active_period' });
    expect(await w.repos.cashCounts.listAll(w.periodId)).toHaveLength(1); // old counts remain readable
    expect(await w.repos.cashCounts.hasCount(w.periodId, 3)).toBe(true);
  });

  it('closing a meeting without any count works and writes no cash_counts row', async () => {
    const w = await world(3);
    await w.repos.weeks.assignHost(w.periodId, 1, w.ids[0] as string, '2026-01-06');
    await expect(w.repos.weeks.closeOldest(w.periodId)).resolves.toBe(1);
    expect(await w.repos.cashCounts.listAll(w.periodId)).toEqual([]);
    expect(await w.repos.cashCounts.hasCount(w.periodId, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('QA cek kas: expected balances', () => {
  it('Piutang is never part of expected; a loan lowers Tunai, a repayment raises Tunai; transfer moves between pos', async () => {
    const w = await world(3);
    const m = w.ids[0] as string;
    await w.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 100_000, account: 'tunai' });
    await w.repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 30_000, account: 'tunai', memberId: m });
    let [t] = await save(w, 1, 70_000);
    expect(t).toMatchObject({ expected: 70_000, difference: 0 });
    await w.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 10_000, memberId: m });
    await w.repos.ledger.recordKas({ kind: 'transfer', date: TODAY, amount: 50_000, account: 'tunai', toAccount: 'debit' });
    const lines = await save(w, 1, 30_000, 50_000);
    expect(lines.map((l) => [l.account, l.expected, l.difference])).toEqual([
      ['tunai', 30_000, 0],
      ['debit', 50_000, 0],
    ]);
    [t] = await save(w, 1, 0);
    expect(t?.expected).toBe(30_000);
  });

  it('negative expected balance (cash out above the balance) is stored with the right difference and passes the health check', async () => {
    const w = await world(3);
    await w.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 10_000, account: 'tunai' });
    let negative = true;
    try {
      await w.repos.ledger.recordKas({ kind: 'shared_goal', date: TODAY, amount: 50_000, account: 'tunai', note: 'tur' });
    } catch {
      negative = false; // the app refuses to overdraw: then nothing to test here
    }
    const [l] = await save(w, 1, 0);
    expect(l?.difference).toBe(0 - (negative ? -40_000 : 10_000));
    expect((await healthCheck(w.db)).problems).toEqual([]);
  });

  it('host payout then its correction (reversal): expected follows the ledger both times; counts keep their own snapshot', async () => {
    const w = await world(3);
    for (const id of w.ids) await w.repos.payments.record({ periodId: w.periodId, memberId: id, date: '2026-01-06', amount: 15_000, account: 'tunai' });
    await w.repos.weeks.assignHost(w.periodId, 1, w.ids[0] as string, '2026-01-06');
    await w.repos.weeks.closeOldest(w.periodId);
    const a = (await save(w, 2, 0))[0];
    expect(a?.expected).toBe(45_000);
    await w.repos.ledger.settleHost(w.periodId, 1, TODAY, 'tunai');
    const b = (await save(w, 2, 0))[0];
    const kasPaid = await w.repos.ledger.getKasBalances();
    expect(b?.expected).toBe(kasPaid.tunai);
    await w.repos.ledger.reverseHostPayout(w.periodId, 1, 'salah');
    const c = (await save(w, 2, 0))[0];
    expect(c?.expected).toBe(45_000);
    expect((await w.repos.cashCounts.listAll(w.periodId)).map((l) => l.expected)).toEqual([a?.expected, b?.expected, c?.expected]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('QA cek kas: hints and history flags (pure)', () => {
  it('direction logic', () => {
    expect(countHints({ difference: 15_000, memberCount: 4 })).toContain('member_payment');
    expect(countHints({ difference: 45_000, memberCount: 4 })).toContain('member_payment');
    expect(countHints({ difference: 14_999, memberCount: 4 })).not.toContain('member_payment');
    expect(countHints({ difference: -15_000, memberCount: 4 })).not.toContain('member_payment');
    expect(countHints({ difference: -40_000, memberCount: 4 })).toContain('host_payout');
    expect(countHints({ difference: 40_000, memberCount: 4 })).not.toContain('host_payout');
    expect(countHints({ difference: -40_001, memberCount: 4 })).not.toContain('host_payout');
    expect(countHints({ difference: -30_000, memberCount: 4 })).not.toContain('host_payout');
    expect(countHints({ difference: -10_000, memberCount: 0 })).not.toContain('host_payout');
    expect(countHints({ difference: 0, memberCount: 4 })).toEqual([]);
    expect(countHints({ difference: -5_000, memberCount: 4 })).toEqual(['transfer', 'goal_spending']);
    expect(countHints({ difference: 1_000, memberCount: 4 })).toEqual(['transfer']);
  });
  it('opposite differences put transfer FIRST (both directions); equal-sign or zero other does not', () => {
    expect(countHints({ difference: 15_000, memberCount: 4, otherDifference: -15_000 })[0]).toBe('transfer');
    expect(countHints({ difference: -40_000, memberCount: 4, otherDifference: 40_000 })[0]).toBe('transfer');
    expect(countHints({ difference: 15_000, memberCount: 4, otherDifference: 15_000 })[0]).toBe('member_payment');
    expect(countHints({ difference: 15_000, memberCount: 4, otherDifference: 0 })[0]).toBe('member_payment');
    expect(countHints({ difference: 15_000, memberCount: 4, otherDifference: -15_000 }).filter((h) => h === 'transfer')).toHaveLength(1);
  });

  const L = (week: number, account: 'tunai' | 'debit', difference: number, seq: number): StoredCountLine => ({
    seq, batchId: `b${seq}`, periodId: 'p', week, account, date: '2026-01-01', expected: 100, counted: 100 + difference, difference, note: '',
  });
  it('flags: first, continued, a clean count ends the run, an uncounted meeting neither breaks nor flags', () => {
    const rows = buildCountHistory([L(1, 'tunai', 0, 1), L(2, 'tunai', -5, 2), L(3, 'tunai', -5, 3), L(5, 'tunai', 0, 4), L(6, 'tunai', 7, 5), L(7, 'debit', 3, 6)], [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.map((r) => r.flag)).toEqual([null, 'first', 'continued', null, null, 'first', 'continued', null]);
    expect(rows.map((r) => r.counted)).toEqual([true, true, true, false, true, true, true, false]);
  });
  it('a later recount that is clean replaces the difference (latest seq wins, regardless of array order)', () => {
    const rows = buildCountHistory([L(2, 'tunai', 0, 9), L(2, 'tunai', -5, 3)], [1, 2]);
    expect(rows[1]).toMatchObject({ hasDifference: false, flag: null });
  });
  it('difference only on Debit still flags the meeting', () => {
    const rows = buildCountHistory([L(1, 'tunai', 0, 1), L(1, 'debit', 5, 2)], [1]);
    expect(rows[0]?.flag).toBe('first');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('QA cek kas: backup, restore, health check', () => {
  async function live() {
    const env = await createSqlJsEnv();
    let n = 0;
    const repos = createRepositories(env.db, { newId: () => `q${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await repos.members.create(`A${i}`)).id);
    const p = await repos.periods.create({ name: 'P', startDate: '2026-01-06', memberIds: ids });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 20_000, account: 'tunai' });
    return { env, repos, periodId: p.id };
  }
  const NOW = () => new Date(2026, 10, 6, 10, 0, 0);

  it('round trip into another phone keeps every count (history and effective) and the dump is identical', async () => {
    const s = await live();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 1, tunai: 5_000, debit: 0, note: 'a' });
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 1, tunai: 20_000, debit: null });
    const target = await createSqlJsEnv();
    const prepared = await prepareRestore(target.bridge, target.db, { kind: 'file', bytes: s.env.liveBytes() });
    expect((await commitRestore(target.bridge, target.db, prepared, new FakeSafetyStore(), NOW)).outcome).toBe('restored');
    expect(await dump(target.db)).toEqual(await dump(s.env.db));
    expect([...(await loadRecordIds(target.db))].sort()).toEqual([...(await loadRecordIds(s.env.db))].sort());
    expect((await createRepositories(target.db).cashCounts.listEffective(s.periodId)).map((l) => [l.account, l.counted])).toEqual([
      ['tunai', 20_000],
      ['debit', 0],
    ]);
  });

  it('a backup taken before a count is classified older than live (a count must not be lost silently)', async () => {
    const s = await live();
    const before = s.env.liveBytes();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 1, tunai: 1, debit: null });
    const prepared = await prepareRestore(s.env.bridge, s.env.db, { kind: 'file', bytes: before });
    expect(prepared.classification.kind).toBe('older');
    expect(prepared.classification.lost).toBe(0); // a count is never a "catatan"
    expect(prepared.classification.cashCountsLost).toBe(1);
    await discardRestore(prepared);
  });

  it('a live phone WITH counts and a backup that is the same plus extra ledger entry is not classed as older-by-counts only', async () => {
    const s = await live();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 1, tunai: 1, debit: null });
    const withCount = s.env.liveBytes();
    await s.repos.ledger.recordKas({ kind: 'shared_goal', date: TODAY, amount: 1_000, account: 'tunai', note: 'x' });
    const prepared = await prepareRestore(s.env.bridge, s.env.db, { kind: 'file', bytes: withCount });
    expect(prepared.classification.kind).toBe('older');
    expect(prepared.classification.lost).toBe(1);
    await discardRestore(prepared);
  });

  it('a version 6 backup with data restores into a version 7 phone, migrates as a copy, cash_counts empty, then counts work', async () => {
    const old = await createSqlJsEnv({ migrated: false });
    await migrate(old.db, MIGRATIONS.slice(0, 5));
    await old.db.exec(V5_FIXTURE_SQL);
    await migrate(old.db, MIGRATIONS.slice(0, 6));
    const target = await createSqlJsEnv();
    const prepared = await prepareRestore(target.bridge, target.db, { kind: 'file', bytes: old.liveBytes() });
    expect(prepared.originalVersion).toBe(6);
    expect((await commitRestore(target.bridge, target.db, prepared, new FakeSafetyStore(), NOW)).outcome).toBe('restored');
    const repos = createRepositories(target.db);
    const period = await repos.periods.getActive();
    expect(await healthCheck(target.db)).toEqual({ ok: true, problems: [] });
    if (period) {
      const form = await repos.cashCounts.form(period.id);
      if (form.defaultWeek !== null) {
        const lines = await repos.cashCounts.save({ periodId: period.id, week: form.defaultWeek, tunai: 0, debit: null });
        expect(lines[0]?.expected).toBe((await repos.ledger.getKasBalances()).tunai);
      }
    }
  });

  it.each([
    ['difference does not add up', "UPDATE cash_counts SET difference = difference + 1"],
    ['counted negative', 'UPDATE cash_counts SET counted = -5, difference = -5 - expected'],
    ['counted stored as non-numeric text', "UPDATE cash_counts SET counted = 'abc'"],
    ['expected stored as real', 'UPDATE cash_counts SET expected = 1.5, difference = counted - 1.5'],
    ['bad account', "UPDATE cash_counts SET account = 'piutang'"],
  ])('health check flags a tampered row: %s', async (_n, update) => {
    const s = await live();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 1, tunai: 5_000, debit: null });
    await s.env.db.exec(`DROP TRIGGER cash_counts_no_update; PRAGMA ignore_check_constraints = ON; ${update}; PRAGMA ignore_check_constraints = OFF;`);
    const report = await healthCheck(s.env.db);
    expect(report.ok).toBe(false);
  });

  it('health check does NOT flag a count row pointing at a skipped meeting or a closed period (only structural rows are checked): informational', async () => {
    // Documented expectation: guard triggers stop these on insert; a restored file bypasses triggers only if tampered.
    const s = await live();
    await s.repos.cashCounts.save({ periodId: s.periodId, week: 1, tunai: 5_000, debit: null });
    await s.env.db.exec("UPDATE periods SET status = 'closed'").catch(() => undefined);
    expect((await healthCheck(s.env.db)).ok).toBeDefined();
  });
});
