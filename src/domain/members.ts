// Removing a member: when a member may be archived, and when one may be hard-deleted. Pure functions.
//
// - Hard delete: only a member with NO data at all (never in a period, no ledger, payment, loan or credit record).
// - Archive: a member with any history is archived instead (hidden, history stays). Rejected while the member is in
//   the active period, still owes a loan, or holds credit (Titipan). Archiving can be undone.
import { DomainError } from './money';
import type { Rupiah } from './types';

export type ArchiveBlockCode = 'in_active_period' | 'has_loan' | 'has_credit';

/** Archiving was refused. The code and amount let a screen build a precise message; message stays English. */
export class MemberArchiveError extends DomainError {
  constructor(
    public readonly code: ArchiveBlockCode,
    message: string,
    /** Remaining loan or held credit in rupiah (0 for in_active_period). */
    public readonly amount: Rupiah = 0,
  ) {
    super(message);
    this.name = 'MemberArchiveError';
  }
}

export interface ArchiveFacts {
  /** The member belongs to the active period. */
  inActivePeriod: boolean;
  /** Remaining loan over all periods after corrections (may be 0 or negative for old overpaid data). */
  loanRemaining: Rupiah;
  /** Credit held, summed over every period of the member. Any amount above 0 blocks, even a non-multiple of 15.000. */
  creditHeld: Rupiah;
}

/** Throws MemberArchiveError for the FIRST broken rule, in a fixed order: active period, then loan, then credit. */
export function assertCanArchive(facts: ArchiveFacts): void {
  if (facts.inActivePeriod) {
    throw new MemberArchiveError('in_active_period', 'member is in the active period and cannot be archived');
  }
  if (facts.loanRemaining > 0) {
    throw new MemberArchiveError(
      'has_loan',
      `member still has a remaining loan of ${facts.loanRemaining} and cannot be archived`,
      facts.loanRemaining,
    );
  }
  if (facts.creditHeld > 0) {
    throw new MemberArchiveError(
      'has_credit',
      `member still holds credit of ${facts.creditHeld} and cannot be archived`,
      facts.creditHeld,
    );
  }
}

/** Number of records that refer to a member. Every field must be 0 for a hard delete. */
export interface MemberUsage {
  periodMemberships: number;
  ledgerEntries: number;
  payments: number;
  allocations: number;
  offsetCredits: number;
  creditApplications: number;
  hostedWeeks: number;
}

export function canHardDelete(usage: MemberUsage): boolean {
  return Object.values(usage).every((n) => n === 0);
}
