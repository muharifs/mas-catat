// M5e: who paid today (Pembayaran marker, summary count and the once-per-day swipe lock).
import { canSwipePay, SWIPE_PAYMENT_AMOUNT } from '@/domain/swipe-pay';
import { createRepositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-02-10';
const YESTERDAY = '2026-02-09';

async function setup() {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1) ids.push((await repos.members.create(`Member ${i + 1}`)).id);
  const period = await repos.periods.create({ name: 'P1', startDate: '2026-01-06', memberIds: ids });
  const pay = (periodId: string, memberId: string, date: string, amount = SWIPE_PAYMENT_AMOUNT) =>
    repos.payments.record({ periodId, memberId, date, amount, account: 'tunai' });
  return { db, repos, period, ids, pay };
}

describe('M5e: paid today', () => {
  it('lists a member with a valid payment dated today', async () => {
    const { repos, period, ids, pay } = await setup();
    await pay(period.id, ids[0] as string, TODAY);
    expect(await repos.payments.listMemberIdsPaidOn(period.id, TODAY)).toEqual([ids[0]]);
  });

  it('does not count a corrected (reversed) payment', async () => {
    const { repos, period, ids, pay } = await setup();
    const { payment } = await pay(period.id, ids[0] as string, TODAY);
    await repos.payments.reverse(payment.id, 'salah catat');
    expect(await repos.payments.listMemberIdsPaidOn(period.id, TODAY)).toEqual([]);
  });

  it('does not count a payment dated another day', async () => {
    const { repos, period, ids, pay } = await setup();
    await pay(period.id, ids[0] as string, YESTERDAY);
    expect(await repos.payments.listMemberIdsPaidOn(period.id, TODAY)).toEqual([]);
  });

  it('does not count a payment in another period', async () => {
    const { db, repos, period, ids, pay } = await setup();
    await pay(period.id, ids[0] as string, TODAY);
    // Only one period can be active: mark the first as ended directly (test shortcut), then start another.
    await db.run("UPDATE periods SET status = 'closed' WHERE id = ?", [period.id]);
    const other = await repos.periods.create({ name: 'P2', startDate: '2026-06-02', memberIds: ids });
    expect(await repos.payments.listMemberIdsPaidOn(other.id, TODAY)).toEqual([]);
    expect(await repos.payments.listMemberIdsPaidOn(period.id, TODAY)).toEqual([ids[0]]);
  });

  it('counts each member once, even with two payments today (summary count)', async () => {
    const { repos, period, ids, pay } = await setup();
    await pay(period.id, ids[0] as string, TODAY);
    await pay(period.id, ids[0] as string, TODAY);
    await pay(period.id, ids[1] as string, TODAY);
    await pay(period.id, ids[2] as string, YESTERDAY);
    const paid = await repos.payments.listMemberIdsPaidOn(period.id, TODAY);
    expect(paid).toHaveLength(2);
    expect(new Set(paid)).toEqual(new Set([ids[0], ids[1]]));
  });

  it('blocks the swipe after one payment today and frees it after the correction', async () => {
    const { repos, period, ids, pay } = await setup();
    const member = ids[0] as string;
    const allowed = async () => {
      const balance = (await repos.payments.listBalances(period.id)).find((b) => b.memberId === member);
      const paidToday = (await repos.payments.listMemberIdsPaidOn(period.id, TODAY)).includes(member);
      return canSwipePay({ arrears: balance?.arrears ?? 0, periodActive: true, paidToday });
    };
    expect(await allowed()).toBe(true);
    const { payment } = await pay(period.id, member, TODAY);
    expect(await allowed()).toBe(false);
    await repos.payments.reverse(payment.id, 'salah catat');
    expect(await allowed()).toBe(true);
  });
});

describe('payments.getByLedgerEntry (entry detail)', () => {
  it('returns the paid meetings and the credit of the payment behind a ledger entry', async () => {
    const { repos, period, ids, pay } = await setup();
    const member = ids[0] as string;
    // 10 weeks of dues exist only up to the period length (3 members = 3 meetings): 4 x 15.000 leaves one week as credit.
    const { payment } = await pay(period.id, member, TODAY, 60000);
    const entry = (await repos.ledger.listByMember(period.id, member)).find((e) => e.type === 'member_payment');
    const found = await repos.payments.getByLedgerEntry(entry?.id as string);
    expect(found?.payment.id).toBe(payment.id);
    expect(found?.allocations.map((a) => a.week)).toEqual([1, 2, 3]);
    expect(found?.credit).toBe(15000);
    expect(found?.reversed).toBe(false);
  });

  it('marks a corrected payment as reversed with no credit, and returns null for other entries', async () => {
    const { repos, period, ids, pay } = await setup();
    const member = ids[0] as string;
    const { payment } = await pay(period.id, member, TODAY, 60000);
    await repos.payments.reverse(payment.id, 'salah catat');
    const entries = await repos.ledger.listByMember(period.id, member);
    const paymentEntry = entries.find((e) => e.type === 'member_payment');
    const found = await repos.payments.getByLedgerEntry(paymentEntry?.id as string);
    expect(found?.reversed).toBe(true);
    expect(found?.credit).toBe(0);
    const reversalEntry = entries.find((e) => e.type === 'reversal');
    expect(await repos.payments.getByLedgerEntry(reversalEntry?.id as string)).toBeNull();
  });
});
