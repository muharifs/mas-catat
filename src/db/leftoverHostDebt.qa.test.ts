// QA (2026-11-12): leftover host debt after a capped host offset, when the remainder is NOT a multiple of 15.000.
// Story = cek-hp-3 scenario B without the Dedi payment correction: N=5, due 75.000 per meeting, payout 50.000.
// Ani, Budi and Citra pay in full. Eka (host of meeting 4) and Dedi (host of meeting 5) pay nothing, so each has
// 60.000 / 75.000 of dues at payout time and the offset is capped at 50.000. Hand-calculated numbers:
//   Eka  after payout 4: weeks 1-3 offset 15.000 each, week 4 offset 5.000 -> outstanding [0,0,0,10.000,15.000]
//   Dedi after payout 5: same offsets                                       -> outstanding [0,0,0,10.000,15.000]
// Runs on sql.js, not on the phone. Test files only: no app code is changed.
import { previewPeriodClose } from '@/domain/close';
import { previewPayment } from '@/domain/payment-preview';
import type { WeekStatus } from '@/domain/types';
import { addDays } from '@/domain/schedule';
import { createRepositories, type Repositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const START = '2026-02-03'; // a Tuesday
const TODAY = '2026-03-10';
const meetingDate = (k: number) => addDays(START, 7 * (k - 1));

type Who = 'ani' | 'budi' | 'citra' | 'dedi' | 'eka';
interface Env {
  repos: Repositories;
  periodId: string;
  ids: Record<Who, string>;
}

/**
 * Builds the story up to a stage. 'afterW4': meeting 4 (Eka) paid and closed, meeting 5 open without a host.
 * 'ready': meeting 5 (Dedi) paid and closed too, the period is still active (everything is closeable).
 */
async function build(stage: 'afterW4' | 'ready'): Promise<Env> {
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
  const period = await repos.periods.create({ name: 'QA Sisa', startDate: START, memberIds: Object.values(ids) });
  const e: Env = { repos, periodId: period.id, ids };
  const host = (k: number, who: Who) => repos.weeks.assignHost(period.id, k, ids[who], meetingDate(k));
  const settleAndClose = async (k: number) => {
    await repos.ledger.settleHost(period.id, k, TODAY, 'tunai');
    await repos.weeks.closeOldest(period.id);
  };
  await host(1, 'ani');
  await host(2, 'budi');
  for (const who of ['ani', 'budi', 'citra'] as const) await pay(e, who, 75_000);
  await settleAndClose(1);
  await host(3, 'citra');
  await settleAndClose(2);
  await settleAndClose(3);
  await host(4, 'eka');
  await settleAndClose(4);
  if (stage === 'afterW4') return e;
  await host(5, 'dedi');
  await settleAndClose(5);
  return e;
}

const pay = (e: Env, who: Who, amount: number) =>
  e.repos.payments.record({ periodId: e.periodId, memberId: e.ids[who], date: TODAY, amount, account: 'tunai' });
const previewOf = (e: Env, who: Who, amount: number) =>
  e.repos.payments.preview({ periodId: e.periodId, memberId: e.ids[who], date: TODAY, amount });
const outstanding = async (e: Env, who: Who) => (await e.repos.payments.getWeekStatuses(e.periodId, e.ids[who])).map((s) => s.outstanding);
const credit = (e: Env, who: Who) => e.repos.payments.getCredit(e.periodId, e.ids[who]);
const tunai = async (e: Env) => (await e.repos.ledger.getKasBalances()).tunai;

describe('Leftover host debt: starting point (hand numbers)', () => {
  it('Eka (host 4, debt 60.000): offset capped at 50.000, leftover 10.000 on week 4 plus the open week 5', async () => {
    const e = await build('afterW4');
    expect(await outstanding(e, 'eka')).toEqual([0, 0, 0, 10_000, 15_000]);
    // in 225.000 (3 x 75.000) + offset 50.000 - payouts 4 x 50.000 = 75.000
    expect(await tunai(e)).toBe(75_000);
  });

  it('Dedi (host 5, debt 75.000): leftover 25.000 = 10.000 (week 4) + 15.000 (week 5)', async () => {
    const e = await build('ready');
    expect(await outstanding(e, 'dedi')).toEqual([0, 0, 0, 10_000, 15_000]);
    expect(await tunai(e)).toBe(75_000); // 225 + 100 offsets - 250 payouts
  });
});

describe('Leftover debt: a valid payment settles the remainder oldest first, the excess becomes Titipan', () => {
  it('15.000: week 4 remainder 10.000 first, then 5.000 of week 5, NO credit (form preview agrees)', async () => {
    const e = await build('afterW4');
    const p = await previewOf(e, 'eka', 15_000);
    expect(p).toMatchObject({ creditAmount: 0, allocatedAmount: 15_000, weekCount: 2, settledWeeks: [4], partialWeek: 5 });
    expect(p.allocations.map((a) => [a.week, a.amount])).toEqual([[4, 10_000], [5, 5_000]]);
    const r = await pay(e, 'eka', 15_000);
    expect(r.allocations.map((a) => [a.week, a.amount])).toEqual([[4, 10_000], [5, 5_000]]); // saved == previewed
    expect(r.credit).toBe(0);
    expect(await outstanding(e, 'eka')).toEqual([0, 0, 0, 0, 10_000]);
    expect(await credit(e, 'eka')).toBe(0);
    expect(await tunai(e)).toBe(90_000);
  });

  it('30.000: 25.000 settles everything, 5.000 becomes Titipan; the preview reports the 5.000 BEFORE saving', async () => {
    const e = await build('afterW4');
    const p = await previewOf(e, 'eka', 30_000);
    expect(p).toMatchObject({ creditAmount: 5_000, allocatedAmount: 25_000, weekCount: 2, settledWeeks: [4, 5], partialWeek: null });
    expect(p.allocations.map((a) => [a.week, a.amount])).toEqual([[4, 10_000], [5, 15_000]]);
    const r = await pay(e, 'eka', 30_000);
    expect(r.credit).toBe(5_000);
    expect(r.allocations.map((a) => a.amount).reduce((t, x) => t + x, 0)).toBe(25_000);
    expect(await outstanding(e, 'eka')).toEqual([0, 0, 0, 0, 0]);
    expect(await credit(e, 'eka')).toBe(5_000); // a non-multiple of 15.000 is allowed as credit
    expect(await tunai(e)).toBe(105_000); // the whole 30.000 is cash received
  });

  it('Dedi (leftover 25.000 after the last payout): 15.000 gives no credit, 30.000 gives 5.000, 45.000 gives 20.000', async () => {
    for (const [amount, expectedCredit, expectedOutstanding] of [
      [15_000, 0, [0, 0, 0, 0, 10_000]],
      [30_000, 5_000, [0, 0, 0, 0, 0]],
      [45_000, 20_000, [0, 0, 0, 0, 0]],
    ] as const) {
      const e = await build('ready');
      const p = await previewOf(e, 'dedi', amount);
      expect(p.creditAmount).toBe(expectedCredit);
      expect(p.allocatedAmount + p.creditAmount).toBe(amount);
      const r = await pay(e, 'dedi', amount);
      expect(r.credit).toBe(expectedCredit);
      expect(await outstanding(e, 'dedi')).toEqual(expectedOutstanding);
      expect(await credit(e, 'dedi')).toBe(expectedCredit);
    }
  });

  it('two 15.000 payments in a row: the second one warns about 5.000 credit (10.000 left of week 5), then saves it', async () => {
    const e = await build('afterW4');
    await pay(e, 'eka', 15_000);
    const p = await previewOf(e, 'eka', 15_000);
    expect(p.allocations.map((a) => [a.week, a.amount])).toEqual([[5, 10_000]]);
    expect(p).toMatchObject({ creditAmount: 5_000, settledWeeks: [5], partialWeek: null });
    const r = await pay(e, 'eka', 15_000);
    expect(r.credit).toBe(5_000);
    expect(await credit(e, 'eka')).toBe(5_000);
  });

  it('a third payment when nothing is owed is all credit (preview says 15.000 before saving)', async () => {
    const e = await build('ready');
    await pay(e, 'dedi', 30_000); // settles 25.000 + credit 5.000
    const p = await previewOf(e, 'dedi', 15_000);
    expect(p).toMatchObject({ creditAmount: 15_000, allocatedAmount: 0, weekCount: 0 });
    await pay(e, 'dedi', 15_000);
    expect(await credit(e, 'dedi')).toBe(20_000);
  });

  it('a non-multiple payment is still rejected for the 10.000 leftover and 25.000 leftover; nothing is stored', async () => {
    const e = await build('ready');
    const before = await tunai(e);
    for (const bad of [10_000, 25_000, 7_500, 0]) {
      await expect(pay(e, 'dedi', bad)).rejects.toThrow();
      await expect(previewOf(e, 'dedi', bad)).rejects.toThrow();
    }
    expect(await tunai(e)).toBe(before);
    expect(await outstanding(e, 'dedi')).toEqual([0, 0, 0, 10_000, 15_000]);
  });
});

describe('Payment form preview, pure function (previewPayment) with leftover statuses', () => {
  // Only weeks 4 and 5 of a 5-week period are open for the member; offset of 5.000 sits on week 4.
  const status = (week: number, paid: number, offset: number, outstandingLeft: number): WeekStatus => ({
    week,
    due: 15_000,
    paid,
    offset,
    credited: 0,
    outstanding: outstandingLeft,
  });
  const statuses: WeekStatus[] = [
    status(1, 0, 15_000, 0),
    status(2, 0, 15_000, 0),
    status(3, 0, 15_000, 0),
    status(4, 0, 5_000, 10_000),
    status(5, 0, 0, 15_000),
  ];
  const pmt = (amount: number) => ({ id: 'p', memberId: 'm', date: TODAY, amount });

  it.each([
    [15_000, 0, [4], 5],
    [30_000, 5_000, [4, 5], null],
    [45_000, 20_000, [4, 5], null],
  ] as const)('amount %i -> credit %i, settled weeks %j, partial week %s', (amount, creditExpected, settled, partial) => {
    const p = previewPayment(pmt(amount), statuses);
    expect(p.creditAmount).toBe(creditExpected);
    expect(p.allocatedAmount).toBe(amount - creditExpected);
    expect(p.settledWeeks).toEqual(settled);
    expect(p.partialWeek).toBe(partial);
    expect(p.allocations.reduce((t, a) => t + a.amount, 0)).toBe(amount - creditExpected);
  });

  it('only the weeks the payment touches are listed, oldest first', () => {
    const p = previewPayment(pmt(15_000), statuses);
    expect(p.allocations.map((a) => a.week)).toEqual([4, 5]);
  });
});

describe('Close preview and write-off with leftover debt', () => {
  it('nobody pays more: Eka 25.000 and Dedi 25.000 are written off as separate entries; kas does not move', async () => {
    const e = await build('ready');
    const preview = await e.repos.periods.previewClose(e.periodId);
    const by = (who: Who) => preview.members.find((m) => m.memberId === e.ids[who]);
    expect(by('eka')).toMatchObject({ arrearsBefore: 25_000, credit: 0, settledByCredit: 0, writeoff: 25_000, creditLeft: 0 });
    expect(by('dedi')).toMatchObject({ arrearsBefore: 25_000, credit: 0, writeoff: 25_000 });
    expect(by('ani')).toMatchObject({ arrearsBefore: 0, writeoff: 0 });
    expect(by('budi')).toMatchObject({ arrearsBefore: 0, writeoff: 0 }); // paid all 5 meetings up front
    expect(preview).toMatchObject({ canClose: true, totalArrears: 50_000, totalWriteoff: 50_000 });
    await e.repos.periods.close(e.periodId, TODAY);
    const writeoffs = (await e.repos.ledger.listByPeriod(e.periodId)).filter((x) => x.type === 'debt_writeoff');
    expect(writeoffs.map((w) => w.amount).sort()).toEqual([25_000, 25_000]);
    const kas = await e.repos.reports.getKasReport();
    expect(kas.balances.actual).toBe(75_000);
    expect(kas.expected).toMatchObject({ creditHeld: 0, outstandingDues: 0, expected: 75_000 }); // = actual
  });

  it('after Eka paid 15.000 (leftover 10.000 on week 5) and Dedi paid nothing: write-offs 10.000 and 25.000', async () => {
    const e = await build('ready');
    await pay(e, 'eka', 15_000);
    const before = await tunai(e);
    const preview = await e.repos.periods.previewClose(e.periodId);
    const by = (who: Who) => preview.members.find((m) => m.memberId === e.ids[who]);
    expect(by('eka')).toMatchObject({ arrearsBefore: 10_000, writeoff: 10_000, creditLeft: 0 });
    expect(by('dedi')).toMatchObject({ arrearsBefore: 25_000, writeoff: 25_000 });
    await e.repos.periods.close(e.periodId, TODAY);
    const writeoffs = (await e.repos.ledger.listByPeriod(e.periodId)).filter((x) => x.type === 'debt_writeoff');
    const amountOf = (who: Who) => writeoffs.filter((w) => w.memberId === e.ids[who]).map((w) => [w.direction, w.amount, w.week, w.account]);
    expect(amountOf('eka')).toEqual([['out', 10_000, null, null]]);
    expect(amountOf('dedi')).toEqual([['out', 25_000, null, null]]);
    expect(await tunai(e)).toBe(before); // write-offs never change a kas balance
  });

  it('Eka paid 30.000 (Titipan 5.000, no arrears): no write-off for Eka, Titipan stays held after close', async () => {
    const e = await build('ready');
    await pay(e, 'eka', 30_000);
    const preview = await e.repos.periods.previewClose(e.periodId);
    const eka = preview.members.find((m) => m.memberId === e.ids.eka);
    expect(eka).toMatchObject({ arrearsBefore: 0, credit: 5_000, settledByCredit: 0, writeoff: 0, creditLeft: 5_000 });
    await e.repos.periods.close(e.periodId, TODAY);
    const writeoffs = (await e.repos.ledger.listByPeriod(e.periodId)).filter((x) => x.type === 'debt_writeoff');
    expect(writeoffs.some((w) => w.memberId === e.ids.eka)).toBe(false);
    expect(await credit(e, 'eka')).toBe(5_000);
    // kas: actual 75.000 + 30.000 = 105.000; outstanding dues are gone (written off); Titipan 5.000 is a liability
    const kas = await e.repos.reports.getKasReport();
    expect(kas.balances.actual).toBe(105_000);
    expect(kas.expected).toMatchObject({ creditHeld: 5_000, outstandingDues: 0, expected: 100_000 });
  });

  it('B3 (2026-11-13): Eka cannot correct her payment while her host payout stands, so no arrears and Titipan appear together', async () => {
    // Before B3 this test corrected the first payment (arrears 15.000 + Titipan 20.000) and checked that close settled
    // the arrears from the Titipan. That state can no longer be reached for a paid-out host; the close rule itself is
    // still covered by the domain test below.
    const e = await build('ready');
    const first = await pay(e, 'eka', 15_000);
    await pay(e, 'eka', 30_000);
    await expect(e.repos.payments.reverse(first.payment.id, 'salah catat')).rejects.toThrow(/host payout in force/);
    expect(await outstanding(e, 'eka')).toEqual([0, 0, 0, 0, 0]);
    expect(await credit(e, 'eka')).toBe(20_000);
    const preview = await e.repos.periods.previewClose(e.periodId);
    expect(preview.members.find((m) => m.memberId === e.ids.eka)).toMatchObject({ arrearsBefore: 0, credit: 20_000, writeoff: 0, creditLeft: 20_000 });
  });

  it('domain: Titipan 5.000 against arrears 25.000 settles week 4 partly (oldest first), 20.000 is written off', () => {
    const w = (week: number, outstandingLeft: number): WeekStatus => ({ week, due: 15_000, paid: 0, offset: 15_000 - outstandingLeft, credited: 0, outstanding: outstandingLeft });
    const preview = previewPeriodClose({
      weeks: [4, 5].map((number) => ({ number, status: 'closed' as const, hasActivePayout: true })),
      members: [{ memberId: 'm', statuses: [w(4, 10_000), w(5, 15_000)], credit: 5_000 }],
    });
    expect(preview.members[0]).toMatchObject({ arrearsBefore: 25_000, settledByCredit: 5_000, writeoff: 20_000, creditLeft: 0 });
    expect(preview.members[0]?.settlements).toEqual([{ week: 4, amount: 5_000 }]);
    expect(preview.writeoffs).toEqual([expect.objectContaining({ memberId: 'm', amount: 20_000 })]);
    expect(preview).toMatchObject({ totalArrears: 25_000, totalSettledByCredit: 5_000, totalWriteoff: 20_000 });
  });
});
