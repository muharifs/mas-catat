// Allocation of member payments to weekly dues, oldest unpaid week first. Pure.
import { assertDuesMultiple, assertIsoDate, assertPositiveInt, assertRupiah, DomainError, WEEKLY_DUE } from './money';
import type { Allocation, Payment, Rupiah, WeekCredit, WeekStatus } from './types';

export interface AllocationResult {
  allocations: Allocation[];
  /** One entry per week 1..totalWeeks. */
  weeks: WeekStatus[];
  /** Money left over after every week of the period is fully settled (advance credit). */
  credit: Rupiah;
}

/**
 * Allocates the payments of ONE member to the weekly dues of a period.
 *
 * - Every payment must be a positive multiple of WEEKLY_DUE (15.000); otherwise a DomainError is thrown.
 *   Offset credits are NOT payments and may be any amount (a capped offset can settle a week partially).
 * - Payments are processed in date order (ties keep input order).
 * - Each payment fills the oldest week that is not fully settled, then the next, and so on.
 *   This covers exact, late, advance and lump-sum payments with one rule.
 *   Advance payments simply reach weeks that have not happened yet.
 * - A payment may be split across weeks; each Allocation keeps the payment's own date.
 * - Amount left after all totalWeeks are settled is returned as `credit`.
 * - offsetCredits (from host payout offsets) are already-settled parts of a week's due.
 * - creditedCredits (member credit applied to a week) are already-settled parts of a due too; they are reported
 *   separately in WeekStatus.credited. offset + credited of one week may not exceed the weekly due.
 * Inputs are never mutated.
 */
export function allocatePayments(
  payments: readonly Payment[],
  totalWeeks: number,
  offsetCredits: readonly WeekCredit[] = [],
  creditedCredits: readonly WeekCredit[] = [],
): AllocationResult {
  assertPositiveInt(totalWeeks, 'totalWeeks');

  const offsetByWeek = new Array<number>(totalWeeks).fill(0);
  for (const c of offsetCredits) {
    assertPositiveInt(c.week, 'offset week');
    assertRupiah(c.amount, 'offset amount');
    if (c.week > totalWeeks) throw new DomainError(`offset week ${c.week} is beyond the period`);
    const total = (offsetByWeek[c.week - 1] ?? 0) + c.amount;
    if (total > WEEKLY_DUE) throw new DomainError(`offset for week ${c.week} exceeds the weekly due`);
    offsetByWeek[c.week - 1] = total;
  }
  const creditedByWeek = new Array<number>(totalWeeks).fill(0);
  for (const c of creditedCredits) {
    assertPositiveInt(c.week, 'credited week');
    assertRupiah(c.amount, 'credited amount');
    if (c.week > totalWeeks) throw new DomainError(`credited week ${c.week} is beyond the period`);
    const total = (creditedByWeek[c.week - 1] ?? 0) + c.amount;
    if (total + (offsetByWeek[c.week - 1] ?? 0) > WEEKLY_DUE) {
      throw new DomainError(`settled amount for week ${c.week} exceeds the weekly due`);
    }
    creditedByWeek[c.week - 1] = total;
  }

  const memberId = payments[0]?.memberId;
  for (const p of payments) {
    if (p.memberId !== memberId) throw new DomainError('all payments must belong to the same member');
    assertDuesMultiple(p.amount, `payment ${p.id} amount`);
    assertIsoDate(p.date, `payment ${p.id} date`);
  }

  const ordered = payments
    .map((p, index) => ({ p, index }))
    .sort((a, b) => (a.p.date < b.p.date ? -1 : a.p.date > b.p.date ? 1 : a.index - b.index))
    .map((x) => x.p);

  const paidByWeek = new Array<number>(totalWeeks).fill(0);
  const allocations: Allocation[] = [];
  let credit = 0;
  let cursor = 0; // index of the oldest week that may still be open

  for (const p of ordered) {
    let remaining = p.amount;
    while (remaining > 0 && cursor < totalWeeks) {
      const open = WEEKLY_DUE - (offsetByWeek[cursor] ?? 0) - (creditedByWeek[cursor] ?? 0) - (paidByWeek[cursor] ?? 0);
      if (open <= 0) {
        cursor += 1;
        continue;
      }
      const applied = Math.min(open, remaining); // integer min, no rounding
      paidByWeek[cursor] = (paidByWeek[cursor] ?? 0) + applied;
      allocations.push({
        paymentId: p.id,
        memberId: p.memberId,
        week: cursor + 1,
        amount: applied,
        paymentDate: p.date,
      });
      remaining -= applied;
    }
    credit += remaining;
  }

  const weeks: WeekStatus[] = paidByWeek.map((paid, i) => {
    const offset = offsetByWeek[i] ?? 0;
    const credited = creditedByWeek[i] ?? 0;
    return { week: i + 1, due: WEEKLY_DUE, paid, offset, credited, outstanding: WEEKLY_DUE - paid - offset - credited };
  });

  return { allocations, weeks, credit };
}
