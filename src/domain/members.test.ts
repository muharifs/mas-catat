import { assertCanArchive, canHardDelete, MemberArchiveError, type MemberUsage } from './members';
import { DomainError } from './money';

const free = { inActivePeriod: false, loanRemaining: 0, creditHeld: 0 };
const codeOf = (facts: Parameters<typeof assertCanArchive>[0]) => {
  try {
    assertCanArchive(facts);
    return 'ok';
  } catch (e) {
    if (e instanceof MemberArchiveError) return e.code;
    throw e;
  }
};

describe('assertCanArchive', () => {
  it('allows a member with no blockers', () => {
    expect(codeOf(free)).toBe('ok');
  });

  it('rejects each blocker', () => {
    expect(codeOf({ ...free, inActivePeriod: true })).toBe('in_active_period');
    expect(codeOf({ ...free, loanRemaining: 1 })).toBe('has_loan');
    expect(codeOf({ ...free, creditHeld: 1 })).toBe('has_credit'); // any credit blocks, even a non-multiple of 15.000
  });

  it('reports the FIRST broken rule: active period, then loan, then credit', () => {
    expect(codeOf({ inActivePeriod: true, loanRemaining: 5_000, creditHeld: 5_000 })).toBe('in_active_period');
    expect(codeOf({ inActivePeriod: false, loanRemaining: 5_000, creditHeld: 5_000 })).toBe('has_loan');
    expect(codeOf({ inActivePeriod: false, loanRemaining: 0, creditHeld: 5_000 })).toBe('has_credit');
  });

  it('carries the amount, and is a DomainError', () => {
    expect(() => assertCanArchive({ ...free, loanRemaining: 40_000 })).toThrow(DomainError);
    try {
      assertCanArchive({ ...free, creditHeld: 7_500 });
    } catch (e) {
      expect(e).toMatchObject({ code: 'has_credit', amount: 7_500 });
    }
  });

  it('does not block old overpaid data (negative remaining loan)', () => {
    expect(codeOf({ ...free, loanRemaining: -10_000 })).toBe('ok');
  });
});

describe('canHardDelete', () => {
  const none: MemberUsage = {
    periodMemberships: 0,
    ledgerEntries: 0,
    payments: 0,
    allocations: 0,
    offsetCredits: 0,
    creditApplications: 0,
    hostedWeeks: 0,
  };

  it('is true only when nothing refers to the member', () => {
    expect(canHardDelete(none)).toBe(true);
  });

  it.each(Object.keys(none) as (keyof MemberUsage)[])('is false when %s is above 0', (field) => {
    expect(canHardDelete({ ...none, [field]: 1 })).toBe(false);
  });
});
