// Host payout and debt offset, recorded as two separate ledger entries. Pure.
import { hostPayoutAmount } from './dues';
import { assertIsoDate, assertPositiveInt, assertRupiah } from './money';
import type { KasBalances } from './kas';
import type { Account, IsoDate, LedgerEntry, Rupiah, UnpaidWeek, WeekCredit } from './types';

export interface HostSettlement {
  /** [payout] or [payout, offset]. Never a single silently reduced number. */
  entries: LedgerEntry[];
  /** Per-week breakdown of the (capped) offset, oldest week first; pass to allocatePayments as offsetCredits. */
  offsetWeeks: WeekCredit[];
  /** Cash that actually leaves kas: payout - offset. Always >= 0 because the offset is capped. */
  netCash: Rupiah;
  /** Host debt not covered by the offset: total debt - offset. Stays outstanding as a debt. */
  remainingDebt: Rupiah;
}

/**
 * Builds the ledger entries for the host of `week`.
 *
 * - Entry 1: host_payout, direction out, 10.000 x N, always recorded in full.
 * - Entry 2: host_offset, direction in, min(total host debt up to now, payout)
 *   (pass hostUnpaidWeeks from unpaidWeeksThrough(statuses, week)).
 *   The debt is settled out of the payout, so cash-wise it comes back into kas.
 * - The offset is capped at the payout, so netCash is never negative.
 *   It is applied to the host's unpaid weeks oldest first; the last week touched by the
 *   cap may be settled only partially. offsetWeeks reflects exactly this capped result,
 *   so the uncovered remainder stays outstanding after allocatePayments(..., offsetWeeks).
 * - If the host has no debt, NO offset entry is created (no zero-amount entries).
 */
export function buildHostSettlement(params: {
  memberCount: number;
  hostMemberId: string;
  week: number;
  date: IsoDate;
  hostUnpaidWeeks: readonly UnpaidWeek[];
  /** Pos both entries are booked on (payout out, offset in). Omit for an entry without pos. */
  account?: Account;
}): HostSettlement {
  const { memberCount, hostMemberId, week, date, hostUnpaidWeeks, account } = params;
  assertPositiveInt(week, 'week');
  assertIsoDate(date, 'date');
  const payout = hostPayoutAmount(memberCount);

  let totalDebt = 0;
  for (const u of hostUnpaidWeeks) {
    assertPositiveInt(u.week, 'unpaid week');
    assertRupiah(u.amount, 'unpaid amount');
    totalDebt += u.amount;
  }
  const offsetTotal = Math.min(totalDebt, payout);

  // Allocate the capped offset to the oldest unpaid weeks first (copy before sorting).
  const offsetWeeks: WeekCredit[] = [];
  let left = offsetTotal;
  const oldestFirst = hostUnpaidWeeks.filter((u) => u.amount > 0).sort((a, b) => a.week - b.week);
  for (const u of oldestFirst) {
    if (left <= 0) break;
    const applied = Math.min(u.amount, left);
    offsetWeeks.push({ week: u.week, amount: applied });
    left -= applied;
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
      ...(account ? { account } : {}),
    },
  ];

  if (offsetTotal > 0) {
    const weekList = offsetWeeks.map((w) => w.week).join(', ');
    const remainingDebt = totalDebt - offsetTotal;
    const capNote =
      remainingDebt > 0
        ? `; capped at the payout, ${remainingDebt} remains as debt` +
          (offsetWeeks.some((w, i) => i === offsetWeeks.length - 1 && w.amount < (oldestFirst[i]?.amount ?? 0))
            ? ' (last week settled partially)'
            : '')
        : '';
    entries.push({
      type: 'host_offset',
      direction: 'in',
      date,
      amount: offsetTotal,
      memberId: hostMemberId,
      week,
      note: `Offset of unpaid dues, weeks ${weekList}${capNote}`,
      ...(account ? { account } : {}),
    });
  }

  return { entries, offsetWeeks, netCash: payout - offsetTotal, remainingDebt: totalDebt - offsetTotal };
}

export interface PayoutPreview extends HostSettlement {
  account: 'tunai' | 'debit';
  /** Full host payout, 10.000 x N. */
  payout: Rupiah;
  /** Debt offset against the payout (0 when the host has no debt). */
  offset: Rupiah;
  /** Tunai + Debit before the payout. */
  kasBefore: Rupiah;
  /** Balance of the chosen pos before the payout. */
  accountBefore: Rupiah;
  /** Warning: Tunai + Debit is below the net cash out. Never a block. */
  kasShort: boolean;
  /** Warning: the chosen pos alone is below the net cash out. Never a block. */
  accountShort: boolean;
}

/**
 * What paying out the host would do, including the balance warnings. Uses buildHostSettlement, so the preview
 * equals what is saved. Both entries are on the SAME pos, so that pos loses the net cash out (payout - offset).
 */
export function previewHostPayout(params: {
  memberCount: number;
  hostMemberId: string;
  week: number;
  date: IsoDate;
  hostUnpaidWeeks: readonly UnpaidWeek[];
  account: 'tunai' | 'debit';
  balances: KasBalances;
}): PayoutPreview {
  const settlement = buildHostSettlement(params);
  const payout = settlement.entries[0]?.amount ?? 0;
  const accountBefore = params.balances[params.account];
  return {
    ...settlement,
    account: params.account,
    payout,
    offset: payout - settlement.netCash,
    kasBefore: params.balances.actual,
    accountBefore,
    kasShort: params.balances.actual < settlement.netCash,
    accountShort: accountBefore < settlement.netCash,
  };
}
