import type { LedgerListItem } from '@/db/ledger';
import {
  activeFilterCount,
  dateSectionTitle,
  EMPTY_FILTER,
  entryDirection,
  entryGroup,
  filterHistory,
  groupByDate,
  historyFlowText,
  isFilterEmpty,
  previousDay,
  reversalTitle,
} from './history';

let seq = 0;
function entry(over: Partial<LedgerListItem>): LedgerListItem {
  seq += 1;
  return {
    id: `e${seq}`,
    periodId: 'p1',
    date: '2026-03-10',
    amount: 15_000,
    direction: 'in',
    type: 'member_payment',
    memberId: 'm1',
    week: null,
    note: '',
    createdAt: '2026-03-10T00:00:00.000Z',
    reversesEntryId: null,
    correctionReason: null,
    account: 'tunai',
    toAccount: null,
    reversedById: null,
    ...over,
  };
}

describe('entryGroup', () => {
  it('maps every type to a chip group', () => {
    expect(entryGroup('member_payment')).toBe('iuran');
    expect(entryGroup('host_payout')).toBe('tuan_rumah');
    expect(entryGroup('host_offset')).toBe('tuan_rumah');
    expect(entryGroup('loan')).toBe('pinjaman');
    expect(entryGroup('loan_repayment')).toBe('pinjaman');
    expect(entryGroup('transfer')).toBe('pindah');
    expect(entryGroup('shared_goal')).toBe('pengeluaran');
    expect(entryGroup('credit_refund')).toBe('pengeluaran');
    expect(entryGroup('reversal')).toBe('koreksi');
    expect(entryGroup('opening_balance')).toBe('other');
    expect(entryGroup('debt_writeoff')).toBe('other');
  });
});

describe('entryDirection', () => {
  it('is in for money entering a pos and out for money leaving it', () => {
    expect(entryDirection(entry({ direction: 'in' }))).toBe('in');
    expect(entryDirection(entry({ type: 'shared_goal', direction: 'out' }))).toBe('out');
  });
  it('is neutral for moves, loans, repayments, write-offs and old Piutang balances', () => {
    expect(entryDirection(entry({ type: 'transfer', direction: 'out', toAccount: 'debit' }))).toBe('neutral');
    expect(entryDirection(entry({ type: 'loan', direction: 'out', toAccount: 'piutang' }))).toBe('neutral');
    expect(entryDirection(entry({ type: 'loan_repayment', direction: 'out', account: 'piutang', toAccount: 'tunai' }))).toBe('neutral');
    expect(entryDirection(entry({ type: 'debt_writeoff', account: null }))).toBe('neutral');
    expect(entryDirection(entry({ type: 'opening_balance', account: 'piutang' }))).toBe('neutral');
  });
});

describe('historyFlowText', () => {
  it('words moves, write-offs and plain flows', () => {
    expect(historyFlowText(entry({ type: 'loan', direction: 'out', toAccount: 'piutang' }))).toBe('Tunai ke Piutang');
    expect(historyFlowText(entry({ type: 'debt_writeoff', account: null }))).toBe('Tidak mengubah saldo kas');
    expect(historyFlowText(entry({ direction: 'in' }))).toBe('Masuk ke Tunai');
    expect(historyFlowText(entry({ type: 'shared_goal', direction: 'out', account: 'debit' }))).toBe('Keluar dari Debit');
    expect(historyFlowText(entry({ account: null }))).toBe('Belum ada tempat uang');
  });
});

describe('reversalTitle', () => {
  it('names the type of the original', () => {
    const original = entry({ type: 'shared_goal', direction: 'out' });
    const reversal = entry({ type: 'reversal', reversesEntryId: original.id });
    expect(reversalTitle(reversal, new Map([[original.id, original]]))).toBe('Koreksi: Pengeluaran bersama');
    expect(reversalTitle(reversal, new Map())).toBe('Koreksi: catatan');
  });
});

describe('dates', () => {
  it('finds the previous day across month and year ends', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });
  it('titles today, yesterday and older dates', () => {
    expect(dateSectionTitle('2026-03-10', '2026-03-10')).toBe('Hari ini');
    expect(dateSectionTitle('2026-03-09', '2026-03-10')).toBe('Kemarin');
    expect(dateSectionTitle('2026-03-03', '2026-03-10')).toBe('3 Mar 2026');
  });
});

describe('groupByDate', () => {
  it('groups by date, newest first, keeping the input order inside a date', () => {
    const a = entry({ date: '2026-03-09' });
    const b = entry({ date: '2026-03-10' });
    const c = entry({ date: '2026-03-09' });
    const d = entry({ date: '2026-03-01' });
    const sections = groupByDate([a, b, c, d], '2026-03-10');
    expect(sections.map((s) => s.title)).toEqual(['Hari ini', 'Kemarin', '1 Mar 2026']);
    expect(sections[1]?.data.map((e) => e.id)).toEqual([a.id, c.id]);
  });
  it('returns nothing for no entries', () => {
    expect(groupByDate([], '2026-03-10')).toEqual([]);
  });
});

describe('filterHistory', () => {
  const pay = entry({ type: 'member_payment', memberId: 'm1' });
  const payOther = entry({ type: 'member_payment', memberId: 'm2', periodId: 'p2' });
  const goal = entry({ type: 'shared_goal', direction: 'out', account: 'debit', memberId: null });
  const move = entry({ type: 'transfer', direction: 'out', account: 'tunai', toAccount: 'debit', memberId: null });
  const opening = entry({ type: 'opening_balance', memberId: null });
  const wrong = entry({ type: 'member_payment', memberId: 'm1' });
  const reversal = entry({ type: 'reversal', direction: 'out', memberId: 'm1', reversesEntryId: wrong.id });
  const corrected: LedgerListItem = { ...wrong, reversedById: reversal.id };
  const all = [pay, payOther, goal, move, opening, corrected, reversal];

  it('keeps everything with an empty filter', () => {
    expect(filterHistory(all, EMPTY_FILTER)).toEqual(all);
    expect(isFilterEmpty(EMPTY_FILTER)).toBe(true);
  });
  it('a type chip also shows that type corrections', () => {
    const ids = filterHistory(all, { ...EMPTY_FILTER, group: 'iuran' }).map((e) => e.id);
    expect(ids).toEqual([pay.id, payOther.id, corrected.id, reversal.id]);
  });
  it('the Koreksi chip shows reversals and corrected entries only', () => {
    const ids = filterHistory(all, { ...EMPTY_FILTER, group: 'koreksi' }).map((e) => e.id);
    expect(ids).toEqual([corrected.id, reversal.id]);
  });
  it('other chips do not show corrections of other types', () => {
    expect(filterHistory(all, { ...EMPTY_FILTER, group: 'pengeluaran' })).toEqual([goal]);
  });
  it('filters by member, pos (source or destination), period and type', () => {
    expect(filterHistory(all, { ...EMPTY_FILTER, memberId: 'm2' })).toEqual([payOther]);
    expect(filterHistory(all, { ...EMPTY_FILTER, account: 'debit' }).map((e) => e.id)).toEqual([goal.id, move.id]);
    expect(filterHistory(all, { ...EMPTY_FILTER, periodId: 'p2' })).toEqual([payOther]);
    expect(filterHistory(all, { ...EMPTY_FILTER, type: 'transfer' })).toEqual([move]);
    expect(filterHistory(all, { ...EMPTY_FILTER, type: 'member_payment' }).map((e) => e.id)).toContain(reversal.id);
  });
  it('combines conditions and can match nothing', () => {
    expect(filterHistory(all, { ...EMPTY_FILTER, group: 'iuran', memberId: 'm2' })).toEqual([payOther]);
    expect(filterHistory(all, { ...EMPTY_FILTER, group: 'pinjaman' })).toEqual([]);
  });
  it('counts filters but not the chip', () => {
    expect(activeFilterCount({ ...EMPTY_FILTER, group: 'iuran' })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, memberId: 'm1', account: 'tunai' })).toBe(2);
    expect(isFilterEmpty({ ...EMPTY_FILTER, group: 'iuran' })).toBe(false);
  });
});
