// Second independent QA run before M7b (2026-11-13). Everything here runs on sql.js (real SQLite engine in Node),
// NOT on the phone. Numbers are derived from CLAUDE.md, not from what the code currently does.
//
// 1. Randomised "money conservation" runs through the real repositories (seeded, so a failure is reproducible).
//    ORACLE (derived by hand from the domain rules, independent of computeKasBalances / computeExpectedKas):
//      dues of a period      = 15.000 x N x N = allocated + host offsets + credited (titipan) + written off
//      cash in               = payments - refunds + host offsets - payouts (10.000 x N x N)
//      => Tunai + Debit + Piutang = opening balances + 5.000 x SUM(N^2) - SUM(write-offs) + titipan still held
//    This must hold for ANY sequence of payments, corrections, payouts, carry-over, refunds and loans.
// 2. Invariants after EVERY step: health check (= what a restore demands), CSV Masuk - Keluar = Tunai + Debit,
//    loans sum to Piutang, per-member week arithmetic, reports do not throw.
// 3. Cutover simulation, restore classification gaps, integer money limits, correction after payout.
//
// A test marked it.failing documents a real finding: it must become a plain `it` when the developer fixes it.
import { PHRASE_RESTORE, requiredPhrase } from '@/domain/backup';
import { csvAmountColumns } from '@/domain/flow';
import { commitRestore, discardRestore, healthCheck, prepareRestore } from './backup';
import type { Db } from './db';
import { createRepositories, type Repositories } from './index';
import { createSqlJsEnv, FakeSafetyStore } from './testing/sqlJsBridge';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-03-10';
const START = '2026-02-03'; // a Tuesday

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

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
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}
type Rng = ReturnType<typeof makeRng>;

async function setup(prefix = 'id') {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `${prefix}${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  return { db, repos };
}

/** Messages that mean "the data contradicts itself": never acceptable, whatever the random sequence did. */
const CORRUPTION = /inconsistent|do not add up|exceeds the weekly due|would be negative|settled amount|exceeds what is outstanding/;

/** A rejected random action is fine (the rules said no); a contradiction in the data is not. */
function isBenign(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (CORRUPTION.test(e.message)) return false;
  return ['RepositoryError', 'DomainError', 'LoanError', 'HostPayoutStandsError', 'MemberArchiveError'].includes(e.name);
}

interface Tally {
  [key: string]: number;
}

async function attempt(tally: Tally, key: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    tally[`${key}:ok`] = (tally[`${key}:ok`] ?? 0) + 1;
    return true;
  } catch (e) {
    if (!isBenign(e)) throw e;
    tally[`${key}:rejected`] = (tally[`${key}:rejected`] ?? 0) + 1;
    return false;
  }
}

/** Invariants that must hold after every single step, whatever happened before. */
async function checkInvariants(db: Db, repos: Repositories, label: string): Promise<void> {
  // 1. The health check a restore runs on a file: our own data must never fail it.
  const health = await healthCheck(db);
  expect({ label, problems: health.problems }).toEqual({ label, problems: [] });

  const kas = await repos.ledger.getKasBalances();

  // 2. CSV: exactly one amount column per row, and Masuk - Keluar = Tunai + Debit (owner decision D10).
  let masuk = 0;
  let keluar = 0;
  for (const row of await repos.exports.listLedger()) {
    const c = csvAmountColumns({ direction: row.direction, amount: row.amount, account: row.account, toAccount: row.toAccount });
    expect([c.moneyIn, c.moneyOut, c.noKasChange].filter((v) => v !== null)).toHaveLength(1);
    masuk += c.moneyIn ?? 0;
    keluar += c.moneyOut ?? 0;
  }
  expect({ label, csvNet: masuk - keluar }).toEqual({ label, csvNet: kas.actual });

  // 3. Loans: every member's remaining + unnamed old balance = Piutang.
  const loans = await repos.ledger.listLoanBalances();
  expect({ label, piutang: loans.members.reduce((s, m) => s + m.remaining, 0) + loans.unnamedOpening }).toEqual({
    label,
    piutang: kas.piutang,
  });

  // 4. Per member and period: due = paid + offset + credited + outstanding, nothing negative, nothing above the due.
  for (const period of await repos.periods.list()) {
    for (const m of await repos.periods.getMembers(period.id)) {
      for (const s of await repos.payments.getWeekStatuses(period.id, m.memberId)) {
        expect(s.due).toBe(15_000);
        expect(s.paid + s.offset + s.credited + s.outstanding).toBe(s.due);
        expect(s.outstanding).toBeGreaterThanOrEqual(0);
        expect(s.paid).toBeGreaterThanOrEqual(0);
        expect(s.offset).toBeGreaterThanOrEqual(0);
        expect(s.credited).toBeGreaterThanOrEqual(0);
      }
      expect(await repos.credits.getAvailable(period.id, m.memberId)).toBeGreaterThanOrEqual(0);
    }
    // 5. Reports must build (summarizeMeeting throws when dues do not add up).
    await repos.reports.getPeriodReport(period.id);
  }
  const report = await repos.reports.getKasReport();
  expect(report.expected.expected).toBe(report.expected.actualKas + report.expected.outstandingDues - report.expected.creditHeld);
}

interface PeriodRun {
  periodId: string;
  memberIds: string[];
}

/** One whole period with random behaviour, ending in a closed period. Returns what the oracle needs. */
async function runRandomPeriod(
  db: Db,
  repos: Repositories,
  rng: Rng,
  tally: Tally,
  name: string,
  memberIds: string[],
  startDate: string,
  tag: string,
  afterCreate?: (periodId: string) => Promise<void>,
): Promise<PeriodRun> {
  const period = await repos.periods.create({ name, startDate, memberIds });
  if (afterCreate) await afterCreate(period.id);
  const N = memberIds.length;
  const step = async (label: string) => checkInvariants(db, repos, `${tag} ${label}`);
  await step('created');

  const randomDate = () => {
    // a date between START and TODAY (both in the past relative to the injected clock)
    const day = rng.int(0, 35);
    const d = new Date(Date.UTC(2026, 1, 3 + day));
    return d.toISOString().slice(0, 10);
  };
  const acct = () => rng.pick(['tunai', 'debit'] as const);

  async function ensureHost(week: number) {
    const w = await repos.weeks.get(period.id, week);
    if (!w || w.status === 'closed') return;
    if (w.hostMemberId !== null && !rng.chance(0.15)) return;
    const weeks = await repos.weeks.listByPeriod(period.id);
    const hosted = new Set(weeks.filter((x) => x.status === 'closed').map((x) => x.hostMemberId));
    const eligible = memberIds.filter((id) => !hosted.has(id));
    if (eligible.length === 0) return;
    await attempt(tally, 'assignHost', () => repos.weeks.assignHost(period.id, week, rng.pick(eligible), w.date));
  }

  async function randomOp(week: number) {
    const roll = rng.next();
    if (roll < 0.42) {
      const memberId = rng.pick(memberIds);
      const amount = rng.int(1, 4) * 15_000;
      await attempt(tally, 'pay', () => repos.payments.record({ periodId: period.id, memberId, date: randomDate(), amount, account: acct() }));
    } else if (roll < 0.52) {
      // correct a random payment that is still in force
      const memberId = rng.pick(memberIds);
      const inForce = (await repos.payments.listWithCredit(period.id, memberId)).filter((p) => !p.reversed);
      if (inForce.length > 0) await attempt(tally, 'reversePayment', () => repos.payments.reverse(rng.pick(inForce).id, 'salah catat'));
    } else if (roll < 0.62) {
      const w = rng.int(1, week);
      await attempt(tally, 'settleHost', () => repos.ledger.settleHost(period.id, w, TODAY, acct()));
    } else if (roll < 0.7) {
      const w = rng.int(1, week);
      await attempt(tally, 'reversePayout', () => repos.ledger.reverseHostPayout(period.id, w, 'salah jumlah'));
    } else if (roll < 0.76) {
      await ensureHost(Math.min(N, week + rng.int(0, 1)));
    } else if (roll < 0.82) {
      const from = acct();
      await attempt(tally, 'transfer', () =>
        repos.ledger.recordKas({ kind: 'transfer', date: TODAY, amount: rng.int(1, 9) * 1_000, account: from, toAccount: from === 'tunai' ? 'debit' : 'tunai' }),
      );
    } else if (roll < 0.9) {
      const memberId = rng.pick(memberIds);
      await attempt(tally, 'loan', () =>
        repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: rng.int(1, 9) * 1_000, account: acct(), memberId }),
      );
    } else if (roll < 0.96) {
      const loans = (await repos.ledger.listLoanBalances()).members.filter((m) => m.remaining > 0);
      if (loans.length > 0) {
        const l = rng.pick(loans);
        // sometimes the full remainder, sometimes a part (not a multiple of anything on purpose)
        const amount = rng.chance(0.5) ? l.remaining : rng.int(1, l.remaining);
        await attempt(tally, 'repay', () => repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount, memberId: l.memberId }));
      }
    } else {
      // correct a random loan or repayment
      const entries = (await repos.ledger.listKas()).filter((e) => (e.type === 'loan' || e.type === 'loan_repayment') && !e.reversedById);
      if (entries.length > 0) await attempt(tally, 'reverseLoanEntry', () => repos.ledger.reverseEntry(rng.pick(entries).id, 'salah catat'));
    }
  }

  for (let week = 1; week <= N; week += 1) {
    await ensureHost(week);
    const ops = rng.int(2, 7);
    for (let i = 0; i < ops; i += 1) {
      await randomOp(week);
      await step(`week ${week} op ${i}`);
    }
    // A meeting needs a host to close; a week whose host payout stands is the normal end of a meeting.
    const w = await repos.weeks.get(period.id, week);
    if (w && w.hostMemberId === null) await ensureHost(week);
    const w2 = await repos.weeks.get(period.id, week);
    if (w2 && w2.hostMemberId === null) {
      // The random pick was rejected (e.g. only an ineligible member left); take the first eligible one directly.
      const weeks = await repos.weeks.listByPeriod(period.id);
      const hosted = new Set(weeks.filter((x) => x.status === 'closed').map((x) => x.hostMemberId));
      const first = memberIds.find((id) => !hosted.has(id) && !weeks.some((x) => x.hostMemberId === id));
      if (first) await repos.weeks.assignHost(period.id, week, first, w2.date);
    }
    if (!(await repos.ledger.getWeekPayout(period.id, week))) await repos.ledger.settleHost(period.id, week, TODAY, acct());
    tally['weekClosed'] = (tally['weekClosed'] ?? 0) + 1;
    await repos.weeks.closeOldest(period.id);
    await step(`week ${week} closed`);
  }

  // After the last meeting: a few more corrections on closed meetings, then every host must be paid again.
  for (let i = 0; i < rng.int(0, 4); i += 1) {
    await randomOp(N);
    await step(`late op ${i}`);
  }
  for (const w of await repos.weeks.listByPeriod(period.id)) {
    if (!(await repos.ledger.getWeekPayout(period.id, w.number))) await repos.ledger.settleHost(period.id, w.number, TODAY, acct());
  }
  await step('before close');
  await repos.periods.close(period.id, TODAY);
  await step('closed');
  return { periodId: period.id, memberIds };
}

/** The hand-derived oracle: Tunai + Debit + Piutang after everything is closed. */
async function oracleTotal(repos: Repositories, runs: PeriodRun[], openings: number): Promise<{ expected: number; writeoffs: number; titipanLeft: number }> {
  const entries = await repos.ledger.listKas();
  const reversed = new Set(entries.filter((e) => e.type === 'reversal' && e.reversesEntryId).map((e) => e.reversesEntryId as string));
  const writeoffs = entries.filter((e) => e.type === 'debt_writeoff' && !reversed.has(e.id)).reduce((s, e) => s + e.amount, 0);
  let titipanLeft = 0;
  for (const r of runs) for (const m of r.memberIds) titipanLeft += await repos.credits.getAvailable(r.periodId, m);
  const squares = runs.reduce((s, r) => s + r.memberIds.length * r.memberIds.length, 0);
  return { expected: openings + 5_000 * squares - writeoffs + titipanLeft, writeoffs, titipanLeft };
}

// ---------------------------------------------------------------------------------------------------------------
// 1 + 2. Randomised money conservation
// ---------------------------------------------------------------------------------------------------------------

describe('Randomised runs: kas = opening + 5.000 x N^2 - write-offs + Titipan still held (hand-derived oracle)', () => {
  const grand: Tally = {};

  // QA_FUZZ_SEEDS=100 for a deeper local run; the default keeps the suite fast.
  const SEEDS = Number(process.env.QA_FUZZ_SEEDS ?? 4);
  const seeds = Array.from({ length: SEEDS }, (_, i) => 1000 + i);
  it.each(seeds)('single period, seed %i', async (seed) => {
    const rng = makeRng(seed);
    const { db, repos } = await setup();
    const N = rng.int(2, 5);
    const ids: string[] = [];
    for (let i = 0; i < N; i += 1) ids.push((await repos.members.create(`Anggota ${i + 1}`)).id);
    // Opening balances (they need a period, see the cutover test): Tunai, Debit and one named old loan (Piutang).
    const run = await runRandomPeriod(db, repos, rng, grand, 'Periode acak', ids, START, `seed ${seed}`, async () => {
      await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-02-01', amount: 100_000, account: 'tunai' });
      await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-02-01', amount: 20_000, account: 'debit' });
      await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-02-01', amount: 12_000, account: 'piutang', memberId: ids[0] as string });
    });
    const { expected } = await oracleTotal(repos, [run], 132_000);
    const kas = await repos.ledger.getKasBalances();
    expect({ seed, total: kas.tunai + kas.debit + kas.piutang }).toEqual({ seed, total: expected });
  }, 60_000);

  const seeds2 = Array.from({ length: SEEDS }, (_, i) => 2000 + i);
  it.each(seeds2)('two periods with carry-over, refunds and a member who skips the second period, seed %i', async (seed) => {
    const rng = makeRng(seed);
    const { db, repos } = await setup();
    const total = rng.int(3, 5);
    const ids: string[] = [];
    for (let i = 0; i < total; i += 1) ids.push((await repos.members.create(`Anggota ${i + 1}`)).id);
    const first = await runRandomPeriod(db, repos, rng, grand, 'Periode 1', ids, START, `seed ${seed} P1`);
    await checkInvariants(db, repos, `seed ${seed} after P1`);

    // Second period: a random subset (at least 2 members). Members left out keep their Titipan until refunded.
    const keep = ids.filter(() => rng.chance(0.75));
    const second = keep.length >= 2 ? keep : ids.slice(0, 2);
    for (const left of ids.filter((id) => !second.includes(id))) {
      if (rng.chance(0.6)) {
        const available = await repos.credits.getAvailable(first.periodId, left);
        if (available > 0) await attempt(grand, 'refund', () => repos.credits.refund(first.periodId, left, TODAY, rng.pick(['tunai', 'debit'] as const)));
      }
    }
    await checkInvariants(db, repos, `seed ${seed} after refunds`);
    const carry = await repos.periods.previewCarryOver(second);
    const secondRun = await runRandomPeriod(db, repos, rng, grand, 'Periode 2', second, '2026-03-03', `seed ${seed} P2`);
    if (carry.some((c) => c.plan.applied > 0)) grand['carryOverUsed'] = (grand['carryOverUsed'] ?? 0) + 1;

    const { expected } = await oracleTotal(repos, [first, secondRun], 0);
    const kas = await repos.ledger.getKasBalances();
    expect({ seed, total: kas.tunai + kas.debit + kas.piutang }).toEqual({ seed, total: expected });
  }, 90_000);

  it('the random runs really exercised the interesting paths (otherwise the oracle proves nothing)', () => {
    // Printed so the QA report can quote real numbers.
    console.log('QA fuzz tally', JSON.stringify(grand));
    if (SEEDS < 10) return; // the coverage counts below need the larger run (QA_FUZZ_SEEDS=10 or more)
    expect(grand['pay:ok'] ?? 0).toBeGreaterThan(100);
    expect(grand['reversePayment:ok'] ?? 0).toBeGreaterThan(5);
    expect(grand['reversePayout:ok'] ?? 0).toBeGreaterThan(5);
    expect(grand['settleHost:ok'] ?? 0).toBeGreaterThan(5);
    expect(grand['loan:ok'] ?? 0).toBeGreaterThan(5);
    expect(grand['repay:ok'] ?? 0).toBeGreaterThan(5);
    expect(grand['refund:ok'] ?? 0).toBeGreaterThan(0);
    expect(grand['carryOverUsed'] ?? 0).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3a. Cutover simulation (PROJECT.md, "Planned cutover order")
// ---------------------------------------------------------------------------------------------------------------

describe('Cutover as written in PROJECT.md, step by step on an EMPTY database ("Mulai dari nol")', () => {
  it('opening balances cannot be entered before a period exists, so the written order (opening balance first) is not executable', async () => {
    const { repos } = await setup();
    const a = (await repos.members.create('Ani')).id;
    await expect(repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 500_000, account: 'tunai' })).rejects.toThrow(/no period exists yet/);
    await expect(
      repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 50_000, account: 'piutang', memberId: a }),
    ).rejects.toThrow(/no period exists yet/);
  });

  it('works when the period is created first: opening kas, named old loans, paper meetings 1-2 in the past, payout, close, backup roundtrip', async () => {
    const env = await createSqlJsEnv();
    let n = 0;
    const repos = createRepositories(env.db, { newId: () => `c${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
    const names = ['Ani', 'Budi', 'Citra', 'Dedi', 'Eka'];
    const ids: string[] = [];
    for (const name of names) ids.push((await repos.members.create(name)).id);
    const [ani, budi, citra, dedi, eka] = ids as [string, string, string, string, string];

    // Meeting 1 was 3 weeks ago on paper; the period starts in the past.
    const p = await repos.periods.create({ name: 'Periode 1', startDate: '2026-02-17', memberIds: ids });
    // Opening balances = kas before meeting 1 (Tunai and Debit), old loans of two members named in Piutang.
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-02-16', amount: 750_000, account: 'tunai' });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-02-16', amount: 200_000, account: 'debit' });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-02-16', amount: 100_000, account: 'piutang', memberId: budi });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-02-16', amount: 45_000, account: 'piutang', memberId: citra });
    let kas = await repos.ledger.getKasBalances();
    expect(kas).toEqual({ tunai: 750_000, debit: 200_000, piutang: 145_000, actual: 950_000 });

    // Meeting 1 (host Ani, 2026-02-17): everybody pays 15.000 on the day, Budi pays 30.000 (1 week in advance).
    await repos.weeks.assignHost(p.id, 1, ani, '2026-02-17');
    for (const m of [ani, citra, dedi, eka]) await repos.payments.record({ periodId: p.id, memberId: m, date: '2026-02-17', amount: 15_000, account: 'tunai' });
    await repos.payments.record({ periodId: p.id, memberId: budi, date: '2026-02-17', amount: 30_000, account: 'tunai' });
    await repos.ledger.settleHost(p.id, 1, '2026-02-17', 'tunai'); // payout 10.000 x 5 = 50.000, no offset
    await repos.weeks.closeOldest(p.id);
    kas = await repos.ledger.getKasBalances();
    // 75.000 + 15.000 (Budi's week 2) collected, 50.000 paid out => Tunai 750.000 + 90.000 - 50.000
    expect(kas.tunai).toBe(790_000);

    // Meeting 2 (host Budi, 2026-02-24, a PAST date): Budi's week 2 was prepaid, so no offset; the others pay.
    await repos.weeks.assignHost(p.id, 2, budi, '2026-02-24');
    for (const m of [ani, citra, dedi]) await repos.payments.record({ periodId: p.id, memberId: m, date: '2026-02-24', amount: 15_000, account: 'tunai' });
    // Eka does NOT pay meeting 2: debt of 15.000 (stays a debt, Eka is not the host)
    await repos.ledger.settleHost(p.id, 2, '2026-02-24', 'tunai');
    await repos.weeks.closeOldest(p.id);
    kas = await repos.ledger.getKasBalances();
    expect(kas.tunai).toBe(790_000 + 45_000 - 50_000);

    // Budi repays part of the old loan: 40.000 of 100.000 (partial repayment allowed; money goes into Tunai)
    await repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-02-24', amount: 40_000, memberId: budi });
    kas = await repos.ledger.getKasBalances();
    expect(kas).toMatchObject({ tunai: 785_000 + 40_000, piutang: 105_000 });
    // Citra cannot repay more than her old 45.000
    await expect(repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 45_001, memberId: citra })).rejects.toMatchObject({ code: 'above_remaining' });

    // Expected kas = actual + outstanding dues (Eka 15.000 through meeting 3) - titipan (0)
    const report = await repos.reports.getKasReport();
    expect(report.balances.actual).toBe(825_000 + 200_000);
    // Arrears through the CURRENT meeting (3, still open): Ani, Budi, Citra, Dedi 15.000 each (meeting 3), Eka 30.000
    // (meetings 2 and 3) = 90.000. Nobody holds Titipan.
    expect(report.expected.outstandingDues).toBe(90_000);
    expect(report.expected.expected).toBe(1_025_000 + 90_000);

    // The phone backup that the owner takes after every closed meeting restores to "same" (nothing lost) and keeps all numbers.
    const bytes = env.liveBytes();
    const prepared = await prepareRestore(env.bridge, env.db, { kind: 'file', bytes });
    expect(prepared.classification.kind).toBe('same');
    expect(prepared.candidate.kas).toEqual(prepared.live.kas);
    const outcome = await commitRestore(env.bridge, env.db, prepared, new FakeSafetyStore(), () => new Date(2026, 2, 10, 10, 0, 0));
    expect(outcome.outcome).toBe('restored');
    expect(await repos.ledger.getKasBalances()).toMatchObject({ tunai: 825_000, debit: 200_000, piutang: 105_000 });
    // After a restore the money loops still work on the restored database (3 meetings left).
    await repos.weeks.assignHost(p.id, 3, citra, '2026-03-03');
    await repos.payments.record({ periodId: p.id, memberId: eka, date: '2026-03-03', amount: 30_000, account: 'tunai' });
    expect((await repos.payments.getWeekStatuses(p.id, eka)).map((s) => s.outstanding).slice(0, 3)).toEqual([0, 0, 0]);
    await checkInvariants(env.db, repos, 'after cutover simulation');
  });

  it('a named old loan needs the member to be in some period: a member outside the period cannot get one (limit to tell the owner)', async () => {
    const { repos } = await setup();
    const [a, b, c] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id, (await repos.members.create('Citra')).id];
    await repos.periods.create({ name: 'P', startDate: START, memberIds: [a, b] });
    await expect(
      repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 30_000, account: 'piutang', memberId: c }),
    ).rejects.toThrow(/not found in any period/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3b. Restore classification: more blind spots than F3 lists
// ---------------------------------------------------------------------------------------------------------------

describe('Restore classification: state that writes no ledger entry or payment (extends F3)', () => {
  async function liveAndBackup() {
    const live = await createSqlJsEnv();
    let n = 0;
    const repos = createRepositories(live.db, { newId: () => `r${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
    const a = (await repos.members.create('Ani')).id;
    const b = (await repos.members.create('Budi')).id;
    await repos.periods.create({ name: 'P1', startDate: START, memberIds: [a, b] });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 100_000, account: 'tunai' });
    const backup = live.liveBytes();
    return { live, repos, a, b, backup };
  }

  async function phraseFor(live: Awaited<ReturnType<typeof createSqlJsEnv>>, backup: Uint8Array) {
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: backup });
    try {
      return requiredPhrase('file', prepared.classification);
    } finally {
      await discardRestore(prepared);
    }
  }

  it('control: nothing changed after the backup gives no PULIHKAN', async () => {
    const { live, backup } = await liveAndBackup();
    expect(await phraseFor(live, backup)).toBeNull();
  });

  it.failing('a member added after the backup is lost by restoring it, but no PULIHKAN is asked', async () => {
    const { live, repos, backup } = await liveAndBackup();
    await repos.members.create('Citra'); // no ledger entry, no payment
    expect(await phraseFor(live, backup)).toBe(PHRASE_RESTORE);
  });

  it.failing('a member renamed after the backup is reverted by the restore without PULIHKAN', async () => {
    const { live, repos, a, backup } = await liveAndBackup();
    await repos.members.rename(a, 'Ani Wulandari');
    expect(await phraseFor(live, backup)).toBe(PHRASE_RESTORE);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3c. Integer money
// ---------------------------------------------------------------------------------------------------------------

describe('Integer money: floats, huge and malformed amounts never reach the ledger', () => {
  it('payments reject floats, NaN, negatives, zero and non multiples; nothing is written', async () => {
    const { repos } = await setup();
    const a = (await repos.members.create('Ani')).id;
    const p = await repos.periods.create({ name: 'P', startDate: START, memberIds: [a, (await repos.members.create('Budi')).id] });
    const before = (await repos.ledger.listKas()).length;
    for (const bad of [15_000.5, 14_999.99999, Number.NaN, Number.POSITIVE_INFINITY, -15_000, 0, 7_500, 15_001, 1e21, 2 ** 53]) {
      await expect(repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: bad, account: 'tunai' })).rejects.toThrow();
    }
    expect((await repos.ledger.listKas()).length).toBe(before);
  });

  it('kas entries reject floats, NaN, negatives and zero', async () => {
    const { repos } = await setup();
    const a = (await repos.members.create('Ani')).id;
    await repos.periods.create({ name: 'P', startDate: START, memberIds: [a] });
    for (const bad of [0.5, 1.5, Number.NaN, -1, 0, 1e300]) {
      await expect(repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: bad, account: 'tunai' })).rejects.toThrow();
      await expect(repos.ledger.recordKas({ kind: 'shared_goal', date: TODAY, amount: bad, account: 'tunai', note: 'x' })).rejects.toThrow();
    }
    expect(await repos.ledger.listKas()).toHaveLength(0);
  });

  it('the largest keypad amount (12 digits) is stored and summed exactly, credit included', async () => {
    const { db, repos } = await setup();
    const [a, b] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id];
    const p = await repos.periods.create({ name: 'P', startDate: START, memberIds: [a, b] });
    const huge = 999_999_990_000; // 66.666.666 x 15.000, 12 digits
    await repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: huge, account: 'debit' });
    expect(await repos.credits.getAvailable(p.id, a)).toBe(huge - 30_000);
    expect((await repos.ledger.getKasBalances()).debit).toBe(huge);
    await checkInvariants(db, repos, 'huge payment');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3d. Correction of a member payment after that member's host payout (behaviour record, owner decision)
// ---------------------------------------------------------------------------------------------------------------

describe('Correcting a payment AFTER the payer was paid out as host', () => {
  it('the host keeps the FULL payout and the re-opened debt is neither offset nor blocked: it stays debt and is written off at close', async () => {
    const { db, repos } = await setup();
    const [a, b] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id];
    const p = await repos.periods.create({ name: 'P', startDate: START, memberIds: [a, b] });
    await repos.weeks.assignHost(p.id, 1, a, START);
    // Ani prepays 60.000 (the whole period: 2 x 30.000 would be 60.000 for N=2), Budi pays 30.000.
    const pay = await repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: 30_000, account: 'tunai' });
    await repos.payments.record({ periodId: p.id, memberId: b, date: TODAY, amount: 30_000, account: 'tunai' });
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai'); // 20.000 payout, no offset (Ani paid up through meeting 1)
    await repos.weeks.closeOldest(p.id);
    // The owner now notices Ani's payment was wrong and corrects it (no warning that Ani is a paid-out host).
    await repos.payments.reverse(pay.payment.id, 'salah orang');
    const ani = await repos.payments.getWeekStatuses(p.id, a);
    expect(ani.map((s) => s.outstanding)).toEqual([15_000, 15_000]);
    // The payout of meeting 1 still stands in full: the 15.000 Ani owed for meeting 1 was NOT offset against it.
    const payout = await repos.ledger.getWeekPayout(p.id, 1);
    expect(payout?.payout.amount).toBe(20_000);
    expect(payout?.offset).toBeNull();
    // Closing the period writes it off: kas absorbs 15.000 (meeting 1) + 15.000 (meeting 2).
    await repos.weeks.assignHost(p.id, 2, b, '2026-02-10');
    await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai');
    await repos.weeks.closeOldest(p.id);
    const preview = await repos.periods.previewClose(p.id);
    expect(preview.writeoffs).toEqual([{ memberId: a, amount: 30_000 }]);
    await checkInvariants(db, repos, 'after correction');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3e. Loans across periods and typing mistakes during the cutover
// ---------------------------------------------------------------------------------------------------------------

describe('Loan reversal after repayments in ANOTHER period (hand numbers)', () => {
  it('loan 50.000 in period 1, 20.000 repaid in period 2: the loan is locked until the repayment is corrected; Piutang follows', async () => {
    const { db, repos } = await setup();
    const [a, b] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id];
    // Period 1 (N=2) run to the end with nobody paying: the hosts' payouts are mostly offset, the rest is written off.
    const p1 = await repos.periods.create({ name: 'P1', startDate: START, memberIds: [a, b] });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 300_000, account: 'tunai' });
    const loan = await repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 50_000, account: 'tunai', memberId: a });
    await repos.weeks.assignHost(p1.id, 1, a, START);
    await repos.ledger.settleHost(p1.id, 1, TODAY, 'tunai'); // Ani owes 15.000 so far: offset 15.000
    await repos.weeks.closeOldest(p1.id);
    await repos.ledger.settleHost(p1.id, 2, TODAY, 'tunai');
    await repos.weeks.closeOldest(p1.id);
    await repos.periods.close(p1.id, TODAY);
    const p2 = await repos.periods.create({ name: 'P2', startDate: '2026-03-03', memberIds: [a, b] });
    // Ani is in the active period: the repayment is booked on P2.
    const repay = await repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 20_000, memberId: a });
    expect(repay.periodId).toBe(p2.id);
    expect((await repos.ledger.getLoanBalance(a)).remaining).toBe(30_000);

    await expect(repos.ledger.reverseEntry(loan.id, 'salah jumlah')).rejects.toThrow(/already repaid 20000/);
    await repos.ledger.reverseEntry(repay.id, 'salah orang'); // a repayment can always be corrected
    expect((await repos.ledger.getLoanBalance(a)).remaining).toBe(50_000);
    await repos.ledger.reverseEntry(loan.id, 'salah jumlah'); // loan of the CLOSED period 1, now allowed
    expect((await repos.ledger.getLoanBalance(a)).remaining).toBe(0);
    expect((await repos.ledger.getKasBalances()).piutang).toBe(0);
    // The loan can be entered again correctly (member is in the active period).
    await repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 35_000, account: 'debit', memberId: a });
    expect((await repos.ledger.getLoanBalance(a)).remaining).toBe(35_000);
    await checkInvariants(db, repos, 'loan across periods');
  });
});

describe('Cutover typing mistakes are fixed by reversal and re-entry, never by editing', () => {
  it('wrong opening balance and an old loan on the wrong member: kas and Piutang end up exactly right, history keeps every step', async () => {
    const { db, repos } = await setup();
    const [a, b] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id];
    await repos.periods.create({ name: 'P1', startDate: START, memberIds: [a, b] });
    const wrongCash = await repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 5_000_000, account: 'tunai' }); // one zero too many
    const wrongLoan = await repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 80_000, account: 'piutang', memberId: b });
    await repos.ledger.reverseEntry(wrongCash.id, 'nol kelebihan');
    await repos.ledger.reverseEntry(wrongLoan.id, 'salah anggota');
    await repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 500_000, account: 'tunai' });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: TODAY, amount: 80_000, account: 'piutang', memberId: a });
    expect(await repos.ledger.getKasBalances()).toEqual({ tunai: 500_000, debit: 0, piutang: 80_000, actual: 500_000 });
    const loans = await repos.ledger.listLoanBalances();
    expect(loans.members.find((m) => m.memberId === a)?.remaining).toBe(80_000);
    expect(loans.members.find((m) => m.memberId === b)?.remaining).toBe(0);
    // Nothing was overwritten: 6 entries (2 wrong, 2 reversals, 2 right).
    expect(await repos.ledger.listKas()).toHaveLength(6);
    // Budi can no longer repay (the wrong loan is gone), Ani can.
    await expect(repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 1_000, memberId: b })).rejects.toMatchObject({ code: 'no_loan' });
    await repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 80_000, memberId: a });
    expect(await repos.ledger.getKasBalances()).toMatchObject({ tunai: 580_000, piutang: 0 });
    await checkInvariants(db, repos, 'cutover typing mistakes');
  });
});
