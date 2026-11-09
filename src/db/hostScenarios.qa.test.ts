// QA scenario (independent): "pay several meetings at once, then become host" and "host with arrears".
// N = 5 -> due per meeting 75.000, payout 50.000, kas +25.000. Every expected number below was computed BY HAND from the
// CLAUDE.md rules, NOT copied from app output. The same story is the owner's phone script (check 3).
// Tests run on sql.js, not on the phone. Nothing here changes app code.
import { summarizeMonth } from '@/domain/flow';
import { addDays } from '@/domain/schedule';
import { createRepositories, type Repositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const START = '2026-02-03'; // a Tuesday
const TODAY = '2026-03-10';
const MONTH = '2026-03';
const meetingDate = (k: number) => addDays(START, 7 * (k - 1));

interface Env {
  repos: Repositories;
  periodId: string;
  ids: Record<'ani' | 'budi' | 'citra' | 'dedi' | 'eka', string>;
}

async function setup(): Promise<Env> {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ids = {
    ani: (await repos.members.create('Ani')).id,
    budi: (await repos.members.create('Budi')).id,
    citra: (await repos.members.create('Citra')).id,
    dedi: (await repos.members.create('Dedi')).id,
    eka: (await repos.members.create('Eka')).id,
  };
  const period = await repos.periods.create({ name: 'QA Satu', startDate: START, memberIds: Object.values(ids) });
  return { repos, periodId: period.id, ids };
}

const pay = (e: Env, who: keyof Env['ids'], amount: number) =>
  e.repos.payments.record({ periodId: e.periodId, memberId: e.ids[who], date: TODAY, amount, account: 'tunai' });

async function host(e: Env, k: number, who: keyof Env['ids']) {
  const w = await e.repos.weeks.get(e.periodId, k);
  if (w?.hostMemberId) return;
  await e.repos.weeks.assignHost(e.periodId, k, e.ids[who], meetingDate(k));
}

const tunai = async (e: Env) => (await e.repos.ledger.getKasBalances()).tunai;
const statusOf = async (e: Env, who: keyof Env['ids']) => e.repos.payments.getWeekStatuses(e.periodId, e.ids[who]);
const outstanding = async (e: Env, who: keyof Env['ids']) => (await statusOf(e, who)).map((s) => s.outstanding);

async function month(e: Env) {
  return summarizeMonth(await e.repos.ledger.listKas(), MONTH);
}

describe('Scenario 1: pay several meetings at once, then host (N=5)', () => {
  let e: Env;
  beforeAll(async () => {
    e = await setup();
  });

  it('lump sums go to the OLDEST weeks first, one ledger entry per payment with week NULL', async () => {
    await host(e, 1, 'ani');
    await host(e, 2, 'budi');
    await pay(e, 'ani', 15_000);
    const budi = await pay(e, 'budi', 45_000);
    await pay(e, 'citra', 15_000);
    expect(budi.allocations.map((a) => [a.week, a.amount])).toEqual([[1, 15_000], [2, 15_000], [3, 15_000]]);
    expect(budi.credit).toBe(0);
    expect(await outstanding(e, 'budi')).toEqual([0, 0, 0, 15_000, 15_000]);
    const entries = (await e.repos.ledger.listByMember(e.periodId, e.ids.budi)).filter((x) => x.type === 'member_payment');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount).toBe(45_000);
    expect(entries[0]?.week).toBeNull();
  });

  it('a payment beyond the period total: oldest first, the excess is Titipan, the form preview warns first', async () => {
    const preview = await e.repos.payments.preview({ periodId: e.periodId, memberId: e.ids.dedi, date: TODAY, amount: 75_000 });
    expect(preview.creditAmount).toBe(0);
    const d1 = await pay(e, 'dedi', 75_000);
    expect(d1.allocations.map((a) => a.week)).toEqual([1, 2, 3, 4, 5]);
    const warn = await e.repos.payments.preview({ periodId: e.periodId, memberId: e.ids.dedi, date: TODAY, amount: 15_000 });
    expect(warn.creditAmount).toBe(15_000); // all of it becomes credit, and the preview knows BEFORE saving
    const d2 = await pay(e, 'dedi', 15_000);
    expect(d2.allocations).toEqual([]);
    expect(d2.credit).toBe(15_000);
    expect(await e.repos.payments.getCredit(e.periodId, e.ids.dedi)).toBe(15_000);
    // the whole 90.000 is cash received: Tunai = 15+45+15+75+15 = 165.000
    expect(await tunai(e)).toBe(165_000);
  });

  it('host Ani paid out: payout is ONE entry of 50.000, no offset entry (Ani has no debt)', async () => {
    const r = await e.repos.ledger.settleHost(e.periodId, 1, TODAY, 'tunai');
    expect(r.entries.map((x) => [x.type, x.direction, x.amount, x.week])).toEqual([['host_payout', 'out', 50_000, 1]]);
    expect(await tunai(e)).toBe(115_000);
    await e.repos.weeks.closeOldest(e.periodId);
  });

  it('host Budi (paid weeks 1-3 in one lump): no offset', async () => {
    await pay(e, 'ani', 15_000);
    const r = await e.repos.ledger.settleHost(e.periodId, 2, TODAY, 'tunai');
    expect(r.entries.map((x) => x.type)).toEqual(['host_payout']);
    expect(await tunai(e)).toBe(80_000);
    await e.repos.weeks.closeOldest(e.periodId);
  });

  it('host Citra (paid only week 1): payout and offset are TWO entries; offset covers weeks 2-3 only, not 4-5', async () => {
    await host(e, 3, 'citra');
    await pay(e, 'ani', 15_000);
    const preview = await e.repos.ledger.previewHostPayout(e.periodId, 3, TODAY, 'tunai');
    expect(preview.payout).toBe(50_000);
    expect(preview.offset).toBe(30_000);
    expect(preview.netCash).toBe(20_000);
    expect(preview.remainingDebt).toBe(0);
    const r = await e.repos.ledger.settleHost(e.periodId, 3, TODAY, 'tunai');
    expect(r.entries.map((x) => [x.type, x.direction, x.amount, x.week, x.account])).toEqual([
      ['host_payout', 'out', 50_000, 3, 'tunai'],
      ['host_offset', 'in', 30_000, 3, 'tunai'],
    ]);
    expect(r.settlement.offsetWeeks).toEqual([{ week: 2, amount: 15_000 }, { week: 3, amount: 15_000 }]);
    // weeks 4 and 5 of Citra are NOT touched
    expect(await outstanding(e, 'citra')).toEqual([0, 0, 0, 15_000, 15_000]);
    expect(await tunai(e)).toBe(75_000);
    await e.repos.weeks.closeOldest(e.periodId);
  });

  it('checkpoint A (after meeting 3): Tunai, month summary, Laporan and Titipan agree with the hand numbers', async () => {
    // Beranda "Bulan ini" and Riwayat use the same summarizeMonth: payments 195.000 + offset 30.000 in, payouts 150.000 out.
    expect(await month(e)).toEqual({ moneyIn: 225_000, moneyOut: 150_000 });
    const report = await e.repos.reports.getPeriodReport(e.periodId);
    expect(report.summary).toMatchObject({ totalDues: 375_000, collected: 195_000, payouts: 150_000, offsets: 30_000, netKasChange: 75_000 });
    const m = await month(e);
    expect(m.moneyIn - m.moneyOut).toBe(report.summary.netKasChange); // Riwayat net == Laporan net
    expect(report.summary.netKasChange).toBe(await tunai(e)); // opening balance was 0
    const kas = await e.repos.reports.getKasReport();
    expect(kas.balances.actual).toBe(75_000);
    expect(kas.expected.creditHeld).toBe(15_000); // Dedi
    expect(kas.expected.outstandingDues).toBe(105_000); // week 4 for Ani, Budi, Citra (3 x 15.000) + Eka weeks 1-4 (60.000)
    expect(kas.expected.expected).toBe(75_000 + 105_000 - 15_000);
    expect(kas.expected.prepaidDues).toBe(15_000); // Dedi's week 5
    // The sum of the member lines equals the card total
    const arrearsSum = (await e.repos.payments.listBalances(e.periodId)).reduce((t, b) => t + b.arrears, 0);
    expect(arrearsSum).toBe(105_000);
  });

  it('meeting detail: meeting 3 = 60.000 by payments + 15.000 by offset, Eka 15.000 unpaid; meeting 1/2 as expected', async () => {
    const m3 = await e.repos.reports.getMeetingReport(e.periodId, 3);
    expect(m3).toMatchObject({ totalDues: 75_000, coveredByPayments: 45_000, coveredByOffset: 15_000, coveredByTitipan: 0, unpaid: 15_000, hostPayout: 50_000, hostOffset: 30_000, fullyCovered: false, kasContribution: null });
    // payments on week 3: Ani 15 + Budi 15 (lump) + Dedi 15 (lump) = 45.000; Citra offset 15; Eka unpaid 15
    const m2 = await e.repos.reports.getMeetingReport(e.periodId, 2);
    expect(m2).toMatchObject({ coveredByPayments: 45_000, coveredByOffset: 15_000, unpaid: 15_000, hostPayout: 50_000, hostOffset: 0 }); // hostOffset = offset of THIS meeting's host (Budi: none); Citra's offset sits on meeting 3
    const m1 = await e.repos.reports.getMeetingReport(e.periodId, 1);
    expect(m1).toMatchObject({ coveredByPayments: 60_000, coveredByOffset: 0, unpaid: 15_000, hostOffset: 0 });
    // every meeting row adds up to the total (invariant), and Laporan "offset" per meeting only shows the offset in force
    for (const m of [m1, m2, m3]) expect(m.coveredByPayments + m.coveredByOffset + m.coveredByTitipan + m.unpaid).toBe(75_000);
  });
});

describe('Scenario 2: host in arrears (cap, late payment, corrected payout, close with Titipan netting)', () => {
  let e: Env;
  let d1PaymentId = '';
  beforeAll(async () => {
    // Re-run scenario 1 up to the end of meeting 3 (same hand numbers as above).
    e = await setup();
    await host(e, 1, 'ani');
    await host(e, 2, 'budi');
    await pay(e, 'ani', 15_000);
    await pay(e, 'budi', 45_000);
    await pay(e, 'citra', 15_000);
    d1PaymentId = (await pay(e, 'dedi', 75_000)).payment.id;
    await pay(e, 'dedi', 15_000);
    await e.repos.ledger.settleHost(e.periodId, 1, TODAY, 'tunai');
    await e.repos.weeks.closeOldest(e.periodId);
    await pay(e, 'ani', 15_000);
    await e.repos.ledger.settleHost(e.periodId, 2, TODAY, 'tunai');
    await e.repos.weeks.closeOldest(e.periodId);
    await host(e, 3, 'citra');
    await pay(e, 'ani', 15_000);
    await e.repos.ledger.settleHost(e.periodId, 3, TODAY, 'tunai');
    await e.repos.weeks.closeOldest(e.periodId);
  });

  it('meeting 4, host Eka with 60.000 arrears > payout 50.000: offset capped at 50.000, 10.000 stays debt', async () => {
    await host(e, 4, 'eka');
    await pay(e, 'ani', 15_000);
    const preview = await e.repos.ledger.previewHostPayout(e.periodId, 4, TODAY, 'tunai');
    expect(preview).toMatchObject({ payout: 50_000, offset: 50_000, netCash: 0, remainingDebt: 10_000 });
    const r = await e.repos.ledger.settleHost(e.periodId, 4, TODAY, 'tunai');
    expect(r.entries.map((x) => [x.type, x.amount])).toEqual([['host_payout', 50_000], ['host_offset', 50_000]]);
    expect(r.settlement.offsetWeeks).toEqual([{ week: 1, amount: 15_000 }, { week: 2, amount: 15_000 }, { week: 3, amount: 15_000 }, { week: 4, amount: 5_000 }]);
    expect(await outstanding(e, 'eka')).toEqual([0, 0, 0, 10_000, 15_000]);
    expect(await tunai(e)).toBe(90_000);
    await e.repos.weeks.closeOldest(e.periodId);
  });

  it('late payment by the indebted host: 15.000 settles the 10.000 remainder of week 4 first, then 5.000 of week 5', async () => {
    const preview = await e.repos.payments.preview({ periodId: e.periodId, memberId: e.ids.eka, date: TODAY, amount: 15_000 });
    expect(preview.allocations.map((a) => [a.week, a.amount])).toEqual([[4, 10_000], [5, 5_000]]);
    const r = await pay(e, 'eka', 15_000);
    expect(r.allocations.map((a) => [a.week, a.amount])).toEqual([[4, 10_000], [5, 5_000]]);
    expect(r.credit).toBe(0);
    expect(await outstanding(e, 'eka')).toEqual([0, 0, 0, 0, 10_000]);
    expect(await tunai(e)).toBe(105_000);
  });

  it('a payment that is not a multiple of 15.000 is rejected even for a debt of 10.000 (rule: no partial payments)', async () => {
    await expect(pay(e, 'eka', 10_000)).rejects.toThrow();
    await expect(pay(e, 'eka', 7_500)).rejects.toThrow();
    expect(await tunai(e)).toBe(105_000);
  });

  it('meeting 5, host Dedi: after correcting Dedi\'s 75.000 payment his arrears (75.000) are offset up to the cap; Titipan 15.000 stays', async () => {
    await host(e, 5, 'dedi');
    await e.repos.payments.reverse(d1PaymentId, 'salah catat');
    expect(await tunai(e)).toBe(30_000);
    expect(await e.repos.payments.getCredit(e.periodId, e.ids.dedi)).toBe(15_000);
    expect(await outstanding(e, 'dedi')).toEqual([15_000, 15_000, 15_000, 15_000, 15_000]);
    await pay(e, 'ani', 15_000);
    const r = await e.repos.ledger.settleHost(e.periodId, 5, TODAY, 'tunai');
    expect(r.entries.map((x) => [x.type, x.amount])).toEqual([['host_payout', 50_000], ['host_offset', 50_000]]);
    expect(r.settlement.remainingDebt).toBe(25_000);
    expect(await outstanding(e, 'dedi')).toEqual([0, 0, 0, 10_000, 15_000]);
    expect(await tunai(e)).toBe(45_000);
    await e.repos.weeks.closeOldest(e.periodId);
  });

  it('correcting the payout of meeting 4 reverses payout AND offset; the period cannot be closed until it is paid again', async () => {
    const rev = await e.repos.ledger.reverseHostPayout(e.periodId, 4, 'salah tanggal');
    expect(rev).toHaveLength(2);
    expect(await tunai(e)).toBe(45_000); // out 50.000 reversed and in 50.000 reversed: no net change
    expect(await outstanding(e, 'eka')).toEqual([15_000, 15_000, 15_000, 5_000, 10_000]);
    const preview = await e.repos.periods.previewClose(e.periodId);
    expect(preview.canClose).toBe(false);
    expect(preview.unpaidHostWeeks).toEqual([4]);
    await expect(e.repos.periods.close(e.periodId, TODAY)).rejects.toThrow(/payout/);
    // Laporan: meeting 4 shows no payout until it is paid again; month summary leaves the corrected pair out
    expect((await e.repos.reports.getMeetingReport(e.periodId, 4)).hostPayout).toBeNull();
    const kas = await e.repos.reports.getKasReport();
    expect(kas.expected.unpaidPayoutCount).toBe(1);
    expect(kas.expected.unpaidPayoutAmount).toBe(50_000);
  });

  it('paying meeting 4 again offsets through the CURRENT meeting (the last one): 50.000 capped, 10.000 stays (week 5)', async () => {
    const r = await e.repos.ledger.settleHost(e.periodId, 4, TODAY, 'tunai');
    expect(r.entries.map((x) => [x.type, x.amount])).toEqual([['host_payout', 50_000], ['host_offset', 50_000]]);
    expect(r.settlement.offsetWeeks).toEqual([{ week: 1, amount: 15_000 }, { week: 2, amount: 15_000 }, { week: 3, amount: 15_000 }, { week: 4, amount: 5_000 }]);
    expect(await outstanding(e, 'eka')).toEqual([0, 0, 0, 0, 10_000]);
    expect(await tunai(e)).toBe(45_000);
    // a second payout for the same week is refused
    await expect(e.repos.ledger.settleHost(e.periodId, 4, TODAY, 'tunai')).rejects.toThrow(/already/);
  });

  it('close preview: Dedi\'s own Titipan (15.000) settles his arrears (25.000) first, write-off 10.000; others in full', async () => {
    const p = await e.repos.periods.previewClose(e.periodId);
    expect(p.canClose).toBe(true);
    const by = (who: keyof Env['ids']) => p.members.find((m) => m.memberId === e.ids[who]);
    expect(by('dedi')).toMatchObject({ arrearsBefore: 25_000, credit: 15_000, settledByCredit: 15_000, writeoff: 10_000, creditLeft: 0 });
    expect(by('dedi')?.settlements).toEqual([{ week: 4, amount: 10_000 }, { week: 5, amount: 5_000 }]); // oldest first
    expect(by('budi')).toMatchObject({ arrearsBefore: 30_000, writeoff: 30_000 });
    expect(by('citra')).toMatchObject({ arrearsBefore: 30_000, writeoff: 30_000 });
    expect(by('eka')).toMatchObject({ arrearsBefore: 10_000, writeoff: 10_000 });
    expect(by('ani')).toMatchObject({ arrearsBefore: 0, writeoff: 0 });
    expect(p).toMatchObject({ totalArrears: 95_000, totalSettledByCredit: 15_000, totalWriteoff: 80_000 });
  });

  it('closing: one write-off entry per member, no kas change, Titipan gone, expected kas == actual kas, reports agree', async () => {
    const before = await tunai(e);
    await e.repos.periods.close(e.periodId, TODAY);
    expect(await tunai(e)).toBe(before);
    const writeoffs = (await e.repos.ledger.listByPeriod(e.periodId)).filter((x) => x.type === 'debt_writeoff');
    expect(writeoffs).toHaveLength(4);
    expect(writeoffs.map((w) => w.amount).sort((a, b) => a - b)).toEqual([10_000, 10_000, 30_000, 30_000]);
    expect(await e.repos.payments.getCredit(e.periodId, e.ids.dedi)).toBe(0);

    const report = await e.repos.reports.getPeriodReport(e.periodId);
    expect(report.summary).toMatchObject({ totalDues: 375_000, collected: 165_000, payouts: 250_000, offsets: 130_000, writeoffs: 80_000, netKasChange: 45_000 });
    // dues identity: payments allocated + offsets + settled-by-credit + write-offs = total dues
    expect(165_000 - 15_000 + 130_000 + 15_000 + 80_000).toBe(report.summary.totalDues);
    const m = await month(e);
    expect(m).toEqual({ moneyIn: 295_000, moneyOut: 250_000 }); // corrected Dedi payment and the first P4 pair are left out
    expect(m.moneyIn - m.moneyOut).toBe(report.summary.netKasChange);
    const kas = await e.repos.reports.getKasReport();
    expect(kas.balances).toMatchObject({ tunai: 45_000, debit: 0, piutang: 0, actual: 45_000 });
    expect(kas.expected.expected).toBe(45_000);
    expect(kas.expected.creditHeld).toBe(0);
    expect(kas.expected.outstandingDues).toBe(0);
    // meeting rows still add up after close
    for (const mt of report.meetings) expect(mt.coveredByPayments + mt.coveredByOffset + mt.coveredByTitipan + mt.unpaid).toBe(75_000);
    // Dedi's Titipan now shows as "used" in his history, not as held
    const hist = await e.repos.reports.getMemberHistory(e.periodId, e.ids.dedi);
    expect(hist.totals.titipanUsed).toBe(15_000);
    expect(hist.totals.outstanding).toBe(10_000);
  });

  it('closed period: no payments, no payout, no second close', async () => {
    await expect(pay(e, 'ani', 15_000)).rejects.toThrow();
    await expect(e.repos.periods.close(e.periodId, TODAY)).rejects.toThrow(/already closed/);
  });
});

describe('Host edge cases around the cap and the multiple rule', () => {
  it('arrears below the payout (3 unpaid weeks = 45.000): offset equals the arrears, net cash 5.000', async () => {
    // N=5, payout 50.000 is not a multiple of 15.000, so arrears of exactly 50.000 cannot occur from whole weeks;
    // the closest cases are 45.000 (3 weeks, below) and 60.000 (4 weeks, above the cap). Check both.
    const e = await setup();
    await host(e, 1, 'ani');
    await host(e, 2, 'budi');
    await e.repos.ledger.settleHost(e.periodId, 1, TODAY, 'tunai').catch(() => undefined);
    await e.repos.weeks.closeOldest(e.periodId).catch(() => undefined);
    await e.repos.ledger.settleHost(e.periodId, 2, TODAY, 'tunai').catch(() => undefined);
    await e.repos.weeks.closeOldest(e.periodId).catch(() => undefined);
    await host(e, 3, 'citra');
    // Citra pays nothing: arrears through meeting 3 = 45.000 (< 50.000)
    const p3 = await e.repos.ledger.previewHostPayout(e.periodId, 3, TODAY, 'tunai');
    expect(p3).toMatchObject({ payout: 50_000, offset: 45_000, netCash: 5_000, remainingDebt: 0 });
  });

  it('the host who prepaid the whole period gets a clean payout, and one more payment becomes Titipan with the exact amount', async () => {
    const e = await setup();
    await host(e, 1, 'ani');
    const r = await pay(e, 'ani', 90_000); // 5 meetings + 1 extra
    expect(r.allocations).toHaveLength(5);
    expect(r.credit).toBe(15_000);
    const s = await e.repos.ledger.settleHost(e.periodId, 1, TODAY, 'tunai');
    expect(s.entries).toHaveLength(1);
  });

  it('future payment / payout dates are refused by the repository', async () => {
    const e = await setup();
    await host(e, 1, 'ani');
    await expect(e.repos.payments.record({ periodId: e.periodId, memberId: e.ids.ani, date: '2026-03-11', amount: 15_000, account: 'tunai' })).rejects.toThrow(/future/);
    await expect(e.repos.ledger.settleHost(e.periodId, 1, '2026-03-11', 'tunai')).rejects.toThrow(/future/);
  });
});

describe('Kas growth and Titipan carry-over (hand numbers)', () => {
  it('a meeting where all 5 members pay: Tunai grows by exactly 5.000 x N = 25.000, Laporan shows the contribution', async () => {
    const e = await setup();
    await host(e, 1, 'ani');
    for (const who of ['ani', 'budi', 'citra', 'dedi', 'eka'] as const) await pay(e, who, 15_000);
    expect(await tunai(e)).toBe(75_000);
    await e.repos.ledger.settleHost(e.periodId, 1, TODAY, 'tunai');
    expect(await tunai(e)).toBe(25_000);
    const m1 = await e.repos.reports.getMeetingReport(e.periodId, 1);
    expect(m1).toMatchObject({ fullyCovered: true, kasContribution: 25_000, unpaid: 0 });
  });

  it('non-multiple Titipan (10.000) is carried into the next period, settles 10.000 of week 1, expected kas follows the formula at each step', async () => {
    const db = await createMigratedTestDb();
    let n = 0;
    const repos = createRepositories(db, { newId: () => `c${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
    const a = (await repos.members.create('Ani')).id;
    const b = (await repos.members.create('Budi')).id;
    const c = (await repos.members.create('Citra')).id;
    // Period 1 with Ani alone (N=1): payout 10.000, arrears 15.000 -> offset 10.000 (cap), debt 5.000; Ani pays 15.000: 5.000 + 10.000 Titipan.
    const p1 = await repos.periods.create({ name: 'Satu', startDate: '2026-01-06', memberIds: [a] });
    await repos.ledger.settleHost(p1.id, 1, TODAY, 'tunai');
    const r = await repos.payments.record({ periodId: p1.id, memberId: a, date: TODAY, amount: 15_000, account: 'tunai' });
    expect(r.credit).toBe(10_000);
    await repos.weeks.closeOldest(p1.id);
    await repos.periods.close(p1.id, TODAY);
    let kas = await repos.reports.getKasReport();
    expect(kas.balances.actual).toBe(15_000); // -10.000 payout +10.000 offset +15.000 payment
    expect(kas.expected).toMatchObject({ creditHeld: 10_000, outstandingDues: 0, expected: 5_000 });
    // Period 2: the preview and the result agree; week 1 of Ani is settled by 10.000 of Titipan, 5.000 outstanding.
    const preview = await repos.periods.previewCarryOver([a, b, c]);
    expect(preview.find((x) => x.memberId === a)?.plan.applications).toEqual([{ fromPeriodId: p1.id, week: 1, amount: 10_000 }]);
    const p2 = await repos.periods.create({ name: 'Dua', startDate: '2026-03-03', memberIds: [a, b, c] });
    const ani = await repos.payments.getWeekStatuses(p2.id, a);
    expect(ani[0]).toMatchObject({ credited: 10_000, outstanding: 5_000 });
    kas = await repos.reports.getKasReport();
    // actual 15.000 + outstanding (Ani 5.000 + Budi 15.000 + Citra 15.000 = 35.000) - Titipan carried into an OPEN meeting 10.000
    expect(kas.expected).toMatchObject({ outstandingDues: 35_000, creditHeld: 10_000, expected: 40_000 });
    expect(await repos.credits.getAvailable(p1.id, a)).toBe(0); // the source credit is used up, not double counted
    // Ani pays 15.000: 5.000 finishes week 1, 10.000 goes to week 2 (oldest first, no new Titipan)
    const pay2 = await repos.payments.record({ periodId: p2.id, memberId: a, date: TODAY, amount: 15_000, account: 'tunai' });
    expect(pay2.allocations.map((x) => [x.week, x.amount])).toEqual([[1, 5_000], [2, 10_000]]);
    expect(pay2.credit).toBe(0);
  });
});
