// Member credit: what a member holds from a source period, applications of it (settle at close, carry over into a
// new period) and the refund. The arithmetic lives in src/domain/close.ts; this file loads rows and writes them.
import { assertEntryDate, type KasBalances } from '@/domain/kas';
import { availableCredit, planCarryOver, previewCreditRefund, type CarryOverPlan, type CreditRefundPreview } from '@/domain/close';
import type { Account } from '@/domain/types';
import type { Db, Queryable } from './db';
import { defaultDeps, todayOf, type RepoDeps } from './deps';
import { RepositoryError } from './errors';
import { insertEntry, loadKasBalances, type StoredLedgerEntry } from './ledger';

export type CreditApplicationKind = 'settle_debt' | 'carry_over';

/** Credit a member still holds from ONE source period: payments - allocations - applications - refunds. */
export async function loadAvailableCredit(db: Queryable, periodId: string, memberId: string): Promise<number> {
  const row = await db.getFirst<{ received: number; allocated: number; applied: number; refunded: number }>(
    `SELECT
       COALESCE((SELECT SUM(p.amount) FROM payments p
                  WHERE p.period_id = ? AND p.member_id = ? AND p.id NOT IN (SELECT payment_id FROM payment_reversals)), 0) AS received,
       COALESCE((SELECT SUM(a.amount) FROM allocations a
                  WHERE a.period_id = ? AND a.member_id = ? AND a.payment_id NOT IN (SELECT payment_id FROM payment_reversals)), 0) AS allocated,
       COALESCE((SELECT SUM(c.amount) FROM credit_applications c WHERE c.from_period_id = ? AND c.member_id = ?), 0) AS applied,
       COALESCE((SELECT SUM(e.amount) FROM ledger_entries e
                  WHERE e.type = 'credit_refund' AND e.period_id = ? AND e.member_id = ?), 0) AS refunded`,
    [periodId, memberId, periodId, memberId, periodId, memberId, periodId, memberId],
  );
  return availableCredit({
    received: row?.received ?? 0,
    allocated: row?.allocated ?? 0,
    applied: row?.applied ?? 0,
    refunded: row?.refunded ?? 0,
  });
}

/** Unused credit of a member in every CLOSED period they were in, oldest period first (only amounts above 0). */
export async function loadClosedCreditSources(
  db: Queryable,
  memberId: string,
): Promise<{ fromPeriodId: string; available: number }[]> {
  const periods = await db.getAll<{ id: string }>(
    `SELECT p.id FROM periods p JOIN period_members pm ON pm.period_id = p.id
      WHERE p.status = 'closed' AND pm.member_id = ? ORDER BY p.start_date, p.rowid`,
    [memberId],
  );
  const sources: { fromPeriodId: string; available: number }[] = [];
  for (const p of periods) {
    const available = await loadAvailableCredit(db, p.id, memberId);
    if (available > 0) sources.push({ fromPeriodId: p.id, available });
  }
  return sources;
}

export async function insertCreditApplication(
  db: Queryable,
  deps: RepoDeps,
  row: { kind: CreditApplicationKind; fromPeriodId: string; memberId: string; toPeriodId: string; week: number; amount: number },
): Promise<void> {
  await db.run(
    'INSERT INTO credit_applications (kind, from_period_id, member_id, to_period_id, week, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [row.kind, row.fromPeriodId, row.memberId, row.toPeriodId, row.week, row.amount, deps.now()],
  );
}

export interface MemberCarryOver {
  memberId: string;
  /** Unused credit of the member over all closed periods before this plan. */
  creditBefore: number;
  plan: CarryOverPlan;
}

/**
 * Carry-over plan for a new period with these members (N = memberIds.length). Shared by the create form preview
 * and by periods.create, so the preview equals what is saved.
 */
export async function planMemberCarryOvers(db: Queryable, memberIds: readonly string[]): Promise<MemberCarryOver[]> {
  const result: MemberCarryOver[] = [];
  for (const memberId of memberIds) {
    const sources = await loadClosedCreditSources(db, memberId);
    result.push({
      memberId,
      creditBefore: sources.reduce((sum, s) => sum + s.available, 0),
      plan: planCarryOver({ weekCount: memberIds.length, sources }),
    });
  }
  return result;
}

/** One (source period, member) pair that holds credit and can be refunded. */
export interface RefundableCredit {
  periodId: string;
  periodName: string;
  memberId: string;
  amount: number;
}

async function prepareRefund(
  db: Queryable,
  deps: RepoDeps,
  periodId: string,
  memberId: string,
  date: string,
  account: Account,
): Promise<CreditRefundPreview> {
  const period = await db.getFirst<{ status: string }>('SELECT status FROM periods WHERE id = ?', [periodId]);
  if (!period) throw new RepositoryError(`period ${periodId} not found`);
  if (period.status !== 'closed') {
    throw new RepositoryError(`period ${periodId} has not ended; its credit cannot be refunded yet`);
  }
  const member = await db.getFirst('SELECT 1 AS ok FROM period_members WHERE period_id = ? AND member_id = ?', [periodId, memberId]);
  if (!member) throw new RepositoryError(`member ${memberId} not found in period ${periodId}`);
  assertEntryDate(date, todayOf(deps));
  const available = await loadAvailableCredit(db, periodId, memberId);
  const balances: KasBalances = await loadKasBalances(db);
  return previewCreditRefund({ memberId, available, date, account: account as 'tunai' | 'debit', balances });
}

export function createCreditsRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    /** Credit that members hold from ended periods (above 0), newest period first. */
    async listRefundable(): Promise<RefundableCredit[]> {
      const rows = await db.getAll<{ period_id: string; period_name: string; member_id: string }>(
        `SELECT p.id AS period_id, p.name AS period_name, pm.member_id
           FROM periods p JOIN period_members pm ON pm.period_id = p.id
          WHERE p.status = 'closed'
          ORDER BY p.start_date DESC, p.rowid DESC, pm.initial_order`,
      );
      const result: RefundableCredit[] = [];
      for (const r of rows) {
        const amount = await loadAvailableCredit(db, r.period_id, r.member_id);
        if (amount > 0) result.push({ periodId: r.period_id, periodName: r.period_name, memberId: r.member_id, amount });
      }
      return result;
    },

    /** Credit a member still holds from one source period. */
    async getAvailable(periodId: string, memberId: string): Promise<number> {
      return loadAvailableCredit(db, periodId, memberId);
    },

    /** What refunding would do (amount = the whole remaining credit), without writing. Same checks as refund(). */
    async previewRefund(periodId: string, memberId: string, date: string, account: Account = 'tunai'): Promise<CreditRefundPreview> {
      return prepareRefund(db, deps, periodId, memberId, date, account);
    },

    /**
     * Refunds ALL remaining credit of a member from an ended period: ONE credit_refund entry (out, Tunai or Debit),
     * attached to the source period. Not correctable. Afterwards the member's credit from that period is 0.
     */
    async refund(periodId: string, memberId: string, date: string, account: Account = 'tunai'): Promise<StoredLedgerEntry> {
      return db.transaction(async (tx) => {
        const preview = await prepareRefund(tx, deps, periodId, memberId, date, account);
        return insertEntry(tx, deps, { ...preview.entry, periodId });
      });
    },
  };
}

export type CreditsRepo = ReturnType<typeof createCreditsRepo>;
