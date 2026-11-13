// B3 (owner decision 2026-11-13): a member payment cannot be corrected while that member's own host payout stands
// in the payment's period. Same pattern as F1 (host change).
import { PaymentHostPayoutStandsError } from '@/domain/payment-correction';
import { createRepositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-03-10';
const START = '2026-02-03';

async function setup() {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const [a, b, c] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id, (await repos.members.create('Citra')).id];
  const p = await repos.periods.create({ name: 'P', startDate: START, memberIds: [a, b, c] });
  await repos.weeks.assignHost(p.id, 1, a, START);
  const pay = (memberId: string, amount = 15_000) => repos.payments.record({ periodId: p.id, memberId, date: TODAY, amount, account: 'tunai' });
  return { db, repos, p, a, b, c, pay };
}

describe('B3: correcting a payment while the payer host payout stands', () => {
  it('is rejected with a typed error and writes nothing', async () => {
    const { db, repos, p, a, pay } = await setup();
    const own = await pay(a, 45_000);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    const kasBefore = await repos.ledger.listKas();
    const countBefore = await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries');
    const error = await repos.payments.reverse(own.payment.id, 'salah').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaymentHostPayoutStandsError);
    expect((error as PaymentHostPayoutStandsError).weekNumber).toBe(1);
    expect(await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries')).toEqual(countBefore);
    expect(await db.getFirst('SELECT 1 AS ok FROM payment_reversals')).toBeNull();
    expect(await repos.ledger.listKas()).toEqual(kasBefore);
    expect(await repos.payments.getStandingHostPayoutWeeks(p.id, a)).toEqual([1]);
  });

  it('is allowed again after the host payout is corrected (reversing the payout itself is never blocked)', async () => {
    const { repos, p, a, pay } = await setup();
    const own = await pay(a, 45_000);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await repos.ledger.reverseHostPayout(p.id, 1, 'salah');
    expect(await repos.payments.getStandingHostPayoutWeeks(p.id, a)).toEqual([]);
    await repos.payments.reverse(own.payment.id, 'salah orang');
    expect((await repos.payments.getWeekStatuses(p.id, a)).every((s) => s.outstanding === 15_000)).toBe(true);
  });

  it('does not touch other members: another payer and a member who never hosts', async () => {
    const { repos, p, a, b, c, pay } = await setup();
    const budi = await pay(b);
    const citra = await pay(c);
    await pay(a, 45_000);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    expect(await repos.payments.getStandingHostPayoutWeeks(p.id, b)).toEqual([]);
    await repos.payments.reverse(budi.payment.id, 'salah');
    await repos.payments.reverse(citra.payment.id, 'salah');
  });

  it('is allowed for a host whose meeting has no payout yet', async () => {
    const { repos, a, pay } = await setup();
    const own = await pay(a);
    await repos.payments.reverse(own.payment.id, 'salah');
  });

  it('does not look at payouts of another period', async () => {
    const db = await createMigratedTestDb();
    let n = 0;
    const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
    const [a, b] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id];
    const p1 = await repos.periods.create({ name: 'P1', startDate: START, memberIds: [a, b] });
    await repos.weeks.assignHost(p1.id, 1, a, START);
    await repos.ledger.settleHost(p1.id, 1, TODAY, 'tunai'); // Ani paid out in period 1
    await repos.weeks.closeOldest(p1.id);
    await repos.weeks.assignHost(p1.id, 2, b, '2026-02-10');
    await repos.ledger.settleHost(p1.id, 2, TODAY, 'tunai');
    await repos.weeks.closeOldest(p1.id);
    await repos.periods.close(p1.id, TODAY);
    const p2 = await repos.periods.create({ name: 'P2', startDate: '2026-03-03', memberIds: [a, b] });
    const pay = await repos.payments.record({ periodId: p2.id, memberId: a, date: TODAY, amount: 15_000, account: 'tunai' });
    expect(await repos.payments.getStandingHostPayoutWeeks(p2.id, a)).toEqual([]);
    await repos.payments.reverse(pay.payment.id, 'salah'); // Ani's period 1 payout does not block period 2
  });
});
