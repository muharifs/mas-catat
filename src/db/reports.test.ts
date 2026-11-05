// M6 repository tests: the read-only reports repo on seeded data (pay, carry credit into a new period, close a
// meeting). Tests run on sql.js, so they prove the SQL and the wiring, not the expo-sqlite adapter on the phone.
import { computeKasBalances } from '@/domain/kas';
import { createRepositories, type Repositories } from './index';
import type { Db } from './db';
import { markHostsPaid } from './testing/hostPayouts';
import { createMigratedTestDb } from './testing/sqlJsDriver';

interface Fixture {
  db: Db;
  repos: Repositories;
  periodId: string;
  ids: string[];
}

async function scheduleHosts(db: Db, periodId: string, memberIds: readonly string[]): Promise<void> {
  for (let i = 0; i < memberIds.length; i += 1) {
    await db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [memberIds[i] as string, periodId, i + 1]);
  }
}

/** Clock at 2026-12-31. Three members A, B, C; member i hosts meeting i+1 (full schedule written into the table). */
async function setup(memberCount = 3): Promise<Fixture> {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
  const ids: string[] = [];
  for (const name of ['A', 'B', 'C', 'D', 'E'].slice(0, memberCount)) ids.push((await repos.members.create(name)).id);
  const period = await repos.periods.create({ name: 'Periode 1', startDate: '2026-01-06', memberIds: ids });
  await scheduleHosts(db, period.id, ids);
  return { db, repos, periodId: period.id, ids };
}

const pay = (f: Fixture, i: number, amount: number, date = '2026-01-06') => ({
  periodId: f.periodId,
  memberId: f.ids[i] as string,
  date,
  amount,
  account: 'tunai' as const,
});

describe('reports: kas report', () => {
  it('equals computeKasBalances over the whole ledger and is zero-based on an empty database', async () => {
    const db = await createMigratedTestDb();
    const repos = createRepositories(db);
    const empty = await repos.reports.getKasReport();
    expect(empty.balances).toEqual({ tunai: 0, debit: 0, piutang: 0, actual: 0 });
    expect(empty.expected).toMatchObject({ actualKas: 0, outstandingDues: 0, creditHeld: 0, expected: 0, unpaidPayoutCount: 0 });
  });

  it('follows pay, carry credit into a new period, close a meeting', async () => {
    const f = await setup();
    const { repos, db } = f;
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 100_000, account: 'tunai' });
    await repos.payments.record(pay(f, 0, 60_000)); // A: three meetings (45.000) + 15.000 titipan
    await repos.payments.record(pay(f, 1, 15_000)); // B: meeting 1 only; C pays nothing

    // 1. Active period 1, current meeting 1. Actual 175.000; arrears: C owes meeting 1 = 15.000; A holds 15.000.
    let r = await repos.reports.getKasReport();
    expect(r.balances).toEqual(await repos.ledger.getKasBalances());
    expect(r.balances.actual).toBe(175_000);
    expect(r.balances.actual).toBe(computeKasBalances(await repos.ledger.listKas()).actual);
    const arrears = await repos.payments.getArrearsSummary(f.periodId);
    expect(r.expected.outstandingDues).toBe(arrears.totalArrears); // matches Home
    expect(r.expected).toMatchObject({
      outstandingDues: 15_000,
      creditAvailable: 15_000,
      creditCarriedOpen: 0,
      creditHeld: 15_000,
      expected: 175_000 + 15_000 - 15_000,
      prepaidDues: 30_000, // A paid meetings 2 and 3 ahead of the current meeting
      unpaidPayoutCount: 0,
    });

    // 2. Close all meetings, pay hosts (no pos, balances untouched) and end the period. Debt is written off, so it
    //    stops counting; A's titipan stays available.
    for (let i = 0; i < 3; i += 1) await repos.weeks.closeOldest(f.periodId);
    r = await repos.reports.getKasReport();
    expect(r.expected.unpaidPayoutCount).toBe(3); // closed meetings, no payout yet
    expect(r.expected.unpaidPayoutAmount).toBe(90_000);
    expect(r.expected.outstandingDues).toBe(30_000 + 45_000 - 0); // B: meetings 2-3, C: meetings 1-3 (before close)
    await markHostsPaid(repos, f.periodId);
    await repos.periods.close(f.periodId, '2026-12-30');
    r = await repos.reports.getKasReport();
    expect(r.expected.unpaidPayoutCount).toBe(0);
    expect(r.expected.outstandingDues).toBe(0); // written off
    expect(r.expected.creditAvailable).toBe(15_000);
    expect(r.expected.expected).toBe(175_000 - 15_000);

    // 3. New period 2 carries A's titipan into meeting 1: it moves from "available" to "carried on an open meeting".
    const p2 = await repos.periods.create({ name: 'Periode 2', startDate: '2027-01-05', memberIds: [...f.ids] });
    await scheduleHosts(db, p2.id, f.ids);
    r = await repos.reports.getKasReport();
    expect(r.balances.actual).toBe(175_000); // carry-over writes no ledger entry
    expect(r.expected).toMatchObject({ creditAvailable: 0, creditCarriedOpen: 15_000, creditHeld: 15_000 });
    expect(r.expected.outstandingDues).toBe(30_000); // B and C owe meeting 1 of period 2; A is covered
    expect(r.expected.outstandingDues).toBe((await repos.payments.getArrearsSummary(p2.id)).totalArrears);
    expect(r.expected.expected).toBe(175_000 + 30_000 - 15_000);

    // 4. Closing meeting 1 of period 2 releases the carried titipan from the line.
    await repos.weeks.closeOldest(p2.id);
    r = await repos.reports.getKasReport();
    expect(r.expected).toMatchObject({ creditAvailable: 0, creditCarriedOpen: 0, creditHeld: 0 });
    expect(r.expected.outstandingDues).toBe(75_000); // current meeting is now 2: B and C owe 2 x 15.000, A owes meeting 2
    expect(r.expected.expected).toBe(175_000 + 75_000);
  });

  it('counts a titipan of 5.000 (not a multiple of 15.000) as credit held', async () => {
    // 5 members: payout 50.000. Host A owes 75.000 through meeting 5, the offset is capped at 50.000, so 25.000 stays.
    const f = await setup(5);
    const { repos } = f;
    for (let i = 0; i < 4; i += 1) await repos.weeks.closeOldest(f.periodId); // current meeting is 5
    await repos.ledger.settleHost(f.periodId, 1, '2026-01-06', 'tunai');
    await repos.payments.record(pay(f, 0, 30_000, '2026-01-20')); // settles the 25.000 left, 5.000 becomes titipan

    const r = await repos.reports.getKasReport();
    expect(r.expected.creditAvailable).toBe(5_000);
    expect(r.expected.creditHeld).toBe(5_000);
    expect(r.expected.expected).toBe(r.balances.actual + r.expected.outstandingDues - 5_000);
  });
});

describe('reports: meetings, members and period', () => {
  it('shows a host with offset: payout and offset as two figures, covered by offset, kas contribution once covered', async () => {
    const f = await setup();
    const { repos } = f;
    await repos.payments.record(pay(f, 1, 15_000));
    await repos.payments.record(pay(f, 2, 15_000));
    // A (host of meeting 1) has not paid: the payout offsets A's meeting 1 dues.
    await repos.ledger.settleHost(f.periodId, 1, '2026-01-06', 'tunai');

    const m = await repos.reports.getMeetingReport(f.periodId, 1);
    expect(m).toMatchObject({
      totalDues: 45_000,
      coveredByPayments: 30_000,
      coveredByOffset: 15_000,
      unpaid: 0,
      fullyCovered: true,
      hostPayout: 30_000,
      hostOffset: 15_000,
      kasContribution: 15_000,
      hostMemberId: (f.ids[0] as string),
      status: 'open',
    });
    expect(m.members.find((x) => x.memberId === (f.ids[0] as string))?.state).toBe('offset');

    const report = await repos.reports.getPeriodReport(f.periodId);
    expect(report.meetings).toHaveLength(3);
    expect(report.meetings[1]).toMatchObject({ week: 2, unpaid: 45_000, hostPayout: null, kasContribution: null });
    expect(report.summary).toMatchObject({ totalDues: 135_000, collected: 30_000, payouts: 30_000, offsets: 15_000 });
    expect(report.summary.netKasChange).toBe(30_000 - 30_000 + 15_000);
  });

  it('member history shows real payment dates, settled meetings and a corrected payment with its reason', async () => {
    const f = await setup();
    const { repos } = f;
    const bad = await repos.payments.record(pay(f, 1, 30_000, '2026-01-06'));
    await repos.payments.reverse(bad.payment.id, 'salah orang');
    await repos.payments.record(pay(f, 1, 15_000, '2026-01-13'));

    const h = await repos.reports.getMemberHistory(f.periodId, (f.ids[1] as string));
    expect(h.events.map((e) => [e.kind, e.date, e.amount, e.reversed])).toEqual([
      ['payment', '2026-01-06', 30_000, true],
      ['payment', '2026-01-13', 15_000, false],
    ]);
    expect(h.events[0]?.reversalReason).toBe('salah orang');
    expect(h.events[1]?.settled).toEqual([{ week: 1, amount: 15_000 }]);
    expect(h.totals).toMatchObject({ paid: 15_000, outstanding: 30_000, titipanUsed: 0 });
    expect(h.weeks.map((w) => w.state)).toEqual(['paid', 'unpaid', 'unpaid']);

    // The corrected payment is excluded from the period total as well.
    const summary = (await repos.reports.getPeriodReport(f.periodId)).summary;
    expect(summary.collected).toBe(15_000);
  });

  it('member history after close and carry-over: settle, write-off, carry-in and the loans of the member', async () => {
    const f = await setup();
    const { repos } = f;
    await repos.payments.record(pay(f, 0, 60_000)); // A: 45.000 dues + 15.000 titipan
    await repos.payments.record(pay(f, 2, 15_000)); // C: meeting 1 only; owes 30.000
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 200_000, account: 'tunai' });
    await repos.ledger.recordKas({ kind: 'loan', date: '2026-01-07', amount: 50_000, account: 'tunai', memberId: (f.ids[2] as string) });
    await repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-01-08', amount: 20_000, memberId: (f.ids[2] as string) });
    for (let i = 0; i < 3; i += 1) await repos.weeks.closeOldest(f.periodId);
    await markHostsPaid(repos, f.periodId);
    await repos.periods.close(f.periodId, '2026-12-30');
    const p2 = await repos.periods.create({ name: 'Periode 2', startDate: '2027-01-05', memberIds: [...f.ids] });

    const c = await repos.reports.getMemberHistory(f.periodId, (f.ids[2] as string));
    expect(c.events.map((e) => e.kind)).toEqual(['payment', 'host_payout', 'writeoff']);
    expect(c.events[2]).toMatchObject({ amount: 30_000, date: '2026-12-30' });
    expect(c.loans.map((l) => [l.kind, l.amount])).toEqual([
      ['loan', 50_000],
      ['loan_repayment', 20_000],
    ]);
    expect(c.totals.piutang).toBe(30_000);

    const aOld = await repos.reports.getMemberHistory(f.periodId, (f.ids[0] as string));
    expect(aOld.events.map((e) => e.kind)).toEqual(['payment', 'host_payout', 'titipan_carry_out']);
    expect(aOld.events[0]?.credit).toBe(15_000);
    expect(aOld.events[2]).toMatchObject({ amount: 15_000, otherPeriodName: 'Periode 2' });

    const aNew = await repos.reports.getMemberHistory(p2.id, (f.ids[0] as string));
    expect(aNew.events).toHaveLength(1);
    expect(aNew.events[0]).toMatchObject({ kind: 'titipan_carry_in', amount: 15_000, otherPeriodName: 'Periode 1', settled: [{ week: 1, amount: 15_000 }] });
    expect(aNew.weeks[0]?.state).toBe('credited');
  });

  it('period summary of an ended period with write-off, refund and shared goal', async () => {
    const f = await setup();
    const { repos } = f;
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 300_000, account: 'tunai' });
    await repos.payments.record(pay(f, 0, 60_000)); // A: 15.000 titipan
    await repos.payments.record(pay(f, 1, 45_000));
    await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-02-01', amount: 20_000, account: 'tunai', note: 'Wisata' });
    for (let i = 0; i < 3; i += 1) await repos.weeks.closeOldest(f.periodId);
    await markHostsPaid(repos, f.periodId);
    await repos.periods.close(f.periodId, '2026-12-30'); // C owes 45.000: written off
    await repos.credits.refund(f.periodId, (f.ids[0] as string), '2026-12-31', 'debit'); // A's 15.000 titipan goes back

    const s = (await repos.reports.getPeriodReport(f.periodId)).summary;
    expect(s).toMatchObject({
      totalDues: 135_000,
      collected: 105_000,
      payouts: 30_000, // the three test payouts of markHostsPaid are 10.000 each
      offsets: 0,
      writeoffs: 45_000,
      sharedGoal: 20_000,
      creditRefunds: 15_000,
    });
    // Payouts of markHostsPaid have no pos (balances untouched), so only payments, goal and refund move kas.
    expect(s.netKasChange).toBe(105_000 - 20_000 - 15_000);
    // The reported balance equals what the Kas screen computes.
    const report = await repos.reports.getKasReport();
    expect(report.balances).toEqual(await repos.ledger.getKasBalances());
  });
});
