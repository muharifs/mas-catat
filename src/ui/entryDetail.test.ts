import type { Allocation } from '@/domain/types';
import { entryStatus, loanMemberOf, paidMeetingRows } from './entryDetail';

describe('entryStatus', () => {
  it('names the three states in words', () => {
    expect(entryStatus({ type: 'member_payment', reversedById: null })).toEqual({ label: 'Berlaku', tone: 'neutral' });
    expect(entryStatus({ type: 'loan', reversedById: 'r1' })).toEqual({ label: 'Dikoreksi', tone: 'error' });
    expect(entryStatus({ type: 'reversal', reversedById: null })).toEqual({ label: 'Koreksi', tone: 'warn' });
  });
});

describe('loanMemberOf', () => {
  it('returns the member for loans, repayments and named Piutang opening balances', () => {
    expect(loanMemberOf({ type: 'loan', memberId: 'a', account: 'piutang' }, null)).toBe('a');
    expect(loanMemberOf({ type: 'loan_repayment', memberId: 'a', account: 'tunai' }, null)).toBe('a');
    expect(loanMemberOf({ type: 'opening_balance', memberId: 'a', account: 'piutang' }, null)).toBe('a');
  });

  it('returns null for other entries and for unnamed old loans', () => {
    expect(loanMemberOf({ type: 'transfer', memberId: null, account: 'tunai' }, null)).toBeNull();
    expect(loanMemberOf({ type: 'opening_balance', memberId: 'a', account: 'tunai' }, null)).toBeNull();
    expect(loanMemberOf({ type: 'opening_balance', memberId: null, account: 'piutang' }, null)).toBeNull();
    expect(loanMemberOf({ type: 'member_payment', memberId: 'a', account: 'tunai' }, null)).toBeNull();
  });

  it('follows the original for a reversal', () => {
    const original = { type: 'loan' as const, memberId: 'a', account: 'piutang' as const };
    expect(loanMemberOf({ type: 'reversal', memberId: 'a', account: 'piutang' }, original)).toBe('a');
    expect(loanMemberOf({ type: 'reversal', memberId: null, account: 'piutang' }, original)).toBe('a');
    const cash = { type: 'shared_goal' as const, memberId: null, account: 'tunai' as const };
    expect(loanMemberOf({ type: 'reversal', memberId: null, account: 'tunai' }, cash)).toBeNull();
    expect(loanMemberOf({ type: 'reversal', memberId: 'a', account: 'piutang' }, null)).toBeNull();
  });
});

describe('paidMeetingRows', () => {
  const alloc = (week: number, amount: number): Allocation => ({ paymentId: 'p', memberId: 'm', week, amount, paymentDate: '2026-02-10' });

  it('lists meetings oldest first with their amount', () => {
    expect(paidMeetingRows([alloc(3, 15000), alloc(1, 5000)])).toEqual([
      { week: 1, amount: 5000, label: 'Pertemuan 1' },
      { week: 3, amount: 15000, label: 'Pertemuan 3' },
    ]);
  });

  it('is empty when the payment paid no meeting (all credit)', () => {
    expect(paidMeetingRows([])).toEqual([]);
  });
});
