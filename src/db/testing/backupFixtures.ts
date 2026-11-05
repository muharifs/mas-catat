// Test-only data for the backup/restore tests: a realistic small history written through the real repositories.
import { createRepositories, type Repositories } from '../index';
import type { Db } from '../db';

export interface SeedResult {
  repos: Repositories;
  periodId: string;
  memberIds: string[];
}

/**
 * 4 members, one period, a full host schedule, payments (one lump sum, one corrected), two closed meetings, a host
 * payout with offset, an opening balance, a transfer and a shared goal. `prefix` keeps ids unique between two
 * databases that must diverge.
 */
export async function seedSampleData(db: Db, prefix = 'a'): Promise<SeedResult> {
  let n = 0;
  const repos = createRepositories(db, { newId: () => `${prefix}${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
  const memberIds: string[] = [];
  for (let i = 0; i < 4; i += 1) memberIds.push((await repos.members.create(`Anggota ${prefix}${i + 1}`)).id);
  const period = await repos.periods.create({ name: `Periode ${prefix}`, startDate: '2026-01-06', memberIds });
  for (let i = 0; i < memberIds.length; i += 1) {
    await db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [memberIds[i] as string, period.id, i + 1]);
  }
  await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 200_000, account: 'tunai' });
  await repos.payments.record({ periodId: period.id, memberId: memberIds[0] as string, date: '2026-01-06', amount: 30_000, account: 'tunai' });
  await repos.payments.record({ periodId: period.id, memberId: memberIds[1] as string, date: '2026-01-06', amount: 15_000, account: 'tunai' });
  const wrong = await repos.payments.record({ periodId: period.id, memberId: memberIds[2] as string, date: '2026-01-06', amount: 15_000, account: 'tunai' });
  await repos.payments.reverse(wrong.payment.id, 'salah orang');
  await repos.payments.record({ periodId: period.id, memberId: memberIds[2] as string, date: '2026-01-07', amount: 15_000, account: 'tunai' });
  await repos.weeks.closeOldest(period.id);
  await repos.ledger.settleHost(period.id, 1, '2026-01-07');
  await repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-08', amount: 50_000, account: 'tunai', toAccount: 'debit' });
  await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-01-09', amount: 20_000, account: 'debit', note: 'Tabungan wisata' });
  return { repos, periodId: period.id, memberIds };
}

/**
 * A history with a closed period (write-off, member credit) and a second period that received the carried-over credit,
 * and a payment in the new period. Used to prove the health check gives no false alarm on real shapes of data.
 */
export async function seedClosedPeriodHistory(db: Db): Promise<SeedResult> {
  let n = 0;
  const repos = createRepositories(db, { newId: () => `h${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1) ids.push((await repos.members.create(`Anggota h${i + 1}`)).id);
  const first = await repos.periods.create({ name: 'Periode lama', startDate: '2026-01-06', memberIds: ids });
  for (let i = 0; i < ids.length; i += 1) {
    await db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [ids[i] as string, first.id, i + 1]);
  }
  // Member 1 pays 60.000 for dues of 45.000 (15.000 titipan), member 2 pays one meeting, member 3 pays nothing.
  await repos.payments.record({ periodId: first.id, memberId: ids[0] as string, date: '2026-01-06', amount: 60_000, account: 'tunai' });
  await repos.payments.record({ periodId: first.id, memberId: ids[1] as string, date: '2026-01-06', amount: 15_000, account: 'tunai' });
  for (let w = 1; w <= 3; w += 1) {
    await repos.weeks.closeOldest(first.id);
    await repos.ledger.settleHost(first.id, w, '2026-01-20');
  }
  await repos.periods.close(first.id, '2026-12-30');
  // Member 2 does not join the next period: the titipan of member 1 is carried over, nothing else is.
  const second = await repos.periods.create({ name: 'Periode baru', startDate: '2027-01-05', memberIds: [ids[0] as string, ids[2] as string] });
  await repos.payments.record({ periodId: second.id, memberId: ids[2] as string, date: '2026-12-30', amount: 15_000, account: 'tunai' });
  return { repos, periodId: second.id, memberIds: ids };
}
