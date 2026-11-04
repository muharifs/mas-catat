// Host payout and debt offset, recorded as two separate ledger entries. Pure.
import { hostPayoutAmount } from './dues';
import { assertIsoDate, assertPositiveInt, assertRupiah } from './money';
import type { IsoDate, LedgerEntry, Rupiah, UnpaidWeek, WeekCredit } from './types';

export interface HostSettlement {
  /** [payout] or [payout, offset]. Never a single silently reduced number. */
  entries: LedgerEntry[];
  /** Per-week breakdown of the offset; pass to allocatePayments as offsetCredits. */
  offsetWeeks: WeekCredit[];
  /** Cash that actually leaves kas: payout - offset. Negative = host still owes the group. */
  netCash: Rupiah;
}

/**
 * Builds the ledger entries for the host of `week`.
 *
 * - Entry 1: host_payout, direction out, 10.000 x N, always recorded.
 * - Entry 2: host_offset, direction in, sum of ALL the host's unpaid weeks up to now
 *   (pass hostUnpaidWeeks from unpaidWeeksThrough(statuses, week)).
 *   The debt is settled out of the payout, so cash-wise it comes back into kas.
 * - If the host has no debt, NO offset entry is created (no zero-amount entries).
 * - The offset is not capped: if debt exceeds the payout, netCash is negative.
 */
export function buildHostSettlement(params: {
  memberCount: number;
  hostMemberId: string;
  week: number;
  date: IsoDate;
  hostUnpaidWeeks: readonly UnpaidWeek[];
}): HostSettlement {
  const { memberCount, hostMemberId, week, date, hostUnpaidWeeks } = params;
  assertPositiveInt(week, 'week');
  assertIsoDate(date, 'date');
  const payout = hostPayoutAmount(memberCount);

  let offsetTotal = 0;
  for (const u of hostUnpaidWeeks) {
    assertPositiveInt(u.week, 'unpaid week');
    assertRupiah(u.amount, 'unpaid amount');
    offsetTotal += u.amount;
  }

  const entries: LedgerEntry[] = [
    {
      type: 'host_payout',
      direction: 'out',
      date,
      amount: payout,
      memberId: hostMemberId,
      week,
      note: `Host payout week ${week}`,
    },
  ];
  const offsetWeeks: WeekCredit[] = hostUnpaidWeeks
    .filter((u) => u.amount > 0)
    .map((u) => ({ week: u.week, amount: u.amount }));

  if (offsetTotal > 0) {
    entries.push({
      type: 'host_offset',
      direction: 'in',
      date,
      amount: offsetTotal,
      memberId: hostMemberId,
      week,
      note: `Offset of unpaid dues, weeks ${offsetWeeks.map((w) => w.week).join(', ')}`,
    });
  }

  return { entries, offsetWeeks, netCash: payout - offsetTotal };
}
