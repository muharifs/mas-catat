// QA finding F1: the host of an OPEN meeting could still be changed after the payout was recorded.
// Fixed by owner decision 2026-11-10: a host change is refused while that meeting's payout stands (also in a swap).
// Invariant that must hold at all times: every host_payout in force belongs to the CURRENT host of its week, and no member
// has two payouts in force. The assertions are the correct behaviour and are NOT to be loosened.
import { HostPayoutStandsError } from '@/domain/schedule';
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
  it('re-picking the host of a paid-out open meeting must be refused (or the payout must follow the new host)', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai'); // Ani is paid for meeting 1
    await repos.weeks.assignHost(p.id, 1, ids[2] as string, '2026-02-03').catch(() => undefined); // owner re-picks Citra
    const week = await repos.weeks.get(p.id, 1);
    const payout = (await payoutsInForce(repos, p.id)).find((x) => x.week === 1);
    expect(payout?.memberId).toBe(week?.hostMemberId); // actual: payout.memberId = Ani, week host = Citra
  });

  it('exchange of hosts with the next meeting after the payout must not let one member be paid twice', async () => {
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

  it('refuses the change with a typed error, and allows it again after the payout is corrected', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    expect(await repos.weeks.standingPayoutWeeks(p.id)).toEqual([1]);
    await expect(repos.weeks.assignHost(p.id, 1, ids[2] as string, '2026-02-03')).rejects.toBeInstanceOf(HostPayoutStandsError);
    await expect(repos.weeks.assignHost(p.id, 1, ids[1] as string, '2026-02-03')).rejects.toBeInstanceOf(HostPayoutStandsError); // swap
    await expect(repos.weeks.assignHost(p.id, 2, ids[0] as string, '2026-02-10')).rejects.toBeInstanceOf(HostPayoutStandsError); // swap from the other side
    await expect(repos.weeks.swapHosts(p.id, 1, 2)).rejects.toBeInstanceOf(HostPayoutStandsError);
    expect((await repos.weeks.get(p.id, 1))?.hostMemberId).toBe(ids[0]);
    expect((await repos.weeks.get(p.id, 2))?.hostMemberId).toBe(ids[1]);

    await repos.ledger.reverseHostPayout(p.id, 1, 'salah orang');
    expect(await repos.weeks.standingPayoutWeeks(p.id)).toEqual([]);
    await repos.weeks.assignHost(p.id, 1, ids[2] as string, '2026-02-03');
    expect((await repos.weeks.get(p.id, 1))?.hostMemberId).toBe(ids[2]);
  });

  it('allows swapHosts again after the payout is corrected', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await repos.ledger.reverseHostPayout(p.id, 1, 'salah orang');
    await repos.weeks.swapHosts(p.id, 1, 2);
    expect((await repos.weeks.get(p.id, 1))?.hostMemberId).toBe(ids[1]);
  });
  it('blocks a host change of the now-current meeting 2 (after meeting 1 is closed) while its payout stands', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await repos.weeks.closeOldest(p.id);
    await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai');
    expect(await repos.weeks.standingPayoutWeeks(p.id)).toEqual([1, 2]);
    await expect(repos.weeks.assignHost(p.id, 2, ids[2] as string, '2026-02-10')).rejects.toBeInstanceOf(HostPayoutStandsError);
    // the next meeting (3) cannot take over meeting 2's host through an exchange either
    await expect(repos.weeks.assignHost(p.id, 3, ids[1] as string, '2026-02-17')).rejects.toBeInstanceOf(HostPayoutStandsError);
    expect((await repos.weeks.get(p.id, 2))?.hostMemberId).toBe(ids[1]);
    await repos.ledger.reverseHostPayout(p.id, 2, 'salah');
    await repos.weeks.assignHost(p.id, 2, ids[2] as string, '2026-02-10');
    expect((await repos.weeks.get(p.id, 2))?.hostMemberId).toBe(ids[2]);
  });

  it('a standing payout of the CURRENT meeting blocks the swap with the next one picked from the next side', async () => {
    const { repos, p, ids } = await setup();
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    // picking Ani (host of paid week 1) as host of week 2 would exchange with week 1: refused, nothing changes
    await expect(repos.weeks.assignHost(p.id, 2, ids[0] as string, '2026-02-10')).rejects.toBeInstanceOf(HostPayoutStandsError);
    expect((await repos.weeks.get(p.id, 1))?.hostMemberId).toBe(ids[0]);
    expect((await repos.weeks.get(p.id, 2))?.hostMemberId).toBe(ids[1]);
  });
});
