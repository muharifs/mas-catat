// Payments repository: stores a payment together with its allocation to weekly dues.
//
// Allocation is computed ONCE, when the payment is saved, by the pure domain function allocatePayments,
// and then stored. It is never recomputed, so entering a back-dated payment later cannot move what was
// already allocated. The repository only reads/writes rows; the money rules stay in src/domain.
import { allocatePayments } from '@/domain/allocation';
import { periodWeekCount } from '@/domain/dues';
import type { Allocation, Payment, WeekCredit, WeekStatus } from '@/domain/types';
import type { Db, Queryable } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError } from './errors';

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

interface WeekAmountRow {
  week: number;
  total: number;
}

/** Stored amounts per week for one member: paid via allocations and settled via host offsets. */
export async function loadWeekAmounts(
  db: Queryable,
  periodId: string,
  memberId: string,
): Promise<{ paid: WeekCredit[]; offset: WeekCredit[] }> {
  const toCredits = (rows: WeekAmountRow[]): WeekCredit[] => rows.map((r) => ({ week: r.week, amount: r.total }));
  const paid = await db.getAll<WeekAmountRow>(
    'SELECT week, SUM(amount) AS total FROM allocations WHERE period_id = ? AND member_id = ? GROUP BY week ORDER BY week',
    [periodId, memberId],
  );
  const offset = await db.getAll<WeekAmountRow>(
    'SELECT week, SUM(amount) AS total FROM offset_credits WHERE period_id = ? AND member_id = ? GROUP BY week ORDER BY week',
    [periodId, memberId],
  );
  return { paid: toCredits(paid), offset: toCredits(offset) };
}

/** Merges paid and offset amounts into one credit per week (what is already settled). */
function combineCredits(paid: readonly WeekCredit[], offset: readonly WeekCredit[]): WeekCredit[] {
  const settled = new Map<number, number>();
  for (const c of [...paid, ...offset]) settled.set(c.week, (settled.get(c.week) ?? 0) + c.amount);
  return [...settled].map(([week, amount]) => ({ week, amount }));
}

async function loadMemberCount(db: Queryable, periodId: string): Promise<number> {
  const row = await db.getFirst<{ member_count: number }>('SELECT member_count FROM periods WHERE id = ?', [periodId]);
  if (!row) throw new RepositoryError(`period ${periodId} not found`);
  return row.member_count;
}

/**
 * Per-week state of one member's dues, built from STORED allocations and offsets.
 * `outstanding` comes from the domain function; paid/offset are the stored sums.
 */
export async function loadWeekStatuses(db: Queryable, periodId: string, memberId: string): Promise<WeekStatus[]> {
  const totalWeeks = periodWeekCount(await loadMemberCount(db, periodId));
  const { paid, offset } = await loadWeekAmounts(db, periodId, memberId);

  const credits = combineCredits(paid, offset);

  const paidByWeek = new Map(paid.map((c) => [c.week, c.amount]));
  const offsetByWeek = new Map(offset.map((c) => [c.week, c.amount]));
  return allocatePayments([], totalWeeks, credits).weeks.map((w) => ({
    ...w,
    paid: paidByWeek.get(w.week) ?? 0,
    offset: offsetByWeek.get(w.week) ?? 0,
  }));
}

export interface RecordPaymentInput {
  periodId: string;
  memberId: string;
  /** Date the money was actually paid (ISO YYYY-MM-DD). */
  date: string;
  /** Integer rupiah; must be a positive multiple of 15.000 (checked by the domain). */
  amount: number;
}

export interface RecordedPayment {
  payment: Payment;
  allocations: Allocation[];
  /** Part of the payment beyond the remaining dues (integer rupiah, 0 if none). Derived, never stored. */
  credit: number;
}

/** A payment with its derived credit: amount minus everything allocated from it. */
export interface PaymentWithCredit extends Payment {
  credit: number;
}

export function createPaymentsRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    /**
     * Saves the payment and its allocations in ONE transaction. The payment fills the oldest weeks that
     * still have room, given what is already stored (earlier allocations and host offsets are never moved).
     * The full amount is stored; whatever exceeds the remaining dues of the period is left as member credit
     * (returned in `credit`, derivable later via getCredit). Throws DomainError for an invalid amount/date
     * (e.g. not a multiple of 15.000); on any failure nothing is written.
     */
    async record(input: RecordPaymentInput): Promise<RecordedPayment> {
      const payment: Payment = {
        id: deps.newId(),
        memberId: input.memberId,
        date: input.date,
        amount: input.amount,
      };

      return db.transaction(async (tx) => {
        const totalWeeks = periodWeekCount(await loadMemberCount(tx, input.periodId));

        await tx.run('INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
          payment.id,
          input.periodId,
          payment.memberId,
          payment.date,
          payment.amount,
          deps.now(),
        ]);

        // Weeks already settled by stored allocations/offsets are passed as credits, so this one payment
        // lands on the oldest week that still has room without touching earlier allocations.
        const { paid, offset } = await loadWeekAmounts(tx, input.periodId, input.memberId);
        const credits = combineCredits(paid, offset);

        const result = allocatePayments([payment], totalWeeks, credits);
        // Any surplus (result.credit) is NOT stored: it is derived later as amount - SUM(allocations).
        for (const a of result.allocations) {
          await tx.run(
            'INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES (?, ?, ?, ?, ?, ?)',
            [a.paymentId, input.periodId, a.memberId, a.week, a.amount, a.paymentDate],
          );
        }
        return { payment, allocations: result.allocations, credit: result.credit };
      });
    },

    /** Payments of one member in the period, oldest date first. */
    async listByMember(periodId: string, memberId: string): Promise<Payment[]> {
      const rows = await db.getAll<PaymentRow>(
        'SELECT id, member_id, date, amount FROM payments WHERE period_id = ? AND member_id = ? ORDER BY date, rowid',
        [periodId, memberId],
      );
      return rows.map(toPayment);
    },

    /** Stored allocations of one member, in the order they were written (oldest week first per payment). */
    async listAllocations(periodId: string, memberId: string): Promise<Allocation[]> {
      const rows = await db.getAll<AllocationRow>(
        'SELECT payment_id, member_id, week, amount, payment_date FROM allocations WHERE period_id = ? AND member_id = ? ORDER BY rowid',
        [periodId, memberId],
      );
      return rows.map(toAllocation);
    },

    /** Allocations of a single payment (what weeks it paid, with the original payment date). */
    async getAllocationsForPayment(paymentId: string): Promise<Allocation[]> {
      const rows = await db.getAll<AllocationRow>(
        'SELECT payment_id, member_id, week, amount, payment_date FROM allocations WHERE payment_id = ? ORDER BY week',
        [paymentId],
      );
      return rows.map(toAllocation);
    },

    /** Payments with their credit (amount - allocated), oldest date first. Read-only; allocations never move. */
    async listWithCredit(periodId: string, memberId: string): Promise<PaymentWithCredit[]> {
      const rows = await db.getAll<PaymentRow & { allocated: number }>(
        `SELECT p.id, p.member_id, p.date, p.amount,
                COALESCE((SELECT SUM(a.amount) FROM allocations a WHERE a.payment_id = p.id), 0) AS allocated
           FROM payments p WHERE p.period_id = ? AND p.member_id = ? ORDER BY p.date, p.rowid`,
        [periodId, memberId],
      );
      return rows.map((r) => ({ ...toPayment(r), credit: r.amount - r.allocated }));
    },

    /** Total credit of a member in a period (integer rupiah): sum over payments of amount - allocated. */
    async getCredit(periodId: string, memberId: string): Promise<number> {
      const row = await db.getFirst<{ credit: number }>(
        `SELECT COALESCE(SUM(p.amount), 0)
                - COALESCE((SELECT SUM(a.amount) FROM allocations a WHERE a.period_id = ? AND a.member_id = ?), 0) AS credit
           FROM payments p WHERE p.period_id = ? AND p.member_id = ?`,
        [periodId, memberId, periodId, memberId],
      );
      return row?.credit ?? 0;
    },

    /** Per-week paid / offset / outstanding for one member, weeks 1..N. */
    getWeekStatuses(periodId: string, memberId: string): Promise<WeekStatus[]> {
      return loadWeekStatuses(db, periodId, memberId);
    },
  };
}

export type PaymentsRepo = ReturnType<typeof createPaymentsRepo>;
