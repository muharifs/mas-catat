// The credit arithmetic of ONE (source period, member) pool, as SQL. Kept in its own file so weeks.ts (undo of a
// skip) and credits.ts can both use it without importing each other. Every reader of member credit goes through
// loadAvailableCredit (re-exported by credits.ts); do not copy this query.
import { availableCredit, creditBalance, type CreditParts } from '@/domain/close';
import type { Queryable } from './db';

/** Skipped meetings (decision 33) are not counted: their dues are released back to credit (see docs/specs/skip-last-meeting.md). */
const NOT_SKIPPED_ALLOCATION =
  'NOT EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = a.period_id AND k.week = a.week)';
const NOT_SKIPPED_APPLICATION =
  'NOT EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = c.to_period_id AND k.week = c.week)';

/** The parts of the credit of a member from ONE source period. */
export async function loadCreditParts(db: Queryable, periodId: string, memberId: string): Promise<Required<CreditParts>> {
  const row = await db.getFirst<{ received: number; allocated: number; applied: number; refunded: number; released: number }>(
    `SELECT
       COALESCE((SELECT SUM(p.amount) FROM payments p
                  WHERE p.period_id = ? AND p.member_id = ? AND p.id NOT IN (SELECT payment_id FROM payment_reversals)), 0) AS received,
       COALESCE((SELECT SUM(a.amount) FROM allocations a
                  WHERE a.period_id = ? AND a.member_id = ? AND a.payment_id NOT IN (SELECT payment_id FROM payment_reversals)
                    AND ${NOT_SKIPPED_ALLOCATION}), 0) AS allocated,
       COALESCE((SELECT SUM(c.amount) FROM credit_applications c
                  WHERE c.from_period_id = ? AND c.member_id = ? AND ${NOT_SKIPPED_APPLICATION}), 0) AS applied,
       COALESCE((SELECT SUM(e.amount) FROM ledger_entries e
                  WHERE e.type = 'credit_refund' AND e.period_id = ? AND e.member_id = ?), 0) AS refunded,
       COALESCE((SELECT SUM(o.amount) FROM offset_credits o
                  WHERE o.period_id = ? AND o.member_id = ?
                    AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = o.ledger_entry_id)
                    AND EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = o.period_id AND k.week = o.week)), 0) AS released`,
    [periodId, memberId, periodId, memberId, periodId, memberId, periodId, memberId, periodId, memberId],
  );
  return {
    received: row?.received ?? 0,
    allocated: row?.allocated ?? 0,
    applied: row?.applied ?? 0,
    refunded: row?.refunded ?? 0,
    releasedOffset: row?.released ?? 0,
  };
}

/** Credit a member still holds from ONE source period: payments - allocations - applications - refunds + released offsets. */
export async function loadAvailableCredit(db: Queryable, periodId: string, memberId: string): Promise<number> {
  return availableCredit(await loadCreditParts(db, periodId, memberId));
}

/** The same number WITHOUT the non-negative check: a negative value means the data would be inconsistent (undo uses it). */
export async function loadCreditBalance(db: Queryable, periodId: string, memberId: string): Promise<number> {
  return creditBalance(await loadCreditParts(db, periodId, memberId));
}
