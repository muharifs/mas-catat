// QA finding F1: the host of an OPEN meeting can still be changed after the payout was recorded.
// CLAUDE.md: "Host of a week can be changed on member request (until the week is closed)" and "each member exactly once".
// Invariant that must hold at all times: every host_payout in force belongs to the CURRENT host of its week, and no member
// has two payouts in force. Today this is violated, so both tests are marked it.failing: they document the bug and keep
// the suite green. When the bug is fixed they will start to fail ("expected to fail") -> then change it.failing to it.
// The assertions are the correct behaviour and are NOT to be loosened.
import { createRepositories } from './index';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-03-10';

async function setup() {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ids: string[] = [];
  for (const name of ['Ani', 'Budi', 'Citra']) ids.push((await repos.members.create(name)).id);
  const p = await repos.periods.create({ name: 'P', startDate: '2026-02-03', memberIds: ids });
  await repos.weeks.assignHost(p.id, 1, ids[0] as string, '2026-02-03');
  await repos.weeks.assignHost(p.id, 2, ids[1] as string, '2026-02-10');
  return { repos, p, ids };
}

async function payoutsInForce(repos: Awaited<ReturnType<typeof setup>>['repos'], periodId: string) {
  const result: { week: number; memberId: string | null }[] = [];
  for (const w of await repos.weeks.listByPeriod(periodId)) {
    const payout = await repos.ledger.getWeekPayout(periodId, w.number);
    if (payout) result.push({ week: w.number, memberId: payout.payout.memberId });
  }
  return result;
}

describe('F1: host re-pick after the payout of an open meeting', () => {
  it.failing('re-picking the host of a paid-out open meeting must be refused (or the payout must follow the new host)', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai'); // Ani is paid for meeting 1
    await repos.weeks.assignHost(p.id, 1, ids[2] as string, '2026-02-03').catch(() => undefined); // owner re-picks Citra
    const week = await repos.weeks.get(p.id, 1);
    const payout = (await payoutsInForce(repos, p.id)).find((x) => x.week === 1);
    expect(payout?.memberId).toBe(week?.hostMemberId); // actual: payout.memberId = Ani, week host = Citra
  });

  it.failing('exchange of hosts with the next meeting after the payout must not let one member be paid twice', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai'); // Ani paid for meeting 1
    await repos.weeks.assignHost(p.id, 1, ids[1] as string, '2026-02-03').catch(() => undefined); // picks Budi: Ani and Budi exchange
    await repos.weeks.closeOldest(p.id);
    await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai').catch(() => undefined); // meeting 2 host is now Ani
    const payouts = await payoutsInForce(repos, p.id);
    const perMember = new Map<string | null, number>();
    for (const x of payouts) perMember.set(x.memberId, (perMember.get(x.memberId) ?? 0) + 1);
    expect(Math.max(...perMember.values())).toBe(1); // actual: Ani has 2 payouts, Budi (host of the closed meeting 1) has none
  });
});
