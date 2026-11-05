// QA scenario: a real paper attendance sheet (19 members, 19 meetings) run through the real repositories on sql.js.
// Members are identified by number only ("Anggota 01"). Nothing here is a fix: it records what the app does.
//
// Sheet reading (CONFIRMED by the owner in the main session):
//  - column headers are the hosts (HOSTS below); the header "20" was a writing mistake, column 17 is member 6;
//  - a repeated letter = the member did NOT pay at that meeting and never paid it double later (variant A).
// Variant B (late payment as a double payment at the next attended meeting) does not match the sheet; it only shows
// that late payment works. Tests run on sql.js, not on the phone / expo-sqlite.
import { weeklyTotalCollected, hostPayoutAmount } from '@/domain/dues';
import { addDays } from '@/domain/schedule';
import { canSwipePay, SWIPE_PAYMENT_AMOUNT } from '@/domain/swipe-pay';
import { createRepositories, type Repositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const N = 19;
const DUE = 15_000;
const START = '2026-01-06'; // a Tuesday
// Host member number per meeting (1-based position). Sheet header 20 = member 6 (confirmed).
const HOSTS = [4, 3, 9, 10, 18, 2, 16, 15, 13, 12, 11, 17, 14, 7, 1, 19, 6, 5, 8];
// Meeting (1-based) -> member numbers whose letter repeats (= absent / did not pay). Corrected table (owner).
const MISSES: Record<number, number[]> = {
  2: [8], 3: [7, 13], 4: [1, 11], 5: [5, 6, 9, 10, 17], 6: [13, 16], 7: [2], 9: [10, 14], 10: [3, 9], 11: [5],
  12: [4, 18], 13: [1, 12], 14: [17], 15: [2, 8], 16: [15], 17: [19], 19: [4, 14],
};
const label = (n: number) => `Anggota ${String(n).padStart(2, '0')}`;
const dateOf = (meeting: number) => addDays(START, 7 * (meeting - 1));
const missed = (meeting: number, member: number) => (MISSES[meeting] ?? []).includes(member);

interface MeetingRow {
  meeting: number;
  host: number;
  date: string;
  paymentsIn: number;
  payout: number;
  offset: number;
  closingTunai: number;
  lowestAfterMeeting: number;
}

interface Run {
  rows: MeetingRow[];
  lowest: number;
  collected: number;
  payouts: number;
  offsets: number;
  writeoffs: Map<number, number>; // member number -> amount
  finalTunai: number;
  finalActual: number;
  expected: number;
  periodStatus: string;
  periodId: string;
  repos: Repositories;
  noSwipeBlocked: string[]; // present members for whom canSwipePay was false at swipe time
  nonMultiplePayments: number;
  negativeCredits: number;
  entriesTunai: number; // Tunai recomputed straight from SQL, independent of the repository balance code
  hostCount: number;
  distinctHosts: number;
}

async function runVariant(variant: 'A' | 'B'): Promise<Run> {
  const db = await createMigratedTestDb();
  let id = 0;
  let clock = '2026-01-06T12:00:00.000Z';
  const repos = createRepositories(db, { newId: () => `id${(id += 1)}`, now: () => clock });
  const memberId = new Map<number, string>();
  for (let n = 1; n <= N; n += 1) memberId.set(n, (await repos.members.create(label(n))).id);
  const mid = (n: number) => memberId.get(n) as string;

  const period = await repos.periods.create({
    name: 'Periode sheet',
    startDate: START,
    memberIds: Array.from({ length: N }, (_, i) => mid(i + 1)),
  });
  await repos.ledger.recordKas({ kind: 'opening_balance', date: START, amount: 0, account: 'tunai' }).catch(() => undefined);

  const rows: MeetingRow[] = [];
  const noSwipeBlocked: string[] = [];
  const pending = new Map<number, number>(); // variant B: missed dues waiting to be paid late
  let lowest = Number.POSITIVE_INFINITY;
  let nonMultiplePayments = 0;
  let negativeCredits = 0;

  for (let m = 1; m <= N; m += 1) {
    clock = `${dateOf(m)}T12:00:00.000Z`;
    // Window rule: only the current and the next meeting can get a host.
    for (const k of [m, m + 1]) {
      if (k > N) continue;
      const week = await repos.weeks.get(period.id, k);
      if (week?.hostMemberId) continue; // e.g. the last meeting is auto-assigned
      await repos.weeks.assignHost(period.id, k, mid(HOSTS[k - 1] as number), dateOf(k));
    }

    const balances = await repos.payments.listBalances(period.id);
    let paymentsIn = 0;
    let rowLow = Number.POSITIVE_INFINITY;
    for (let n = 1; n <= N; n += 1) {
      if (missed(m, n)) {
        if (variant === 'B') pending.set(n, (pending.get(n) ?? 0) + 1);
        continue;
      }
      const arrears = balances.find((b) => b.memberId === mid(n))?.arrears ?? 0;
      const paidToday = (await repos.payments.listMemberIdsPaidOn(period.id, dateOf(m))).includes(mid(n));
      if (!canSwipePay({ arrears, periodActive: true, paidToday })) noSwipeBlocked.push(`m${m}:${label(n)}`);
      const late = variant === 'B' ? (pending.get(n) ?? 0) : 0;
      const amount = SWIPE_PAYMENT_AMOUNT * (1 + late);
      if (amount % DUE !== 0) nonMultiplePayments += 1;
      await repos.payments.record({ periodId: period.id, memberId: mid(n), date: dateOf(m), amount, account: 'tunai' });
      pending.delete(n);
      paymentsIn += amount;
      rowLow = Math.min(rowLow, (await repos.ledger.getKasBalances()).tunai);
    }

    const hostNo = HOSTS[m - 1] as number;
    const settled = await repos.ledger.settleHost(period.id, m, dateOf(m), 'tunai');
    const payout = settled.entries.find((e) => e.type === 'host_payout')?.amount ?? 0;
    const offset = settled.entries.find((e) => e.type === 'host_offset')?.amount ?? 0;
    const afterPayout = (await repos.ledger.getKasBalances()).tunai;
    rowLow = Math.min(rowLow, afterPayout);
    await repos.weeks.closeOldest(period.id);
    for (let n = 1; n <= N; n += 1) if ((await repos.payments.getCredit(period.id, mid(n))) < 0) negativeCredits += 1;
    lowest = Math.min(lowest, rowLow);
    rows.push({ meeting: m, host: hostNo, date: dateOf(m), paymentsIn, payout, offset, closingTunai: afterPayout, lowestAfterMeeting: rowLow });
  }

  clock = `${addDays(dateOf(N), 1)}T12:00:00.000Z`;
  const preview = await repos.periods.previewClose(period.id);
  await repos.periods.close(period.id, addDays(dateOf(N), 1));
  const report = await repos.reports.getKasReport();
  const periodReport = await repos.reports.getPeriodReport(period.id);
  const writeoffs = new Map<number, number>();
  for (const w of preview.writeoffs) {
    for (const [n, mmid] of memberId) if (mmid === w.memberId) writeoffs.set(n, w.amount);
  }
  const weeks = await repos.weeks.listByPeriod(period.id);
  const sqlTunai = await db.getFirst<{ t: number }>(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS t
       FROM ledger_entries WHERE account = 'tunai'`,
  );
  return {
    rows,
    lowest,
    collected: periodReport.summary.collected,
    payouts: periodReport.summary.payouts,
    offsets: periodReport.summary.offsets,
    writeoffs,
    finalTunai: report.balances.tunai,
    finalActual: report.balances.actual,
    expected: report.expected.expected,
    periodStatus: (await repos.periods.getById(period.id))?.status ?? '?',
    periodId: period.id,
    repos,
    noSwipeBlocked,
    nonMultiplePayments,
    negativeCredits,
    entriesTunai: sqlTunai?.t ?? NaN,
    hostCount: weeks.filter((w) => w.hostMemberId !== null).length,
    distinctHosts: new Set(weeks.map((w) => w.hostMemberId)).size,
  };
}

// Hand oracle for variant A: a host's offset = Rp15.000 x misses BEFORE the hosting meeting (never above the cap);
// every other missed due is written off at close.
function oracleA() {
  const offsetBy = new Map<number, number>();
  const writeoffBy = new Map<number, number>();
  for (let n = 1; n <= N; n += 1) {
    const hostMeeting = HOSTS.indexOf(n) + 1;
    let before = 0;
    let after = 0;
    for (let m = 1; m <= N; m += 1) if (missed(m, n)) {
        if (m <= hostMeeting) before += 1;
        else after += 1;
      } // own meeting counts: offset runs through it
    if (before > 0) offsetBy.set(n, Math.min(before * DUE, hostPayoutAmount(N)));
    if (after > 0) writeoffBy.set(n, after * DUE);
  }
  return { offsetBy, writeoffBy };
}

const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('attendance sheet: 19 members x 19 meetings', () => {
  let a: Run;
  let b: Run;
  beforeAll(async () => {
    a = await runVariant('A');
    b = await runVariant('B');
    const table = (r: Run) => r.rows.map((x) => `m${x.meeting} host=${x.host} in=${x.paymentsIn} payout=${x.payout} offset=${x.offset} tunai=${x.closingTunai} low=${x.lowestAfterMeeting}`).join('\n');
    console.log(
      `VARIANT A\n${table(a)}\ncollected=${a.collected} payouts=${a.payouts} offsets=${a.offsets} writeoffs=${JSON.stringify([...a.writeoffs])} ` +
        `tunai=${a.finalTunai} actual=${a.finalActual} expected=${a.expected} status=${a.periodStatus} lowest=${a.lowest} blocked=${a.noSwipeBlocked.length}\n` +
        `VARIANT B\n${table(b)}\ncollected=${b.collected} payouts=${b.payouts} offsets=${b.offsets} writeoffs=${JSON.stringify([...b.writeoffs])} ` +
        `tunai=${b.finalTunai} actual=${b.finalActual} expected=${b.expected} status=${b.periodStatus} lowest=${b.lowest} blocked=${b.noSwipeBlocked.length}`,
    );
  }, 240_000);

  it('sheet input: 29 misses, 19 distinct hosts, no host misses their own meeting, meeting 1 has no miss', () => {
    expect(Object.values(MISSES).flat()).toHaveLength(29);
    expect(new Set(HOSTS).size).toBe(N);
    expect([...HOSTS].sort((x, y) => x - y)).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    HOSTS.forEach((h, i) => expect(missed(i + 1, h)).toBe(false));
    expect(MISSES[1]).toBeUndefined();
  });

  describe('variant A (misses never paid later)', () => {
    it('closes the period with 19 meetings, every member hosted exactly once', () => {
      expect(a.periodStatus).toBe('closed');
      expect(a.hostCount).toBe(N);
      expect(a.distinctHosts).toBe(N);
    });

    it('money in: 332 payments of 15.000, each payout is 190.000', () => {
      expect(a.collected).toBe((N * N - 29) * DUE); // 4.980.000
      expect(a.payouts).toBe(N * hostPayoutAmount(N)); // 3.610.000
      expect(hostPayoutAmount(N)).toBe(190_000);
      expect(weeklyTotalCollected(N)).toBe(285_000);
      expect(a.rows.every((r) => r.payout === 190_000)).toBe(true);
    });

    it('offset and write-off match the hand oracle (misses before hosting offset, misses after written off)', () => {
      const o = oracleA();
      expect(a.offsets).toBe(sum(o.offsetBy));
      expect(Object.fromEntries(a.writeoffs)).toEqual(Object.fromEntries(o.writeoffBy));
      // every missed due is either offset or written off
      expect(a.offsets + sum(a.writeoffs)).toBe(29 * DUE);
    });

    it('kas never goes negative with opening balance 0, and equals the sum of ledger entries', () => {
      expect(a.lowest).toBeGreaterThanOrEqual(0);
      expect(a.finalTunai).toBe(a.collected + a.offsets - a.payouts);
      expect(a.entriesTunai).toBe(a.finalTunai);
    });

    it('expected kas equals actual kas after close (nothing outstanding, no titipan)', () => {
      expect(a.expected).toBe(a.finalActual);
    });

    it('no negative credit, every payment a multiple of 15.000, swipe always allowed for a present member', () => {
      expect(a.negativeCredits).toBe(0);
      expect(a.nonMultiplePayments).toBe(0);
      expect(a.noSwipeBlocked).toEqual([]);
    });
  });

  describe('variant B (each miss paid late as a double payment)', () => {
    it('closes; only the misses on the last meeting (no later meeting to pay at) are written off', () => {
      expect(b.periodStatus).toBe('closed');
      expect(Object.fromEntries(b.writeoffs)).toEqual({ 4: DUE, 14: DUE });
      expect(b.offsets).toBe(0); // every miss before a member hosts is paid late before the payout
      expect(b.collected).toBe((N * N - 2) * DUE);
      expect(b.payouts).toBe(3_610_000);
    });

    it('kas stays non-negative, equals ledger entries, no negative credit, multiples only', () => {
      expect(b.lowest).toBeGreaterThanOrEqual(0);
      expect(b.entriesTunai).toBe(b.finalTunai);
      expect(b.finalTunai).toBe(b.collected + b.offsets - b.payouts);
      expect(b.negativeCredits).toBe(0);
      expect(b.nonMultiplePayments).toBe(0);
      expect(b.expected).toBe(b.finalActual);
    });

    it('a swipe (15.000) only pays one meeting: a double payment needs the full form', () => {
      // 30.000 is two swipes' worth; swipe amount itself is fixed at one due.
      expect(SWIPE_PAYMENT_AMOUNT).toBe(DUE);
    });
  });

  describe('who paid TODAY (Pembayaran list marker and swipe lock)', () => {
    it('a member with old arrears keeps the arrears but is marked paid today, and a second swipe is rejected', async () => {
      const db = await createMigratedTestDb();
      let id = 0;
      let clock = `${dateOf(2)}T12:00:00.000Z`;
      const repos = createRepositories(db, { newId: () => `x${(id += 1)}`, now: () => clock });
      const ids: string[] = [];
      for (let n = 1; n <= 3; n += 1) ids.push((await repos.members.create(label(n))).id);
      const p = await repos.periods.create({ name: 'p', startDate: START, memberIds: ids });
      await repos.weeks.assignHost(p.id, 1, ids[0] as string, dateOf(1));
      await repos.weeks.assignHost(p.id, 2, ids[1] as string, dateOf(2));
      // Meeting 1: member 3 absent (nothing recorded). Meeting 1 closed, now meeting 2 (today).
      await repos.payments.record({ periodId: p.id, memberId: ids[0] as string, date: dateOf(1), amount: DUE, account: 'tunai' });
      await repos.payments.record({ periodId: p.id, memberId: ids[1] as string, date: dateOf(1), amount: DUE, account: 'tunai' });
      await repos.ledger.settleHost(p.id, 1, dateOf(1), 'tunai');
      await repos.weeks.closeOldest(p.id);
      clock = `${dateOf(2)}T12:00:00.000Z`;

      const target = ids[2] as string;
      const arrearsOf = async () => (await repos.payments.listBalances(p.id)).find((x) => x.memberId === target)?.arrears ?? -1;
      const paidToday = async () => (await repos.payments.listMemberIdsPaidOn(p.id, dateOf(2))).includes(target);
      const swipeAllowed = async () => canSwipePay({ arrears: await arrearsOf(), periodActive: true, paidToday: await paidToday() });
      expect(await arrearsOf()).toBe(2 * DUE); // meeting 1 + meeting 2 due
      expect(await swipeAllowed()).toBe(true);
      await repos.payments.record({ periodId: p.id, memberId: target, date: dateOf(2), amount: SWIPE_PAYMENT_AMOUNT, account: 'tunai' });
      expect(await arrearsOf()).toBe(DUE); // the old arrears are still shown...
      expect(await paidToday()).toBe(true); // ...next to the "paid today" marker
      expect(await swipeAllowed()).toBe(false); // second swipe on the same day is rejected
      const payments = await repos.payments.listByMember(p.id, target);
      expect(payments.map((x) => x.date)).toEqual([dateOf(2)]);
    });
  });
});
