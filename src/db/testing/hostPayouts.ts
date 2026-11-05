// Test helper for tests that only need a period to be closable: writes one host payout entry per week WITHOUT a
// pos (like an old, pre-pos payout), so kas balances stay untouched. Tests of real payouts use settleHost.
import type { Repositories } from '../index';

export async function markHostsPaid(repos: Repositories, periodId: string): Promise<void> {
  for (const week of await repos.weeks.listByPeriod(periodId)) {
    if (!week.hostMemberId || (await repos.ledger.getWeekPayout(periodId, week.number))) continue;
    await repos.ledger.append({
      periodId,
      type: 'host_payout',
      direction: 'out',
      date: week.date,
      amount: 10_000,
      memberId: week.hostMemberId,
      week: week.number,
      note: 'test payout',
      account: null,
    });
  }
}
