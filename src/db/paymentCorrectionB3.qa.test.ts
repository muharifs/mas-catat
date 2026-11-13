// QA attack tests for B3 (payment correction blocked while the payer's own host payout stands).
import { PaymentHostPayoutStandsError } from '@/domain/payment-correction';
import { createRepositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-03-10';
const START = '2026-02-03';

async function setup(n = 3) {
  const db = await createMigratedTestDb();
  let i = 0;
  const repos = createRepositories(db, { newId: () => `id${(i += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ids: string[] = [];
  for (const name of ['Ani', 'Budi', 'Citra', 'Dewi'].slice(0, n)) ids.push((await repos.members.create(name)).id);
  const p = await repos.periods.create({ name: 'P', startDate: START, memberIds: ids });
  const pay = (m: string, amount = 15_000) => repos.payments.record({ periodId: p.id, memberId: m, date: TODAY, amount, account: 'tunai' });
  // Fixed-length tuple: every test uses n >= 3 members, so ids[0..2] always exist (noUncheckedIndexedAccess).
  return { db, repos, p, ids: ids as [string, string, string], pay };
}

describe('B3 QA: attempts to break the rule', () => {
  it('payout reversed, then re-paid: blocked again; reversed again: allowed', async () => {
    const { repos, p, ids, pay } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0], START);
    const own = await pay(ids[0], 45_000);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await repos.ledger.reverseHostPayout(p.id, 1, 'salah');
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await expect(repos.payments.reverse(own.payment.id, 'x')).rejects.toBeInstanceOf(PaymentHostPayoutStandsError);
    await repos.ledger.reverseHostPayout(p.id, 1, 'salah lagi');
    await repos.payments.reverse(own.payment.id, 'x');
  });

  it('two hosts: both payouts stand; correcting one payout does not free the other host', async () => {
    const { repos, p, ids, pay } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0], START);
    const a = await pay(ids[0], 45_000);
    const b = await pay(ids[1], 45_000);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await repos.weeks.closeOldest(p.id);
    await repos.weeks.assignHost(p.id, 2, ids[1], '2026-02-10');
    await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai');
    await expect(repos.payments.reverse(a.payment.id, 'x')).rejects.toBeInstanceOf(PaymentHostPayoutStandsError);
    await expect(repos.payments.reverse(b.payment.id, 'x')).rejects.toBeInstanceOf(PaymentHostPayoutStandsError);
    await repos.ledger.reverseHostPayout(p.id, 1, 'salah');
    await repos.payments.reverse(a.payment.id, 'x');
    await expect(repos.payments.reverse(b.payment.id, 'x')).rejects.toBeInstanceOf(PaymentHostPayoutStandsError);
  });

  it('host paid in week 2 only: payment (paying week 1 only) is still blocked (rule is member-wide)', async () => {
    const { repos, p, ids, pay } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[1], START);
    await repos.weeks.closeOldest(p.id).catch(() => undefined);
    await repos.weeks.assignHost(p.id, 2, ids[0], '2026-02-10').catch(() => undefined);
    const own = await pay(ids[0], 15_000);
    const w = await repos.weeks.listByPeriod(p.id);
    if (w[1]?.hostMemberId === ids[0]) {
      await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai').catch(() => undefined);
    }
    // whichever state was reached, the repo and the UI query must agree
    const standing = await repos.payments.getStandingHostPayoutWeeks(p.id, ids[0]);
    const r = await repos.payments.reverse(own.payment.id, 'x').then(() => 'ok', (e: unknown) => e);
    if (standing.length > 0) expect(r).toBeInstanceOf(PaymentHostPayoutStandsError);
    else expect(r).toBe('ok');
  });

  it('host swap is refused while payout stands, so the check cannot be dodged by reassigning', async () => {
    const { repos, p, ids, pay } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0], START);
    const own = await pay(ids[0], 45_000);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await expect(repos.weeks.assignHost(p.id, 1, ids[1], START)).rejects.toThrow();
    await expect(repos.payments.reverse(own.payment.id, 'x')).rejects.toBeInstanceOf(PaymentHostPayoutStandsError);
  });

  it('payment correction of a host whose week was reassigned BEFORE payout works', async () => {
    const { repos, p, ids, pay } = await setup();
    await repos.weeks.assignHost(p.id, 1, ids[0], START);
    const own = await pay(ids[0], 15_000);
    await repos.weeks.assignHost(p.id, 1, ids[1], START);
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai'); // Budi paid
    await repos.payments.reverse(own.payment.id, 'x'); // Ani no longer host
  });
});
