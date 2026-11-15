// QA fuzz for "skip the last meeting" (decision 33). Seeded random runs through the REAL repositories on sql.js, so a
// failing seed reproduces. Each run drives one or two periods (N = 4 or 5) with random payments, corrections, host
// changes, meeting closes, host payouts, skips, undos, refunds and period closes, and after EVERY step checks:
//  - the restore health check (the same one a backup file must pass) finds nothing;
//  - per member and meeting: due = paid + offset + credited + outstanding; a skipped meeting is all zeros;
//  - no credit pool is negative, and in the active period credit = payment surplus + released host offsets;
//  - CSV "Masuk" minus "Keluar" equals actual kas (Tunai + Debit), exactly one amount column per row;
//  - every report builds.
// At the moment of a skip: actual kas (Tunai, Debit, Piutang) and the row counts of ledger, payments and allocations
// do not move, and expected kas drops by exactly U (dues no longer owed) + F (dues already paid or offset, now
// credit); a skip followed at once by an undo gives back statuses, credit, kas report, period report, close preview and
// all four CSV files byte for byte; skip and undo rejections follow previewSkip and leave every table untouched.
// At period close: the write-offs equal an independent computation and ignore the skipped meeting; carry-over into
// the next period equals min(credit held, dues of the new period).
import { csvAmountColumns } from '@/domain/flow';
import { eligibleHostIds } from '@/domain/schedule';
import { WeekSkipError } from '@/domain/week-skip';
import { buildCsvFor, CSV_FILES } from '@/ui/csvFiles';
import { healthCheck } from './backup';
import type { Db } from './db';
import { SkipUndoBlockedError } from './errors';
import { createRepositories, type Repositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-03-10';
/** 200 seeds take about ten minutes; the default keeps the normal test run short. Run `QA_FUZZ_SEEDS=200 npx jest skipLast`. */
const SEEDS = Number(process.env.QA_FUZZ_SEEDS ?? 40);
const OPS_PER_PERIOD = 14;

/** Small seeded PRNG (mulberry32): the same seed always gives the same run. */
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
type Rng = ReturnType<typeof makeRng>;

interface Ctx {
  db: Db;
  repos: Repositories;
  rng: Rng;
  tally: Record<string, number>;
  label: string;
}

const grand: Record<string, number> = {};
const bump = (ctx: Ctx, key: string) => {
  ctx.tally[key] = (ctx.tally[key] ?? 0) + 1;
  grand[key] = (grand[key] ?? 0) + 1;
};

/** Messages that mean "the data contradicts itself": never acceptable, whatever the random sequence did. */
const CORRUPTION = /inconsistent|do not add up|exceeds the weekly due|would be negative|settled amount|exceeds what is outstanding|has amounts/;

/** A rejected random action is fine (the rules said no); a contradiction in the data is not. */
function isBenign(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (CORRUPTION.test(e.message)) return false;
  return ['RepositoryError', 'DomainError', 'LoanError', 'HostPayoutStandsError', 'PaymentHostPayoutStandsError', 'WeekSkipError', 'SkipUndoBlockedError'].includes(e.name);
}

async function attempt<T>(ctx: Ctx, key: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  try {
    const value = await fn();
    bump(ctx, `${key}:ok`);
    return { ok: true, value };
  } catch (e) {
    if (!isBenign(e)) throw e;
    bump(ctx, `${key}:rejected`);
    return { ok: false, error: e as Error };
  }
}

const TABLES = ['ledger_entries', 'payments', 'allocations', 'offset_credits', 'credit_applications', 'payment_reversals', 'week_skips', 'week_skip_undos', 'weeks'];

/** Row counts of every table a skip or undo must not touch (or may touch only in week_skips / week_skip_undos). */
async function rowCounts(db: Db): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = (await db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))?.n ?? -1;
  return out;
}

/** Everything a skip + undo must give back unchanged, as one string. */
async function snapshot(ctx: Ctx, periodId: string): Promise<string> {
  const { repos } = ctx;
  const members = await repos.periods.getMembers(periodId);
  const periods = await repos.periods.list();
  const statuses: unknown[] = [];
  const credits: unknown[] = [];
  for (const m of members) {
    statuses.push(await repos.payments.getWeekStatuses(periodId, m.memberId));
    for (const p of periods) {
      if ((await repos.periods.getMembers(p.id)).some((x) => x.memberId === m.memberId)) credits.push([p.id, m.memberId, await repos.credits.getAvailable(p.id, m.memberId)]);
    }
  }
  const csv: string[] = [];
  for (const f of CSV_FILES) csv.push(await buildCsvFor(f.kind, repos));
  return JSON.stringify({
    statuses,
    credits,
    kas: await repos.reports.getKasReport(),
    period: await repos.reports.getPeriodReport(periodId),
    close: await repos.periods.previewClose(periodId),
    weeks: await repos.weeks.listByPeriod(periodId),
    csv,
  });
}

/**
 * Invariants that must hold after every single step. `full` adds the expensive ones (reports, CSV, kas report, every
 * period); the cheap ones (health check, active period) run after every step and the full set after key steps.
 */
async function checkAll(ctx: Ctx, step: string, full = true): Promise<void> {
  const { db, repos } = ctx;
  const label = `${ctx.label} ${step}`;
  const health = await healthCheck(db);
  expect({ label, problems: health.problems }).toEqual({ label, problems: [] });

  for (const period of (await repos.periods.list()).filter((p) => full || p.status === 'active')) {
    for (const m of await repos.periods.getMembers(period.id)) {
      const statuses = await repos.payments.getWeekStatuses(period.id, m.memberId);
      for (const s of statuses) {
        if (s.skipped) {
          expect({ label, s }).toEqual({ label, s: { week: s.week, due: 0, paid: 0, offset: 0, credited: 0, outstanding: 0, skipped: true } });
        } else {
          expect({ label, week: s.week, due: s.due }).toEqual({ label, week: s.week, due: 15_000 });
          expect({ label, week: s.week, sum: s.paid + s.offset + s.credited + s.outstanding }).toEqual({ label, week: s.week, sum: 15_000 });
          expect(Math.min(s.paid, s.offset, s.credited, s.outstanding)).toBeGreaterThanOrEqual(0);
        }
      }
      const credit = await repos.credits.getAvailable(period.id, m.memberId); // throws when a pool is negative
      expect(credit).toBeGreaterThanOrEqual(0);
      if (period.status === 'active') {
        // Independent identity (nothing is applied or refunded yet in an active period): credit = payment surplus
        // + host offsets of this member that settle a skipped meeting and were not corrected.
        const surplus = (await repos.payments.listWithCredit(period.id, m.memberId)).reduce((t, p) => t + p.credit, 0);
        const released =
          (
            await db.getFirst<{ n: number }>(
              `SELECT COALESCE(SUM(o.amount), 0) AS n FROM offset_credits o
                JOIN week_skips s ON s.period_id = o.period_id AND s.week = o.week AND NOT EXISTS (SELECT 1 FROM week_skip_undos u WHERE u.skip_id = s.id)
               WHERE o.period_id = ? AND o.member_id = ? AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = o.ledger_entry_id)`,
              [period.id, m.memberId],
            )
          )?.n ?? 0;
        expect({ label, member: m.memberId, credit }).toEqual({ label, member: m.memberId, credit: surplus + released });
      }
    }
    if (full) await repos.reports.getPeriodReport(period.id);
    for (const w of await repos.weeks.listByPeriod(period.id)) {
      if (w.skipped) expect(w.status).toBe('skipped');
      if (w.skipped && period.status === 'active') expect(w.closedAt).toBeNull();
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
  expect({ label, csvNet: masuk - keluar }).toEqual({ label, csvNet: kas.actual });
  const report = await repos.reports.getKasReport();
  expect(report.expected.expected).toBe(report.expected.actualKas + report.expected.outstandingDues - report.expected.creditHeld);
}

// ---------------------------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------------------------

const PAY_DATES = ['2026-01-06', '2026-01-13', '2026-02-03', TODAY] as const;

/** Assigns a host to the current meeting if needed, closes it and pays the host. Each step may be rejected. */
async function advance(ctx: Ctx, periodId: string, memberIds: readonly string[]): Promise<void> {
  const { repos, rng } = ctx;
  const weeks = await repos.weeks.listByPeriod(periodId);
  const current = weeks.find((w) => w.status === 'open');
  if (!current) return;
  if (current.hostMemberId === null) {
    const eligible = eligibleHostIds(
      weeks.map((w) => ({ number: w.number, date: w.date, hostMemberId: w.hostMemberId, status: w.status })),
      memberIds,
    );
    if (eligible.length === 0) return;
    await attempt(ctx, 'assign', () => repos.weeks.assignHost(periodId, current.number, rng.pick(eligible), current.date));
  }
  const closed = await attempt(ctx, 'closeWeek', () => repos.weeks.closeOldest(periodId));
  if (closed.ok) await attempt(ctx, 'payHost', () => repos.ledger.settleHost(periodId, closed.value, TODAY, rng.pick(['tunai', 'debit'] as const)));
}

/** skipLast with every property of the step checked. `forceTry` calls it even when previewSkip says no. */
async function doSkip(ctx: Ctx, periodId: string, forceTry: boolean): Promise<boolean> {
  const { repos, db, rng } = ctx;
  const preview = await repos.weeks.previewSkip(periodId);
  if (!preview.eligible && !forceTry) return false;

  const members = await repos.periods.getMembers(periodId);
  const lastNumber = (await repos.periods.getById(periodId))?.memberCount ?? 0;
  const statusesBefore = await Promise.all(members.map((m) => repos.payments.getWeekStatuses(periodId, m.memberId)));
  let unpaid = 0; // U: dues of the last meeting nobody has settled
  let settledInCash = 0; // F: dues of it already paid or offset (becomes credit)
  let carried = 0; // dues of it settled by carried-over credit (moves between two credit lines)
  for (const list of statusesBefore) {
    const s = list[lastNumber - 1];
    if (s && !s.skipped) {
      unpaid += s.outstanding;
      settledInCash += s.paid + s.offset;
      carried += s.credited;
    }
  }
  const countsBefore = await rowCounts(db);
  const kasBefore = await repos.ledger.getKasBalances();
  const reportBefore = await repos.reports.getKasReport();
  const before = await snapshot(ctx, periodId);

  const result = await attempt(ctx, 'skip', () => repos.weeks.skipLast(periodId, `alasan ${rng.int(1, 99)}`));
  if (!result.ok) {
    // the repository must say no for exactly the reason previewSkip gave, and must leave every table alone
    bump(ctx, `skipBlocked:${preview.blocker?.code}`);
    expect(preview.eligible).toBe(false);
    expect(result.error).toBeInstanceOf(WeekSkipError);
    expect((result.error as WeekSkipError).code).toBe(preview.blocker?.code);
    expect(await rowCounts(db)).toEqual(countsBefore);
    return false;
  }
  expect(preview.eligible).toBe(true);
  expect(preview.prepaidTotal).toBe(settledInCash + carried);

  // a skip is not a money movement
  const countsAfter = await rowCounts(db);
  for (const t of ['ledger_entries', 'payments', 'allocations', 'offset_credits', 'credit_applications', 'payment_reversals', 'weeks']) {
    expect({ t, n: countsAfter[t] }).toEqual({ t, n: countsBefore[t] });
  }
  expect(countsAfter.week_skips).toBe((countsBefore.week_skips ?? 0) + 1);
  expect(await repos.ledger.getKasBalances()).toEqual(kasBefore);

  // expected kas: U leaves the arrears, F leaves the dues and joins the credit; carried-over credit only changes line
  const reportAfter = await repos.reports.getKasReport();
  expect(reportAfter.expected.outstandingDues).toBe(reportBefore.expected.outstandingDues - unpaid);
  expect(reportAfter.expected.creditHeld).toBe(reportBefore.expected.creditHeld + settledInCash);
  expect(reportAfter.expected.expected).toBe(reportBefore.expected.expected - unpaid - settledInCash);
  expect(reportAfter.expected.actualKas).toBe(reportBefore.expected.actualKas);

  await checkAll(ctx, 'after skip');

  if (rng.chance(0.45)) {
    // skip, then undo straight away: the world is exactly as before
    const undone = await attempt(ctx, 'undoNow', () => repos.weeks.undoSkip(periodId, 'batal langsung'));
    expect(undone.ok).toBe(true);
    expect(await snapshot(ctx, periodId)).toBe(before);
    bump(ctx, 'roundTrip');
    await checkAll(ctx, 'after skip+undo');
    return false;
  }
  return true;
}

async function doUndo(ctx: Ctx, periodId: string): Promise<void> {
  const { repos, db } = ctx;
  const countsBefore = await rowCounts(db);
  const result = await attempt(ctx, 'undo', () => repos.weeks.undoSkip(periodId, 'berubah pikiran'));
  if (!result.ok) {
    expect(await rowCounts(db)).toEqual(countsBefore); // a rejected undo writes nothing
    if (result.error instanceof SkipUndoBlockedError) bump(ctx, 'undoBlockedByRefund');
  }
}

/** Plays random actions on the ACTIVE period. */
async function randomOps(ctx: Ctx, periodId: string, memberIds: readonly string[], count: number): Promise<void> {
  const { repos, db, rng } = ctx;
  const actions = ['pay', 'pay', 'pay', 'pay', 'pay', 'reversePay', 'advance', 'advance', 'advance', 'payHost', 'payHost', 'reversePayout', 'skip', 'skip', 'undo', 'refund', 'assign', 'closeOldest'] as const;
  for (let i = 0; i < count; i += 1) {
    const action = rng.pick(actions);
    if (action === 'pay') {
      await attempt(ctx, 'pay', () =>
        repos.payments.record({ periodId, memberId: rng.pick(memberIds), date: rng.pick(PAY_DATES), amount: 15_000 * rng.int(1, 3), account: rng.pick(['tunai', 'debit'] as const) }),
      );
    } else if (action === 'reversePay') {
      const rows = await db.getAll<{ id: string }>('SELECT id FROM payments WHERE period_id = ? AND id NOT IN (SELECT payment_id FROM payment_reversals)', [periodId]);
      if (rows.length > 0) await attempt(ctx, 'reversePay', () => repos.payments.reverse(rng.pick(rows).id, 'salah'));
    } else if (action === 'advance') {
      await advance(ctx, periodId, memberIds);
    } else if (action === 'payHost') {
      const weeks = (await repos.weeks.listByPeriod(periodId)).filter((w) => w.hostMemberId !== null && w.status !== 'skipped');
      if (weeks.length > 0) await attempt(ctx, 'payHost', () => repos.ledger.settleHost(periodId, rng.pick(weeks).number, TODAY, rng.pick(['tunai', 'debit'] as const)));
    } else if (action === 'reversePayout') {
      const rows = await db.getAll<{ week: number }>(
        "SELECT DISTINCT week FROM ledger_entries e WHERE period_id = ? AND type = 'host_payout' AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id)",
        [periodId],
      );
      if (rows.length > 0) await attempt(ctx, 'reversePayout', () => repos.ledger.reverseHostPayout(periodId, rng.pick(rows).week, 'koreksi'));
    } else if (action === 'skip') {
      await doSkip(ctx, periodId, rng.chance(0.3));
    } else if (action === 'undo') {
      await doUndo(ctx, periodId);
    } else if (action === 'refund') {
      const refundable = await repos.credits.listRefundable();
      const pick = refundable.length > 0 ? rng.pick(refundable) : null;
      if (pick) await attempt(ctx, 'refund', () => repos.credits.refund(pick.periodId, pick.memberId, TODAY, 'tunai'));
    } else if (action === 'assign') {
      const weeks = await repos.weeks.listByPeriod(periodId);
      const open = weeks.filter((w) => w.status === 'open');
      if (open.length > 0) {
        const w = rng.pick(open);
        await attempt(ctx, 'assign', () => repos.weeks.assignHost(periodId, w.number, rng.pick(memberIds), w.date));
      }
    } else {
      await attempt(ctx, 'closeOldest', () => repos.weeks.closeOldest(periodId));
    }
    await checkAll(ctx, `op ${i + 1} ${action}`, i % 5 === 4 || ['skip', 'undo', 'refund', 'reversePayout'].includes(action));
  }
}

/** Drives the period to a state where it can end: closes meetings, pays hosts, skips the last one half of the time. */
async function finish(ctx: Ctx, periodId: string, memberIds: readonly string[]): Promise<boolean> {
  const { repos, rng } = ctx;
  for (let guard = 0; guard < 60; guard += 1) {
    const preview = await repos.periods.previewClose(periodId);
    if (preview.canClose) return true;
    // pay the hosts whose payout is missing or was corrected (also a condition for skipping the last meeting)
    for (const w of preview.unpaidHostWeeks) await attempt(ctx, 'payHost', () => repos.ledger.settleHost(periodId, w, TODAY, 'tunai'));
    if (preview.openWeeks.length > 0) {
      const lastOpen = preview.openWeeks[0] as number;
      const period = await repos.periods.getById(periodId);
      if (lastOpen === period?.memberCount && rng.chance(0.7)) {
        if (await doSkip(ctx, periodId, false)) {
          if (rng.chance(0.4)) {
            // the skip stays for a while, money moves, then it is undone (it may be refused: that is checked too)
            for (let k = rng.int(0, 2); k > 0; k -= 1) {
              await attempt(ctx, 'pay', () =>
                repos.payments.record({ periodId, memberId: rng.pick(memberIds), date: rng.pick(PAY_DATES), amount: 15_000 * rng.int(1, 3), account: 'tunai' }),
              );
            }
            await doUndo(ctx, periodId);
            await checkAll(ctx, 'after late undo');
          }
          continue;
        }
      }
      await advance(ctx, periodId, memberIds);
    }
    await checkAll(ctx, `finish ${guard}`, false);
  }
  return (await repos.periods.previewClose(periodId)).canClose;
}

/** Ends the period and checks the write-offs against an independent computation. */
async function closeWithOracle(ctx: Ctx, periodId: string, endDate: string): Promise<void> {
  const { repos, db } = ctx;
  const members = await repos.periods.getMembers(periodId);
  const skippedBefore = (await repos.weeks.listByPeriod(periodId)).filter((w) => w.skipped).map((w) => w.number);
  const expected = new Map<string, number>();
  const creditBefore = new Map<string, number>();
  const arrearsBefore = new Map<string, number>();
  for (const m of members) {
    const statuses = await repos.payments.getWeekStatuses(periodId, m.memberId);
    const arrears = statuses.filter((s) => !s.skipped).reduce((t, s) => t + s.outstanding, 0);
    const credit = await repos.credits.getAvailable(periodId, m.memberId);
    creditBefore.set(m.memberId, credit);
    arrearsBefore.set(m.memberId, arrears);
    const writeoff = Math.max(0, arrears - credit);
    if (writeoff > 0) expected.set(m.memberId, writeoff);
  }
  const kasBefore = await repos.ledger.getKasBalances();
  await repos.periods.close(periodId, endDate);

  const rows = await db.getAll<{ member_id: string; amount: number }>("SELECT member_id, amount FROM ledger_entries WHERE period_id = ? AND type = 'debt_writeoff'", [periodId]);
  expect(new Map(rows.map((r) => [r.member_id, r.amount]))).toEqual(expected);
  expect(await repos.ledger.getKasBalances()).toEqual(kasBefore); // write-offs and skips never touch a pos
  for (const m of members) {
    // credit left = credit held - arrears it settled (the arrears are those BEFORE the close)
    expect(await repos.credits.getAvailable(periodId, m.memberId)).toBe(Math.max(0, (creditBefore.get(m.memberId) ?? 0) - (arrearsBefore.get(m.memberId) ?? 0)));
  }
  // the skipped meeting closed together with the period, still reads as skipped, and nothing is left open
  expect((await db.getFirst<{ n: number }>("SELECT COUNT(*) AS n FROM weeks WHERE period_id = ? AND status = 'open'", [periodId]))?.n).toBe(0);
  for (const number of skippedBefore) {
    const w = await repos.weeks.get(periodId, number);
    expect(w).toMatchObject({ status: 'skipped', skipped: true });
    expect(w?.closedAt).not.toBeNull();
  }
  if (skippedBefore.length > 0) bump(ctx, 'closedWithSkip');
  await checkAll(ctx, 'after close');
}

// ---------------------------------------------------------------------------------------------------------------
// One seed
// ---------------------------------------------------------------------------------------------------------------

async function runSeed(seed: number): Promise<void> {
  const rng = makeRng(seed);
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `s${seed}-${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ctx: Ctx = { db, repos, rng, tally: {}, label: `seed ${seed}` };

  const size = rng.int(4, 5);
  const ids: string[] = [];
  for (let i = 0; i < size; i += 1) ids.push((await repos.members.create(`M${i + 1}`)).id);
  const first = await repos.periods.create({ name: 'P1', startDate: '2026-01-06', memberIds: ids });
  await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 500_000, account: 'tunai' }); // needs a period
  ctx.label = `seed ${seed} P1`;
  await randomOps(ctx, first.id, ids, OPS_PER_PERIOD);
  if (!(await finish(ctx, first.id, ids))) {
    bump(ctx, 'stuck');
    return;
  }
  await closeWithOracle(ctx, first.id, '2026-02-09');

  // Second period: maybe without one member who holds credit (then that credit is refunded), carry-over otherwise.
  let secondIds = [...ids];
  const dropCandidate = (await Promise.all(ids.map(async (m) => ({ m, credit: await repos.credits.getAvailable(first.id, m) })))).filter((x) => x.credit > 0);
  const dropped = dropCandidate.length > 0 && rng.chance(0.35) ? rng.pick(dropCandidate) : null;
  if (dropped) secondIds = ids.filter((m) => m !== dropped.m);

  const heldBefore = new Map<string, number>();
  for (const m of secondIds) heldBefore.set(m, await repos.credits.getAvailable(first.id, m));
  const second = await repos.periods.create({ name: 'P2', startDate: '2026-02-10', memberIds: secondIds });
  ctx.label = `seed ${seed} P2`;
  for (const m of secondIds) {
    const applied = (
      await db.getFirst<{ n: number }>("SELECT COALESCE(SUM(amount), 0) AS n FROM credit_applications WHERE to_period_id = ? AND member_id = ? AND kind = 'carry_over'", [second.id, m])
    )?.n;
    expect({ seed, member: m, applied }).toEqual({ seed, member: m, applied: Math.min(heldBefore.get(m) ?? 0, 15_000 * secondIds.length) });
    const credited = (await repos.payments.getWeekStatuses(second.id, m)).reduce((t, s) => t + s.credited, 0);
    expect({ seed, member: m, credited }).toEqual({ seed, member: m, credited: applied });
  }
  if (dropped) {
    const before = await repos.ledger.getKasBalances();
    await repos.credits.refund(first.id, dropped.m, TODAY, 'tunai');
    expect((await repos.ledger.getKasBalances()).actual).toBe(before.actual - dropped.credit);
    expect(await repos.credits.getAvailable(first.id, dropped.m)).toBe(0);
    bump(ctx, 'refundDropped');
  }
  await checkAll(ctx, 'after create P2');

  await randomOps(ctx, second.id, secondIds, OPS_PER_PERIOD);
  if (await finish(ctx, second.id, secondIds)) await closeWithOracle(ctx, second.id, TODAY);
  else bump(ctx, 'stuck');
}

describe('skip the last meeting: seeded random runs', () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => 7000 + i);
  it.each(seeds)('seed %i', async (seed) => {
    await runSeed(seed);
  }, 120_000);

  it('the runs really exercised the feature', () => {
    // If a refactor of the generator stops reaching the interesting states, this fails instead of passing silently.
    if (SEEDS < 12) return;
    expect(grand['skip:ok'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.5);
    expect(grand['roundTrip'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.2);
    expect(grand['closedWithSkip'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.2);
    expect(grand['undo:ok'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.05);
    expect(grand['skip:rejected'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.1);
    expect(grand['refundDropped'] ?? 0).toBeGreaterThanOrEqual(SEEDS * 0.05);
  });
});
