// INDEPENDENT QA of "skip the last meeting" (decision 33). Written without reusing skipLast.qa.test.ts.
//
// Differences from that file: (1) the checks use their OWN model computed from raw SQL rows (credit pools, settled
// amount per meeting, arrears, held credit, expected kas), not the repository readers; (2) every run is a scripted
// life (meetings 1..N-1 with host changes, payout corrections and payment corrections, then random work on the last
// meeting, then close, then a second period with carry-over / refund) instead of one flat random mix; (3) every
// seed also takes backups and restores them into an empty phone and compares EVERY table row and every reading.
//
// Rules proved (numbers refer to the task brief): 2 no dues/debt/offset/write-off for a skipped meeting; 3 advance
// dues become credit and no allocation row is deleted; 4 no ledger entry and unchanged kas; 5 write-off after credit;
// 6 undo before close only, append-only; 7 host/date locked; 8 CSV Masuk - Keluar = actual kas; 9 backups.
import { csvAmountColumns } from '@/domain/flow';
import { eligibleHostIds } from '@/domain/schedule';
import { WeekSkipError } from '@/domain/week-skip';
import { buildCsvFor, CSV_FILES } from '@/ui/csvFiles';
import { commitRestore, healthCheck, prepareRestore } from './backup';
import type { Db } from './db';
import { SkipUndoBlockedError } from './errors';
import { createRepositories, type Repositories } from './index';
import { createSqlJsEnv, FakeSafetyStore, type SqlJsEnv } from './testing/sqlJsBridge';

const TODAY = '2026-03-10';
const DUE = 15_000;
const SEEDS = Number(process.env.QA_INDEP_SEEDS ?? 24);

function makeRng(seed: number) {
  let a = (seed * 2654435761) >>> 0;
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
type Rng = ReturnType<typeof makeRng>;

interface Ctx {
  env: SqlJsEnv;
  db: Db;
  repos: Repositories;
  rng: Rng;
  label: string;
}
const grand: Record<string, number> = {};
const bump = (key: string) => {
  grand[key] = (grand[key] ?? 0) + 1;
};

const CORRUPTION = /inconsistent|do not add up|exceeds the weekly due|would be negative|settled amount|exceeds what is outstanding|has amounts|constraint|append-only|a skipped meeting/i;

/** A rejected action is fine when it is a rule; a SQL/trigger error leaking out of a repository call is a finding. */
async function attempt<T>(key: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  try {
    const value = await fn();
    bump(`${key}:ok`);
    return { ok: true, value };
  } catch (e) {
    const err = e as Error;
    const known = ['RepositoryError', 'DomainError', 'LoanError', 'HostPayoutStandsError', 'PaymentHostPayoutStandsError', 'WeekSkipError', 'SkipUndoBlockedError'];
    if (!known.includes(err.name) || CORRUPTION.test(err.message)) throw new Error(`${key}: unexpected failure ${err.name}: ${err.message}`);
    bump(`${key}:rejected`);
    return { ok: false, error: err };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The independent model (raw rows only)
// ---------------------------------------------------------------------------------------------------------------

interface Model {
  skip: Set<string>; // `${period}|${week}` in force
  periods: { id: string; status: string; n: number }[];
  members: Map<string, string[]>; // period -> member ids
  weekStatus: Map<string, string>; // `${period}|${week}` -> stored status
  pool: Map<string, number>; // `${period}|${member}` -> available credit from that source period
  settled: Map<string, number>; // `${period}|${member}|${week}` -> settled amount (only meetings that count)
  paidAlloc: Map<string, number>;
  offsetAmt: Map<string, number>;
  credited: Map<string, number>;
  carriedOpen: number;
}

async function buildModel(db: Db): Promise<Model> {
  const q = <T>(sql: string) => db.getAll<T>(sql);
  const skip = new Set((await q<{ period_id: string; week: number }>('SELECT period_id, week FROM week_skips s WHERE NOT EXISTS (SELECT 1 FROM week_skip_undos u WHERE u.skip_id = s.id)')).map((r) => `${r.period_id}|${r.week}`));
  const periods = (await q<{ id: string; status: string; member_count: number }>('SELECT id, status, member_count FROM periods')).map((p) => ({ id: p.id, status: p.status, n: p.member_count }));
  const members = new Map<string, string[]>();
  for (const r of await q<{ period_id: string; member_id: string }>('SELECT period_id, member_id FROM period_members ORDER BY initial_order')) {
    members.set(r.period_id, [...(members.get(r.period_id) ?? []), r.member_id]);
  }
  const weekStatus = new Map((await q<{ period_id: string; number: number; status: string }>('SELECT period_id, number, status FROM weeks')).map((w) => [`${w.period_id}|${w.number}`, w.status]));
  const received = new Map<string, number>();
  for (const r of await q<{ period_id: string; member_id: string; amount: number }>('SELECT period_id, member_id, amount FROM payments WHERE id NOT IN (SELECT payment_id FROM payment_reversals)')) {
    const k = `${r.period_id}|${r.member_id}`;
    received.set(k, (received.get(k) ?? 0) + r.amount);
  }
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const paidAlloc = new Map<string, number>();
  const allocForPool = new Map<string, number>();
  for (const r of await q<{ period_id: string; member_id: string; week: number; amount: number }>('SELECT period_id, member_id, week, amount FROM allocations WHERE payment_id NOT IN (SELECT payment_id FROM payment_reversals)')) {
    if (skip.has(`${r.period_id}|${r.week}`)) continue; // released to credit, row stays in the table
    add(paidAlloc, `${r.period_id}|${r.member_id}|${r.week}`, r.amount);
    add(allocForPool, `${r.period_id}|${r.member_id}`, r.amount);
  }
  const offsetAmt = new Map<string, number>();
  const released = new Map<string, number>();
  for (const r of await q<{ period_id: string; member_id: string; week: number; amount: number }>(
    'SELECT o.period_id, o.member_id, o.week, o.amount FROM offset_credits o WHERE NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = o.ledger_entry_id)',
  )) {
    if (skip.has(`${r.period_id}|${r.week}`)) add(released, `${r.period_id}|${r.member_id}`, r.amount);
    else add(offsetAmt, `${r.period_id}|${r.member_id}|${r.week}`, r.amount);
  }
  const credited = new Map<string, number>();
  const appliedFrom = new Map<string, number>();
  let carriedOpen = 0;
  for (const r of await q<{ kind: string; from_period_id: string; to_period_id: string; member_id: string; week: number; amount: number }>('SELECT kind, from_period_id, to_period_id, member_id, week, amount FROM credit_applications')) {
    if (skip.has(`${r.to_period_id}|${r.week}`)) continue;
    add(credited, `${r.to_period_id}|${r.member_id}|${r.week}`, r.amount);
    add(appliedFrom, `${r.from_period_id}|${r.member_id}`, r.amount);
    if (r.kind === 'carry_over' && weekStatus.get(`${r.to_period_id}|${r.week}`) === 'open') carriedOpen += r.amount;
  }
  const refunded = new Map<string, number>();
  for (const r of await q<{ period_id: string; member_id: string; amount: number }>("SELECT period_id, member_id, amount FROM ledger_entries WHERE type = 'credit_refund'")) {
    add(refunded, `${r.period_id}|${r.member_id}`, r.amount);
  }
  const pool = new Map<string, number>();
  const settled = new Map<string, number>();
  for (const p of periods) {
    for (const m of members.get(p.id) ?? []) {
      const k = `${p.id}|${m}`;
      pool.set(k, (received.get(k) ?? 0) - (allocForPool.get(k) ?? 0) - (appliedFrom.get(k) ?? 0) - (refunded.get(k) ?? 0) + (released.get(k) ?? 0));
      for (let w = 1; w <= p.n; w += 1) {
        if (skip.has(`${p.id}|${w}`)) continue;
        const wk = `${k}|${w}`;
        settled.set(wk, (paidAlloc.get(wk) ?? 0) + (offsetAmt.get(wk) ?? 0) + (credited.get(wk) ?? 0));
      }
    }
  }
  return { skip, periods, members, weekStatus, pool, settled, paidAlloc, offsetAmt, credited, carriedOpen };
}

/** Arrears of one member of one period through meeting `through` (skipped meetings owe nothing). */
function arrears(model: Model, periodId: string, memberId: string, through: number): number {
  let total = 0;
  for (let w = 1; w <= through; w += 1) {
    if (model.skip.has(`${periodId}|${w}`)) continue;
    total += DUE - (model.settled.get(`${periodId}|${memberId}|${w}`) ?? 0);
  }
  return total;
}

function currentWeek(model: Model, periodId: string, n: number): number {
  for (let w = 1; w <= n; w += 1) if (model.weekStatus.get(`${periodId}|${w}`) === 'open') return w;
  return n;
}

async function checkAll(ctx: Ctx, step: string, full = true): Promise<void> {
  const { db, repos } = ctx;
  const label = `${ctx.label} ${step}`;
  const health = await healthCheck(db);
  expect({ label, problems: health.problems }).toEqual({ label, problems: [] });
  const model = await buildModel(db);

  let outstanding = 0;
  let held = model.carriedOpen;
  for (const p of model.periods) {
    for (const m of model.members.get(p.id) ?? []) {
      const pool = model.pool.get(`${p.id}|${m}`) ?? 0;
      expect({ label, p: p.id, m, pool: pool >= 0 }).toEqual({ label, p: p.id, m, pool: true });
      expect({ label, p: p.id, m, avail: await repos.credits.getAvailable(p.id, m) }).toEqual({ label, p: p.id, m, avail: pool });
      if (pool > 0) held += pool;
      const statuses = await repos.payments.getWeekStatuses(p.id, m);
      for (const s of statuses) {
        const key = `${p.id}|${m}|${s.week}`;
        if (model.skip.has(`${p.id}|${s.week}`)) {
          expect({ label, key, s: [s.skipped, s.due, s.paid, s.offset, s.credited, s.outstanding] }).toEqual({ label, key, s: [true, 0, 0, 0, 0, 0] });
          continue;
        }
        const settledW = model.settled.get(key) ?? 0;
        expect({ label, key, settledW: settledW <= DUE }).toEqual({ label, key, settledW: true });
        expect({ label, key, got: [s.paid, s.offset, s.credited, s.outstanding] }).toEqual({
          label,
          key,
          got: [model.paidAlloc.get(key) ?? 0, model.offsetAmt.get(key) ?? 0, model.credited.get(key) ?? 0, DUE - settledW],
        });
      }
      if (p.status === 'active') outstanding += arrears(model, p.id, m, currentWeek(model, p.id, p.n));
    }
  }
  if (!full) return;

  const kas = await repos.ledger.getKasBalances();
  let masuk = 0;
  let keluar = 0;
  for (const row of await repos.exports.listLedger()) {
    const c = csvAmountColumns({ direction: row.direction, amount: row.amount, account: row.account, toAccount: row.toAccount });
    expect([c.moneyIn, c.moneyOut, c.noKasChange].filter((v) => v !== null)).toHaveLength(1);
    masuk += c.moneyIn ?? 0;
    keluar += c.moneyOut ?? 0;
  }
  expect({ label, csvNet: masuk - keluar }).toEqual({ label, csvNet: kas.tunai + kas.debit });
  const report = await repos.reports.getKasReport();
  expect({ label, out: report.expected.outstandingDues, held: report.expected.creditHeld }).toEqual({ label, out: outstanding, held });
  expect(report.expected.expected).toBe(kas.tunai + kas.debit + outstanding - held);
  for (const p of model.periods) await repos.reports.getPeriodReport(p.id);
}

// ---------------------------------------------------------------------------------------------------------------
// Readings and backups
// ---------------------------------------------------------------------------------------------------------------

async function dumpAll(db: Db): Promise<Record<string, string[]>> {
  const tables = await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const out: Record<string, string[]> = {};
  for (const t of tables) out[t.name] = (await db.getAll<Record<string, unknown>>(`SELECT * FROM "${t.name}" ORDER BY rowid`)).map((r) => JSON.stringify(r));
  return out;
}

/** Everything a screen or export can read, as one JSON string. */
async function readAll(repos: Repositories): Promise<string> {
  const periods = await repos.periods.list();
  const out: unknown[] = [];
  for (const p of periods) {
    const members = await repos.periods.getMembers(p.id);
    const perMember: unknown[] = [];
    for (const m of members) {
      perMember.push([
        await repos.payments.getWeekStatuses(p.id, m.memberId),
        await repos.credits.getAvailable(p.id, m.memberId),
        await repos.payments.listAllocations(p.id, m.memberId),
        await repos.reports.getMemberHistory(p.id, m.memberId),
      ]);
    }
    out.push([p, await repos.weeks.listByPeriod(p.id), await repos.weeks.listSkipHistory(p.id), await repos.reports.getPeriodReport(p.id), await repos.periods.previewClose(p.id), perMember]);
    if (p.status === 'active') out.push(await repos.weeks.previewSkip(p.id));
  }
  out.push(await repos.reports.getKasReport(), await repos.weeks.skippedTurn());
  for (const f of CSV_FILES) out.push(await buildCsvFor(f.kind, repos));
  return JSON.stringify(out);
}

async function restoreCheck(ctx: Ctx, tag: string): Promise<void> {
  const fresh = await createSqlJsEnv();
  const prepared = await prepareRestore(fresh.bridge, fresh.db, { kind: 'file', bytes: ctx.env.liveBytes() });
  const outcome = await commitRestore(fresh.bridge, fresh.db, prepared, new FakeSafetyStore(), () => new Date(2026, 10, 6, 10, 0, 0));
  expect({ tag, outcome: outcome.outcome }).toEqual({ tag, outcome: 'restored' });
  expect(await healthCheck(fresh.db)).toEqual({ ok: true, problems: [] });
  expect(fresh.openMemoryCount()).toBe(0);
  expect(await dumpAll(fresh.db)).toEqual(await dumpAll(ctx.db));
  const restored = createRepositories(fresh.db, { newId: () => 'unused', now: () => `${TODAY}T12:00:00.000Z` });
  expect({ tag, same: await readAll(restored) === (await readAll(ctx.repos)) }).toEqual({ tag, same: true });
  bump('restoreChecked');
}

// ---------------------------------------------------------------------------------------------------------------
// Life of a period
// ---------------------------------------------------------------------------------------------------------------

const PAY_DATES = ['2026-01-06', '2026-01-13', '2026-02-03', TODAY] as const;
const acct = (rng: Rng) => rng.pick(['tunai', 'debit'] as const);

async function pay(ctx: Ctx, periodId: string, ids: readonly string[], big = false) {
  const { rng, repos } = ctx;
  return attempt('pay', () => repos.payments.record({ periodId, memberId: rng.pick(ids), date: rng.pick(PAY_DATES), amount: DUE * (big ? rng.int(3, 6) : rng.int(1, 2)), account: acct(rng) }));
}

async function unpaidClosedHosts(ctx: Ctx, periodId: string): Promise<number[]> {
  const out: number[] = [];
  for (const w of await ctx.repos.weeks.listByPeriod(periodId)) {
    if (w.status === 'closed' && w.hostMemberId !== null && !(await ctx.repos.ledger.getWeekPayout(periodId, w.number))) out.push(w.number);
  }
  return out;
}

async function assignCurrent(ctx: Ctx, periodId: string, ids: readonly string[]): Promise<void> {
  const weeks = await ctx.repos.weeks.listByPeriod(periodId);
  const cur = weeks.find((w) => w.status === 'open');
  if (!cur) return;
  const eligible = eligibleHostIds(weeks.map((w) => ({ number: w.number, date: w.date, hostMemberId: w.hostMemberId, status: w.status })), ids);
  if (eligible.length === 0) return;
  if (cur.hostMemberId === null || ctx.rng.chance(0.25)) await attempt('assign', () => ctx.repos.weeks.assignHost(periodId, cur.number, ctx.rng.pick(eligible), cur.date));
}

/** Tables a rejected probe must leave exactly as they were. */
async function tableState(db: Db): Promise<string> {
  return JSON.stringify(await dumpAll(db));
}

/** While the last meeting is skipped, every forbidden action must be refused and change nothing. */
async function probeWhileSkipped(ctx: Ctx, periodId: string, ids: readonly string[], n: number): Promise<void> {
  const { repos, db, rng } = ctx;
  const before = await tableState(db);
  const attempts: [string, () => Promise<unknown>][] = [
    ['assignHost', () => repos.weeks.assignHost(periodId, n, rng.pick(ids), '2026-02-24')],
    ['settleHost', () => repos.ledger.settleHost(periodId, n, TODAY, 'tunai')],
    ['previewPayout', () => repos.ledger.previewHostPayout(periodId, n, TODAY, 'tunai')],
    ['closeOldest', () => repos.weeks.closeOldest(periodId)],
    ['close', () => repos.weeks.close(periodId, n)],
    ['skipAgain', () => repos.weeks.skipLast(periodId, 'dua kali')],
    ['rawHost', () => db.run('UPDATE weeks SET host_member_id = NULL WHERE period_id = ? AND number = ?', [periodId, n])],
    ['rawDate', () => db.run("UPDATE weeks SET date = '2030-01-01' WHERE period_id = ? AND number = ?", [periodId, n])],
    ['rawAllocation', () => db.run("INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) SELECT id, period_id, member_id, ?, 1, date FROM payments WHERE period_id = ? LIMIT 1", [n, periodId])],
    ['rawDeleteSkip', () => db.run('DELETE FROM week_skips')],
    ['rawUpdateSkip', () => db.run("UPDATE week_skips SET reason = 'x'")],
  ];
  for (const [name, fn] of attempts) {
    let rejected = false;
    try {
      await fn();
    } catch {
      rejected = true;
    }
    expect({ label: ctx.label, probe: name, rejected }).toEqual({ label: ctx.label, probe: name, rejected: true });
    expect(await tableState(db)).toBe(before);
  }
  bump('probesWhileSkipped');
}

async function doSkip(ctx: Ctx, periodId: string, n: number): Promise<boolean> {
  const { repos, db, rng } = ctx;
  const kasBefore = await repos.ledger.getKasBalances();
  const ledgerBefore = await db.getAll('SELECT * FROM ledger_entries ORDER BY rowid');
  const allocBefore = await db.getAll('SELECT * FROM allocations ORDER BY rowid');
  const preview = await repos.weeks.previewSkip(periodId);
  const result = await attempt('skip', () => repos.weeks.skipLast(periodId, `alasan ${rng.int(1, 9)}`));
  if (!result.ok) {
    expect(preview.eligible).toBe(false);
    expect(result.error).toBeInstanceOf(WeekSkipError);
    expect((result.error as WeekSkipError).code).toBe(preview.blocker?.code);
    bump(`blocked:${preview.blocker?.code}`);
    return false;
  }
  expect(preview.eligible).toBe(true);
  // rule 4: no ledger entry, no kas change; rule 3: no allocation row deleted or added
  expect(await repos.ledger.getKasBalances()).toEqual(kasBefore);
  expect(await db.getAll('SELECT * FROM ledger_entries ORDER BY rowid')).toEqual(ledgerBefore);
  expect(await db.getAll('SELECT * FROM allocations ORDER BY rowid')).toEqual(allocBefore);
  await checkAll(ctx, 'after skip');
  void n;
  return true;
}

async function doUndo(ctx: Ctx, periodId: string): Promise<boolean> {
  const { repos, db } = ctx;
  const kasBefore = await repos.ledger.getKasBalances();
  const ledgerCount = (await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries'))?.n;
  const before = await tableState(db);
  const r = await attempt('undo', () => repos.weeks.undoSkip(periodId, 'batal'));
  if (!r.ok) {
    expect(await tableState(db)).toBe(before); // a refused undo writes nothing
    if (r.error instanceof SkipUndoBlockedError) bump('undoBlockedByRefund');
    return false;
  }
  expect(await repos.ledger.getKasBalances()).toEqual(kasBefore);
  expect((await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries'))?.n).toBe(ledgerCount);
  await checkAll(ctx, 'after undo');
  return true;
}

/** Closes the period and checks write-offs against the independent model. */
async function closeWithModel(ctx: Ctx, periodId: string, endDate: string, n: number): Promise<void> {
  const { repos, db } = ctx;
  const model = await buildModel(db);
  const expected = new Map<string, number>();
  for (const m of model.members.get(periodId) ?? []) {
    const w = Math.max(0, arrears(model, periodId, m, n) - (model.pool.get(`${periodId}|${m}`) ?? 0));
    if (w > 0) expected.set(m, w);
  }
  const kasBefore = await repos.ledger.getKasBalances();
  const skipped = [...model.skip].filter((k) => k.startsWith(`${periodId}|`));
  await repos.periods.close(periodId, endDate);
  const rows = await db.getAll<{ member_id: string; amount: number }>("SELECT member_id, amount FROM ledger_entries WHERE period_id = ? AND type = 'debt_writeoff'", [periodId]);
  expect(new Map(rows.map((r) => [r.member_id, r.amount]))).toEqual(expected);
  expect(await repos.ledger.getKasBalances()).toEqual(kasBefore);
  const after = await buildModel(db);
  for (const m of after.members.get(periodId) ?? []) {
    expect(after.pool.get(`${periodId}|${m}`)).toBe(Math.max(0, (model.pool.get(`${periodId}|${m}`) ?? 0) - arrears(model, periodId, m, n)));
  }
  if (skipped.length > 0) {
    bump('closedWithSkip');
    const w = await repos.weeks.get(periodId, n);
    expect(w).toMatchObject({ status: 'skipped', skipped: true });
    expect(w?.closedAt).not.toBeNull();
    // rule 7: after the close the skip can no longer be undone and nothing can be skipped again
    await expect(repos.weeks.undoSkip(periodId, 'terlambat')).rejects.toBeInstanceOf(WeekSkipError);
    await expect(repos.weeks.skipLast(periodId, 'terlambat')).rejects.toBeInstanceOf(WeekSkipError);
  }
  expect((await db.getFirst<{ n: number }>("SELECT COUNT(*) AS n FROM weeks WHERE period_id = ? AND status = 'open'", [periodId]))?.n).toBe(0);
  await checkAll(ctx, 'after close');
}

async function livePeriod(ctx: Ctx, periodId: string, ids: readonly string[], closeAt: string | null): Promise<void> {
  const { repos, rng, db } = ctx;
  const n = ids.length;
  // ---- meetings 1..N-1 ----------------------------------------------------------------------------------
  for (let k = 1; k < n; k += 1) {
    for (let i = rng.int(0, 3); i > 0; i -= 1) await pay(ctx, periodId, ids, rng.chance(0.2));
    await assignCurrent(ctx, periodId, ids);
    if (!(await attempt('closeWeek', () => repos.weeks.closeOldest(periodId))).ok) return;
    if (rng.chance(0.85)) {
      await attempt('payHost', () => repos.ledger.settleHost(periodId, k, TODAY, acct(rng)));
      if (rng.chance(0.3)) {
        // corrected payout, then money moves, then the host is paid again
        const rev = await attempt('reversePayout', () => repos.ledger.reverseHostPayout(periodId, k, 'koreksi'));
        if (rev.ok) {
          await pay(ctx, periodId, ids);
          const live = await db.getAll<{ id: string }>('SELECT id FROM payments WHERE period_id = ? AND id NOT IN (SELECT payment_id FROM payment_reversals)', [periodId]);
          if (live.length > 0 && rng.chance(0.4)) await attempt('reversePay', () => repos.payments.reverse(rng.pick(live).id, 'salah'));
          if (rng.chance(0.8)) await attempt('payHostAgain', () => repos.ledger.settleHost(periodId, k, TODAY, acct(rng)));
        }
      }
    }
    await checkAll(ctx, `meeting ${k}`, k % 2 === 0);
  }

  // ---- last meeting: random work with the skip in the middle ----------------------------------------------
  let skipped = false;
  const actions = ['pay', 'pay', 'payBig', 'reversePay', 'skip', 'skip', 'undo', 'repayHosts', 'reversePayout', 'refund', 'probe'] as const;
  for (let i = rng.int(5, 11); i > 0; i -= 1) {
    const action = rng.pick(actions);
    if (action === 'pay' || action === 'payBig') {
      const before = skipped ? (await db.getAll<{ id: string }>('SELECT id FROM payments')).length : 0;
      const r = await pay(ctx, periodId, ids, action === 'payBig');
      if (skipped && r.ok) {
        bump('payDuringSkip');
        // the new payment must not touch the skipped meeting, and its amount is allocation + credit (rule 3)
        const rows = await db.getAll<{ week: number; amount: number }>('SELECT week, amount FROM allocations WHERE payment_id = ?', [r.value.payment.id]);
        expect(rows.some((a) => a.week === n)).toBe(false);
        expect(rows.reduce((t, a) => t + a.amount, 0) + r.value.credit).toBe(r.value.payment.amount);
        expect(before).toBeGreaterThanOrEqual(0);
      }
    } else if (action === 'reversePay') {
      const live = await db.getAll<{ id: string }>('SELECT id FROM payments WHERE period_id = ? AND id NOT IN (SELECT payment_id FROM payment_reversals)', [periodId]);
      if (live.length > 0) await attempt('reversePay', () => repos.payments.reverse(rng.pick(live).id, 'salah'));
    } else if (action === 'skip') {
      if (!skipped) skipped = await doSkip(ctx, periodId, n);
    } else if (action === 'undo') {
      if (skipped && (await doUndo(ctx, periodId))) skipped = false;
    } else if (action === 'repayHosts') {
      for (const w of await unpaidClosedHosts(ctx, periodId)) await attempt('payHost', () => repos.ledger.settleHost(periodId, w, TODAY, acct(rng)));
    } else if (action === 'reversePayout') {
      const w = rng.int(1, n - 1);
      await attempt('reversePayout', () => repos.ledger.reverseHostPayout(periodId, w, 'koreksi'));
    } else if (action === 'refund') {
      const refundable = await repos.credits.listRefundable();
      if (refundable.length > 0) {
        const pick = rng.pick(refundable);
        await attempt('refund', () => repos.credits.refund(pick.periodId, pick.memberId, TODAY, 'tunai'));
      }
    } else if (skipped) {
      await probeWhileSkipped(ctx, periodId, ids, n);
    }
    skipped = (await repos.weeks.get(periodId, n))?.skipped === true; // the repository is the truth
    await checkAll(ctx, `last-meeting op ${action}`, ['skip', 'undo', 'refund', 'reversePayout'].includes(action));
  }

  // ---- finish -----------------------------------------------------------------------------------------------
  for (const w of await unpaidClosedHosts(ctx, periodId)) await attempt('payHost', () => repos.ledger.settleHost(periodId, w, TODAY, 'tunai'));
  if (!skipped && rng.chance(0.65)) skipped = await doSkip(ctx, periodId, n);
  if (skipped) {
    if (rng.chance(0.2)) {
      // taking the skip back at the very end, then the meeting is held normally
      if (await doUndo(ctx, periodId)) skipped = false;
    } else {
      await probeWhileSkipped(ctx, periodId, ids, n);
      await restoreCheck(ctx, `${ctx.label} skip in force`);
    }
  }
  if (!skipped) {
    const week = await repos.weeks.get(periodId, n);
    if (week && week.hostMemberId === null) await assignCurrent(ctx, periodId, ids);
    if ((await attempt('closeLast', () => repos.weeks.closeOldest(periodId))).ok) await attempt('payHost', () => repos.ledger.settleHost(periodId, n, TODAY, 'tunai'));
  }
  for (const w of await unpaidClosedHosts(ctx, periodId)) await attempt('payHost', () => repos.ledger.settleHost(periodId, w, TODAY, 'tunai'));
  await checkAll(ctx, 'before close');
  if (closeAt && (await repos.periods.previewClose(periodId)).canClose) {
    await closeWithModel(ctx, periodId, closeAt, n);
  } else if (closeAt) {
    bump('stuck');
  }
}

async function runSeed(seed: number): Promise<void> {
  const rng = makeRng(seed);
  const env = await createSqlJsEnv();
  let counter = 0;
  const repos = createRepositories(env.db, { newId: () => `i${seed}-${(counter += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ctx: Ctx = { env, db: env.db, repos, rng, label: `seed ${seed}` };

  const n1 = rng.int(3, 6);
  const ids: string[] = [];
  for (let i = 0; i < n1 + 1; i += 1) ids.push((await repos.members.create(`M${i + 1}`)).id);
  const p1Ids = ids.slice(0, n1);
  const p1 = await repos.periods.create({ name: 'P1', startDate: '2026-01-06', memberIds: p1Ids });
  await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 300_000, account: 'tunai' });
  if (rng.chance(0.5)) await repos.ledger.recordKas({ kind: 'loan', date: '2026-01-02', amount: 20_000, account: 'debit', memberId: p1Ids[0] as string });
  ctx.label = `seed ${seed} P1(N=${n1})`;
  await livePeriod(ctx, p1.id, p1Ids, '2026-02-17');
  if ((await repos.periods.getById(p1.id))?.status !== 'closed') return;

  // The member whose turn was lost (rule: exactly the one member who never hosted a meeting that took place).
  const weeks1 = await repos.weeks.listByPeriod(p1.id);
  if (weeks1.some((w) => w.skipped)) {
    const hosted = new Set(weeks1.filter((w) => !w.skipped).map((w) => w.hostMemberId));
    const lost = p1Ids.filter((m) => !hosted.has(m));
    const turn = await repos.weeks.skippedTurn();
    expect(turn?.memberId ?? null).toBe(lost.length === 1 ? lost[0] : null);
  }
  await restoreCheck(ctx, `${ctx.label} after P1 close`);

  // ---- second period: drop somebody (maybe refund), add a newcomer, carry-over ---------------------------------
  let p2Ids = [...p1Ids];
  if (rng.chance(0.5)) p2Ids = p2Ids.filter((m) => m !== rng.pick(p1Ids));
  if (rng.chance(0.6)) p2Ids.push(ids[n1] as string);
  if (p2Ids.length < 3) p2Ids = [...p1Ids];
  const model = await buildModel(ctx.db);
  for (const m of p1Ids.filter((x) => !p2Ids.includes(x))) {
    const credit = model.pool.get(`${p1.id}|${m}`) ?? 0;
    if (credit > 0 && rng.chance(0.7)) {
      const before = await repos.ledger.getKasBalances();
      await repos.credits.refund(p1.id, m, TODAY, 'tunai');
      expect((await repos.ledger.getKasBalances()).actual).toBe(before.actual - credit);
      bump('refundDropped');
    }
  }
  const held = new Map<string, number>();
  const model2 = await buildModel(ctx.db);
  for (const m of p2Ids) {
    let total = 0;
    for (const p of model2.periods.filter((x) => x.status === 'closed')) total += Math.max(0, model2.pool.get(`${p.id}|${m}`) ?? 0);
    held.set(m, total);
  }
  const p2 = await repos.periods.create({ name: 'P2', startDate: '2026-02-17', memberIds: p2Ids });
  const model3 = await buildModel(ctx.db);
  for (const m of p2Ids) {
    let applied = 0;
    for (let w = 1; w <= p2Ids.length; w += 1) applied += model3.credited.get(`${p2.id}|${m}|${w}`) ?? 0;
    expect({ seed, m, applied }).toEqual({ seed, m, applied: Math.min(held.get(m) ?? 0, DUE * p2Ids.length) });
    if (applied % DUE !== 0) bump('carryOverPartialWeek');
  }
  ctx.label = `seed ${seed} P2(N=${p2Ids.length})`;
  await checkAll(ctx, 'after create P2');
  await livePeriod(ctx, p2.id, p2Ids, rng.chance(0.6) ? TODAY : null);
  await restoreCheck(ctx, `${ctx.label} end`);
}

describe('independent QA: skip the last meeting, seeded lives with their own model', () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => 31_000 + i);
  it.each(seeds)('seed %i', async (seed) => {
    await runSeed(seed);
  }, 240_000);

  it('the runs really reached the interesting states', () => {
    if (SEEDS < 12) return;
    console.log(JSON.stringify(grand));
    expect(grand['skip:ok'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.5);
    expect(grand['undo:ok'] ?? 0).toBeGreaterThanOrEqual(2);
    expect(grand['closedWithSkip'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.2);
    expect(grand['probesWhileSkipped'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.3);
    expect(grand['restoreChecked'] ?? 0).toBeGreaterThanOrEqual(SEEDS);
  });
});

