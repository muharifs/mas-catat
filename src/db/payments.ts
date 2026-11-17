// Payments repository: stores a payment together with its allocation to weekly dues and its ledger entry.
//
// Allocation is computed ONCE, when the payment is saved, by the pure domain function allocatePayments,
// and then stored. It is never recomputed, so entering a back-dated payment later cannot move what was
// already allocated. The repository only reads/writes rows; the money rules stay in src/domain.
import { memberBalance } from '@/domain/dues';
import { assertPaymentCorrectable } from '@/domain/payment-correction';
import { buildReversal, requireReason } from '@/domain/reversal';
import { assertPaymentDate, previewPayment, type PaymentPreview } from '@/domain/payment-preview';
import type { Account, Allocation, Payment, WeekStatus } from '@/domain/types';
import type { Db, Queryable } from './db';
import { defaultDeps, todayOf, type RepoDeps } from './deps';
import { RepositoryError } from './errors';
import { loadAvailableCredit } from './credits';
import { insertEntry, loadEntry, requireActivePeriod, type StoredLedgerEntry } from './ledger';
import { loadCurrentWeek, loadSkippedWeekNumbers, loadStandingPayoutWeeksOfHost, loadWeekStatuses } from './weeks';

export { loadWeekAmounts, loadWeekStatuses } from './weeks';

interface PaymentRow {
  id: string;
  member_id: string;
  date: string;
  amount: number;
}

interface AllocationRow {
  payment_id: string;
  member_id: string;
  week: number;
  amount: number;
  payment_date: string;
}

const toPayment = (r: PaymentRow): Payment => ({ id: r.id, memberId: r.member_id, date: r.date, amount: r.amount });

const toAllocation = (r: AllocationRow): Allocation => ({
  paymentId: r.payment_id,
  memberId: r.member_id,
  week: r.week,
  amount: r.amount,
  paymentDate: r.payment_date,
});

export interface RecordPaymentInput {
  periodId: string;
  memberId: string;
  /** Date the money was actually paid (ISO YYYY-MM-DD). Past or today, never the future. */
  date: string;
  /** Integer rupiah; must be a positive multiple of 15.000 (checked by the domain). */
  amount: number;
  /** Pos that receives the money. Credit money enters it too (the WHOLE amount is cash received). */
  account: Extract<Account, 'tunai' | 'debit'>;
}

/** A payment found through its ledger entry (see getByLedgerEntry). */
export interface PaymentOfEntry {
  payment: Payment;
  /** Weeks this payment paid, with the original payment date. Kept after a correction, but no longer counted. */
  allocations: Allocation[];
  /** Amount beyond the allocations (Titipan). 0 for a corrected payment. */
  credit: number;
  reversed: boolean;
}

export type PreviewPaymentInput = Omit<RecordPaymentInput, 'account'>;

export interface RecordedPayment {
  payment: Payment;
  allocations: Allocation[];
  /** Part of the payment beyond the remaining dues (integer rupiah, 0 if none). Derived, never stored. */
  credit: number;
}

/** A payment with its derived credit: amount minus everything allocated from it. */
export interface PaymentWithCredit extends Payment {
  /** Amount beyond the allocations. Always 0 for a corrected payment. */
  credit: number;
  /** True when the payment was corrected (reversed). It stays visible but counts for nothing. */
  reversed: boolean;
  reversalReason: string | null;
  /** When the payment was recorded (ISO UTC, created_at). Display only: the domain Payment does not carry it. */
  createdAt: string;
}

/** One member's position in a period, counted through the current week (the oldest open week). */
export interface MemberPaymentBalance {
  memberId: string;
  throughWeek: number;
  /** Unpaid dues of weeks 1..throughWeek. */
  arrears: number;
  /** Paid or offset amount already covering weeks after throughWeek. */
  prepaid: number;
  /** Money received beyond the period's dues (held for the next period). */
  credit: number;
}

export interface ArrearsSummary {
  throughWeek: number;
  membersInArrears: number;
  totalArrears: number;
}

/** An allocation to a skipped meeting does not count: its amount is member credit (decision 33). */
const NOT_SKIPPED = 'NOT EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = a.period_id AND k.week = a.week)';

/** Marks the allocations that target a skipped meeting. The rows are kept (append-only) but no longer count. */
async function flagSkipped(db: Queryable, periodId: string, allocations: Allocation[]): Promise<Allocation[]> {
  const skipped = new Set(await loadSkippedWeekNumbers(db, periodId));
  if (skipped.size === 0) return allocations;
  return allocations.map((a) => (skipped.has(a.week) ? { ...a, skipped: true } : a));
}

/** Shared by preview and record, so both reject exactly the same things. Reads through the given handle. */
async function validateAndPreview(
  db: Queryable,
  deps: RepoDeps,
  input: PreviewPaymentInput,
  paymentId: string,
): Promise<{ payment: Payment; preview: PaymentPreview }> {
  const period = await db.getFirst<{ status: string }>('SELECT status FROM periods WHERE id = ?', [input.periodId]);
  if (!period) throw new RepositoryError(`period ${input.periodId} not found`);
  if (period.status !== 'active') {
    throw new RepositoryError(`period ${input.periodId} has ended; payments are not accepted`);
  }
  assertPaymentDate(input.date, todayOf(deps));
  const member = await db.getFirst('SELECT 1 AS ok FROM period_members WHERE period_id = ? AND member_id = ?', [
    input.periodId,
    input.memberId,
  ]);
  if (!member) throw new RepositoryError(`member ${input.memberId} not found in period ${input.periodId}`);
  const payment: Payment = { id: paymentId, memberId: input.memberId, date: input.date, amount: input.amount };
  const statuses = await loadWeekStatuses(db, input.periodId, input.memberId);
  return { payment, preview: previewPayment(payment, statuses) };
}

export function createPaymentsRepo(db: Db, deps: RepoDeps = defaultDeps) {
  const repo = {
    /**
     * What recording this payment would do, without writing anything. Uses the same validation and the same
     * domain function as record(), so the saved result equals this preview (unless data changed in between).
     */
    async preview(input: PreviewPaymentInput): Promise<PaymentPreview> {
      return (await validateAndPreview(db, deps, input, 'preview')).preview;
    },

    /**
     * Saves the payment in ONE transaction: the payment row, its allocations and ONE member_payment ledger
     * entry for the WHOLE amount (credit included) into the chosen pos. The payment fills the oldest weeks that
     * still have room (earlier allocations and host offsets are never moved); whatever exceeds the remaining
     * dues is member credit (returned in `credit`, derivable later via getCredit).
     * Rejected, with nothing written: ended period, future or invalid date, amount that is not a positive
     * multiple of 15.000, unknown member, pos other than tunai/debit.
     */
    async record(input: RecordPaymentInput): Promise<RecordedPayment> {
      if (input.account !== 'tunai' && input.account !== 'debit') {
        throw new RepositoryError('receiving account must be tunai or debit');
      }
      return db.transaction(async (tx) => {
        const { payment, preview } = await validateAndPreview(tx, deps, input, deps.newId());

        // The ledger entry goes first so the payment row can point at it (payments.ledger_entry_id). Week is null
        // on purpose: one payment can span several weeks; the detail lives in allocations.
        const entry = await insertEntry(tx, deps, {
          periodId: input.periodId,
          type: 'member_payment',
          direction: 'in',
          date: payment.date,
          amount: payment.amount,
          memberId: payment.memberId,
          week: null,
          note: '',
          account: input.account,
        });
        await tx.run(
          'INSERT INTO payments (id, period_id, member_id, date, amount, created_at, ledger_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [payment.id, input.periodId, payment.memberId, payment.date, payment.amount, deps.now(), entry.id],
        );
        // Any surplus (preview.creditAmount) is NOT stored: it is derived later as amount - SUM(allocations).
        for (const a of preview.allocations) {
          await tx.run(
            'INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES (?, ?, ?, ?, ?, ?)',
            [a.paymentId, input.periodId, a.memberId, a.week, a.amount, a.paymentDate],
          );
        }
        return { payment, allocations: preview.allocations, credit: preview.creditAmount };
      });
    },

    /** Arrears, prepaid and credit of every member of the period, through the current week. */
    async listBalances(periodId: string): Promise<MemberPaymentBalance[]> {
      const members = await db.getAll<{ member_id: string }>(
        'SELECT member_id FROM period_members WHERE period_id = ? ORDER BY initial_order',
        [periodId],
      );
      const throughWeek = await loadCurrentWeek(db, periodId);
      const result: MemberPaymentBalance[] = [];
      for (const m of members) {
        const statuses = await loadWeekStatuses(db, periodId, m.member_id);
        const balance = memberBalance(statuses, throughWeek);
        result.push({
          memberId: m.member_id,
          throughWeek,
          arrears: balance.outstanding,
          prepaid: balance.prepaid,
          credit: await repo.getCredit(periodId, m.member_id),
        });
      }
      return result;
    },

    /** How many members are behind and by how much in total, through the current week. */
    async getArrearsSummary(periodId: string): Promise<ArrearsSummary> {
      const balances = await repo.listBalances(periodId);
      const throughWeek = await loadCurrentWeek(db, periodId);
      return {
        throughWeek,
        membersInArrears: balances.filter((b) => b.arrears > 0).length,
        totalArrears: balances.reduce((sum, b) => sum + b.arrears, 0),
      };
    },

    /** Payments of one member in the period, oldest date first. */
    async listByMember(periodId: string, memberId: string): Promise<Payment[]> {
      const rows = await db.getAll<PaymentRow>(
        'SELECT id, member_id, date, amount FROM payments WHERE period_id = ? AND member_id = ? ORDER BY date, rowid',
        [periodId, memberId],
      );
      return rows.map(toPayment);
    },

    /**
     * Ids of the members who have a valid payment dated exactly `date` in this period. Corrected (reversed) payments
     * do not count, so correcting today's payment frees the member again. Read-only; no money is computed.
     */
    async listMemberIdsPaidOn(periodId: string, date: string): Promise<string[]> {
      const rows = await db.getAll<{ member_id: string }>(
        `SELECT DISTINCT p.member_id
           FROM payments p LEFT JOIN payment_reversals pr ON pr.payment_id = p.id
          WHERE p.period_id = ? AND p.date = ? AND pr.payment_id IS NULL`,
        [periodId, date],
      );
      return rows.map((r) => r.member_id);
    },

    /** Stored allocations of one member, in the order they were written (oldest week first per payment). */
    async listAllocations(periodId: string, memberId: string): Promise<Allocation[]> {
      const rows = await db.getAll<AllocationRow>(
        'SELECT payment_id, member_id, week, amount, payment_date FROM allocations WHERE period_id = ? AND member_id = ? ORDER BY rowid',
        [periodId, memberId],
      );
      return flagSkipped(db, periodId, rows.map(toAllocation));
    },

    /** Allocations of a single payment (what weeks it paid, with the original payment date). */
    async getAllocationsForPayment(paymentId: string): Promise<Allocation[]> {
      const rows = await db.getAll<AllocationRow>(
        'SELECT payment_id, member_id, week, amount, payment_date FROM allocations WHERE payment_id = ? ORDER BY week',
        [paymentId],
      );
      const period = await db.getFirst<{ period_id: string }>('SELECT period_id FROM payments WHERE id = ?', [paymentId]);
      return period ? flagSkipped(db, period.period_id, rows.map(toAllocation)) : rows.map(toAllocation);
    },

    /**
     * The payment behind a member_payment ledger entry (payments.ledger_entry_id), with the weeks it paid and the
     * part that became credit. Read-only. A corrected payment keeps its allocations but reports credit 0 and
     * `reversed: true`. Returns null when no payment points at the entry (any other entry type).
     */
    async getByLedgerEntry(ledgerEntryId: string): Promise<PaymentOfEntry | null> {
      const row = await db.getFirst<PaymentRow & { reversal_reason: string | null; allocated: number }>(
        `SELECT p.id, p.member_id, p.date, p.amount, pr.reason AS reversal_reason,
                COALESCE((SELECT SUM(a.amount) FROM allocations a WHERE a.payment_id = p.id AND ${NOT_SKIPPED}), 0) AS allocated
           FROM payments p LEFT JOIN payment_reversals pr ON pr.payment_id = p.id
          WHERE p.ledger_entry_id = ?`,
        [ledgerEntryId],
      );
      if (!row) return null;
      const reversed = row.reversal_reason !== null;
      return {
        payment: toPayment(row),
        allocations: await repo.getAllocationsForPayment(row.id),
        credit: reversed ? 0 : row.amount - row.allocated,
        reversed,
      };
    },

    /**
     * Payments with their credit (amount - allocated), oldest date first. Read-only; allocations never move.
     * Corrected payments are included (marked reversed, credit 0) so the history stays complete.
     */
    async listWithCredit(periodId: string, memberId: string): Promise<PaymentWithCredit[]> {
      const rows = await db.getAll<PaymentRow & { allocated: number; reversal_reason: string | null; created_at: string }>(
        `SELECT p.id, p.member_id, p.date, p.amount, p.created_at, pr.reason AS reversal_reason,
                COALESCE((SELECT SUM(a.amount) FROM allocations a WHERE a.payment_id = p.id AND ${NOT_SKIPPED}), 0) AS allocated
           FROM payments p LEFT JOIN payment_reversals pr ON pr.payment_id = p.id
          WHERE p.period_id = ? AND p.member_id = ? ORDER BY p.date, p.rowid`,
        [periodId, memberId],
      );
      return rows.map((r) => ({
        ...toPayment(r),
        credit: r.reversal_reason === null ? r.amount - r.allocated : 0,
        reversed: r.reversal_reason !== null,
        reversalReason: r.reversal_reason,
        createdAt: r.created_at,
      }));
    },

    /**
     * Credit a member holds from a period (integer rupiah): payments minus allocations (corrected payments count
     * for nothing), minus credit already applied (close, carry-over) and refunded. In an active period nothing is
     * applied or refunded yet, so it is simply the surplus of the payments.
     */
    async getCredit(periodId: string, memberId: string): Promise<number> {
      return loadAvailableCredit(db, periodId, memberId);
    },

    /**
     * Corrects a wrong payment in ONE transaction: appends the reversal of its ledger entry (same pos, opposite
     * direction) and records the payment as reversed. Its allocations stay in the table but stop counting, so
     * those dues are unpaid again; other payments' allocations do not move. The correct payment is then entered
     * through record(). Only in an active period, only once, reason required.
     */
    async reverse(paymentId: string, reason: string): Promise<StoredLedgerEntry> {
      const cleanReason = requireReason(reason);
      return db.transaction(async (tx) => {
        const payment = await tx.getFirst<{ period_id: string; member_id: string; ledger_entry_id: string | null }>(
          'SELECT period_id, member_id, ledger_entry_id FROM payments WHERE id = ?',
          [paymentId],
        );
        if (!payment) throw new RepositoryError(`payment ${paymentId} not found`);
        await requireActivePeriod(tx, payment.period_id, 'a correction');
        const done = await tx.getFirst('SELECT 1 AS ok FROM payment_reversals WHERE payment_id = ?', [paymentId]);
        if (done) throw new RepositoryError(`payment ${paymentId} is already corrected`);
        if (!payment.ledger_entry_id) throw new RepositoryError(`payment ${paymentId} has no ledger entry to reverse`);
        // B3: not while the payer's own host payout stands in this period (nothing is written before this check).
        assertPaymentCorrectable(await loadStandingPayoutWeeksOfHost(tx, payment.period_id, payment.member_id));
        const entry = await loadEntry(tx, payment.ledger_entry_id);
        if (!entry) throw new RepositoryError(`ledger entry ${payment.ledger_entry_id} not found`);
        if (entry.reversedById) throw new RepositoryError(`payment ${paymentId} is already corrected`);

        const reversal = buildReversal(entry, { reason: cleanReason, date: todayOf(deps) });
        const stored = await insertEntry(tx, deps, { ...reversal, periodId: payment.period_id });
        await tx.run('INSERT INTO payment_reversals (payment_id, reversal_entry_id, reason, created_at) VALUES (?, ?, ?, ?)', [
          paymentId,
          stored.id,
          cleanReason,
          deps.now(),
        ]);
        return stored;
      });
    },

    /**
     * Meetings this member hosted in the period whose payout stands. Not empty = the member's payments cannot be
     * corrected yet (see reverse); the UI uses it to disable "Koreksi" before the form opens.
     */
    getStandingHostPayoutWeeks(periodId: string, memberId: string): Promise<number[]> {
      return loadStandingPayoutWeeksOfHost(db, periodId, memberId);
    },

    /** Per-week paid / offset / outstanding for one member, weeks 1..N. */
    getWeekStatuses(periodId: string, memberId: string): Promise<WeekStatus[]> {
      return loadWeekStatuses(db, periodId, memberId);
    },
  };
  return repo;
}

export type PaymentsRepo = ReturnType<typeof createPaymentsRepo>;
