// Shared domain types. Pure data only: no React, Expo or SQLite imports.
// All amounts are integer rupiah. All dates are ISO calendar dates ("YYYY-MM-DD").

export type Rupiah = number;
export type IsoDate = string;

/** A payment record made by one member. It may be advance, late or partial. */
export interface Payment {
  id: string;
  memberId: string;
  date: IsoDate;
  amount: Rupiah;
}

/** Part of one payment applied to one weekly due. Keeps the original payment date. */
export interface Allocation {
  paymentId: string;
  memberId: string;
  /** Week number (1-based) whose due this amount was applied to. */
  week: number;
  amount: Rupiah;
  /** Date the payment was actually made (not the date of the week). */
  paymentDate: IsoDate;
  /**
   * Set by the repository when the allocation targets a skipped meeting: the row stays (append-only) but it no longer
   * counts, its amount is member credit. Absent for a normal allocation.
   */
  skipped?: boolean;
}

/** Portion of a weekly due already settled by a host payout offset. */
export interface WeekCredit {
  week: number;
  amount: Rupiah;
}

/**
 * State of one member's due for one week. Invariant: due = paid + offset + credited + outstanding.
 * `credited` is settled by member credit (carried over from an earlier period, or used at period close).
 */
export interface WeekStatus {
  week: number;
  due: Rupiah;
  paid: Rupiah;
  offset: Rupiah;
  credited: Rupiah;
  outstanding: Rupiah;
  /**
   * True for the meeting that is skipped (decision 33): nothing is due, so due, paid, offset, credited and
   * outstanding are all 0. Absent means a normal meeting.
   */
  skipped?: boolean;
}

export interface UnpaidWeek {
  week: number;
  amount: Rupiah;
}

/**
 * Ledger entry types. Move types (transfer, loan, loan_repayment) are ONE entry with account (source) and
 * toAccount (destination). 'reversal' cancels an earlier entry (see reversal.ts).
 */
export type LedgerEntryType =
  | 'member_payment'
  | 'host_payout'
  | 'host_offset'
  | 'opening_balance'
  | 'transfer'
  | 'loan'
  | 'loan_repayment'
  | 'shared_goal'
  | 'debt_writeoff'
  | 'credit_refund'
  | 'reversal';

/** Kas pos (account): Tunai (cash), Debit (bank/e-wallet), Piutang (lent to members). */
export type Account = 'tunai' | 'debit' | 'piutang';

/** Append-only ledger entry. amount is always > 0; direction gives the sign. */
export interface LedgerEntry {
  type: LedgerEntryType;
  direction: 'in' | 'out';
  date: IsoDate;
  amount: Rupiah;
  memberId: string | null;
  week: number | null;
  note: string;
  /** Pos the money moves in or out of. Optional: entries from before migration 0002 have none. */
  account?: Account | null;
  /** Destination pos of a move entry (transfer, loan, repayment); null for every other entry. */
  toAccount?: Account | null;
}
