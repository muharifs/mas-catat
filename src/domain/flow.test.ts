import { DomainError } from './money';
import { cashFlowSign, monthOfDate, summarizeMonth, type FlowSummaryEntry } from './flow';
import type { LedgerEntryType } from './types';

let seq = 0;
function entry(over: Partial<FlowSummaryEntry>): FlowSummaryEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    type: 'member_payment',
    direction: 'in',
    date: '2026-11-10',
    amount: 15_000,
    account: 'tunai',
    toAccount: null,
    reversesEntryId: null,
    ...over,
  };
}

const NOV = '2026-11';
const ZERO = { moneyIn: 0, moneyOut: 0 };

describe('monthOfDate', () => {
  it('reads the month from the text without a Date object', () => {
    expect(monthOfDate('2026-10-31')).toBe('2026-10');
    expect(monthOfDate('2026-11-01')).toBe('2026-11');
  });
});

describe('cashFlowSign', () => {
  it('is + for money into Tunai or Debit and - for money out', () => {
    expect(cashFlowSign({ direction: 'in', account: 'tunai', toAccount: null })).toBe('+');
    expect(cashFlowSign({ direction: 'out', account: 'debit', toAccount: null })).toBe('-');
  });
  it('is empty for moves, write-offs, no pos and Piutang', () => {
    expect(cashFlowSign({ direction: 'out', account: 'tunai', toAccount: 'debit' })).toBe('');
    expect(cashFlowSign({ direction: 'in', account: null, toAccount: null, type: 'debt_writeoff' })).toBe('');
    expect(cashFlowSign({ direction: 'in', account: null, toAccount: null })).toBe('');
    expect(cashFlowSign({ direction: 'in', account: 'piutang', toAccount: null, type: 'opening_balance' })).toBe('');
  });
});

describe('summarizeMonth', () => {
  it('returns zeros for an empty month', () => {
    expect(summarizeMonth([], NOV)).toEqual(ZERO);
    expect(summarizeMonth([entry({ date: '2026-10-05' })], NOV)).toEqual(ZERO);
  });

  it('counts member_payment and host_offset as Pemasukan', () => {
    const r = summarizeMonth([entry({ amount: 30_000 }), entry({ type: 'host_offset', amount: 45_000 })], NOV);
    expect(r).toEqual({ moneyIn: 75_000, moneyOut: 0 });
  });

  it('counts host_payout, shared_goal and credit_refund as Pengeluaran', () => {
    const r = summarizeMonth(
      [
        entry({ type: 'host_payout', direction: 'out', amount: 100_000 }),
        entry({ type: 'shared_goal', direction: 'out', amount: 65_476, account: 'debit' }),
        entry({ type: 'credit_refund', direction: 'out', amount: 7_500 }),
      ],
      NOV,
    );
    expect(r).toEqual({ moneyIn: 0, moneyOut: 172_976 });
  });

  it('does not count transfer, loan and loan repayment', () => {
    const r = summarizeMonth(
      [
        entry({ type: 'transfer', direction: 'out', account: 'tunai', toAccount: 'debit' }),
        entry({ type: 'loan', direction: 'out', account: 'tunai', toAccount: 'piutang' }),
        entry({ type: 'loan_repayment', direction: 'out', account: 'piutang', toAccount: 'tunai' }),
      ],
      NOV,
    );
    expect(r).toEqual(ZERO);
  });

  it('does not count opening balance (any pos), write-off or an entry without a pos', () => {
    const r = summarizeMonth(
      [
        entry({ type: 'opening_balance', account: 'tunai' }),
        entry({ type: 'opening_balance', account: 'piutang' }),
        entry({ type: 'debt_writeoff', account: null, direction: 'out' }),
        entry({ type: 'member_payment', account: null }),
      ],
      NOV,
    );
    expect(r).toEqual(ZERO);
  });

  it('leaves out both sides of a correction in the same month', () => {
    const original = entry({ amount: 15_000 });
    const reversal = entry({ type: 'reversal', direction: 'out', reversesEntryId: original.id });
    const other = entry({ amount: 30_000 });
    expect(summarizeMonth([original, reversal, other], NOV)).toEqual({ moneyIn: 30_000, moneyOut: 0 });
  });

  it('a correction made in a later month removes the original from its own month', () => {
    const original = entry({ date: '2026-10-20', amount: 15_000 });
    const reversal = entry({ date: '2026-11-02', type: 'reversal', direction: 'out', reversesEntryId: original.id });
    const all = [original, reversal];
    expect(summarizeMonth(all, '2026-10')).toEqual(ZERO);
    expect(summarizeMonth(all, NOV)).toEqual(ZERO);
    // Without the correction the older month still has its income.
    expect(summarizeMonth([original], '2026-10')).toEqual({ moneyIn: 15_000, moneyOut: 0 });
  });

  it('a reversal of an outgoing entry does not become a phantom Pemasukan', () => {
    const payout = entry({ type: 'host_payout', direction: 'out', amount: 90_000 });
    const reversal = entry({ type: 'reversal', direction: 'in', amount: 90_000, reversesEntryId: payout.id });
    expect(summarizeMonth([payout, reversal], NOV)).toEqual(ZERO);
  });

  it('splits months at the date text: 31 Oct vs 1 Nov', () => {
    const oct = entry({ date: '2026-10-31', amount: 15_000 });
    const nov = entry({ date: '2026-11-01', amount: 45_000 });
    expect(summarizeMonth([oct, nov], '2026-10')).toEqual({ moneyIn: 15_000, moneyOut: 0 });
    expect(summarizeMonth([oct, nov], NOV)).toEqual({ moneyIn: 45_000, moneyOut: 0 });
  });

  it('adds large amounts exactly as integers', () => {
    const r = summarizeMonth([entry({ amount: 2_000_000_000 }), entry({ amount: 1_234_567_891 })], NOV);
    expect(r.moneyIn).toBe(3_234_567_891);
  });

  it('rejects a malformed month', () => {
    expect(() => summarizeMonth([], '2026-13')).toThrow(DomainError);
    expect(() => summarizeMonth([], '2026-1')).toThrow(DomainError);
  });
});

describe('summary class matches the row sign', () => {
  const TYPES: LedgerEntryType[] = [
    'member_payment',
    'host_payout',
    'host_offset',
    'opening_balance',
    'transfer',
    'loan',
    'loan_repayment',
    'shared_goal',
    'debt_writeoff',
    'credit_refund',
    'reversal',
  ];
  const shapes: Pick<FlowSummaryEntry, 'direction' | 'account' | 'toAccount'>[] = [
    { direction: 'in', account: 'tunai', toAccount: null },
    { direction: 'out', account: 'debit', toAccount: null },
    { direction: 'out', account: 'tunai', toAccount: 'piutang' },
    { direction: 'out', account: 'piutang', toAccount: 'tunai' },
    { direction: 'in', account: 'piutang', toAccount: null },
    { direction: 'in', account: null, toAccount: null },
  ];

  it('for every type and shape the summary side equals the row sign, except opening balance and reversal', () => {
    for (const type of TYPES) {
      for (const shape of shapes) {
        const e = entry({ type, ...shape, amount: 1_000 });
        const sign = cashFlowSign(e);
        const excluded = type === 'opening_balance' || type === 'reversal';
        const expected = excluded || sign === '' ? ZERO : sign === '+' ? { moneyIn: 1_000, moneyOut: 0 } : { moneyIn: 0, moneyOut: 1_000 };
        expect(summarizeMonth([e], NOV)).toEqual(expected);
      }
    }
  });

  it('the Saldo awal row in Tunai shows "+" but is not counted (the documented exception)', () => {
    const e = entry({ type: 'opening_balance', account: 'tunai' });
    expect(cashFlowSign(e)).toBe('+');
    expect(summarizeMonth([e], NOV).moneyIn).toBe(0);
  });
});
