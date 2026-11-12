// Riwayat (history) helpers. Pure: grouping, filtering and display direction of kas entries. No money is computed
// here; amounts are only passed through. Display only, the ledger itself is untouched.
import { cashFlowSign } from '@/domain/flow';
import { ACCOUNT_LABELS } from '@/domain/kas';
import type { Account, LedgerEntryType } from '@/domain/types';
import type { LedgerListItem } from '@/db/ledger';
import { formatDate } from './dates';
import { TYPE_LABELS } from './kasLabels';

/** Chip groups of Riwayat. 'other' has no chip (opening balance, write-off): it shows under "Semua" only. */
export type EntryGroup = 'iuran' | 'tuan_rumah' | 'pinjaman' | 'pindah' | 'pengeluaran' | 'koreksi' | 'other';
export type ChipGroup = Exclude<EntryGroup, 'other'>;

export const GROUP_CHIPS: readonly { group: ChipGroup; label: string }[] = [
  { group: 'iuran', label: 'Iuran' },
  { group: 'tuan_rumah', label: 'Tuan rumah' },
  { group: 'pinjaman', label: 'Pinjaman' },
  { group: 'pindah', label: 'Pindah saldo' },
  { group: 'pengeluaran', label: 'Pengeluaran' },
  { group: 'koreksi', label: 'Koreksi' },
];

const GROUP_OF_TYPE: Record<LedgerEntryType, EntryGroup> = {
  member_payment: 'iuran',
  host_payout: 'tuan_rumah',
  host_offset: 'tuan_rumah',
  loan: 'pinjaman',
  loan_repayment: 'pinjaman',
  transfer: 'pindah',
  shared_goal: 'pengeluaran',
  credit_refund: 'pengeluaran',
  reversal: 'koreksi',
  opening_balance: 'other',
  debt_writeoff: 'other',
};

/** Chip group of an entry type. */
export function entryGroup(type: LedgerEntryType): EntryGroup {
  return GROUP_OF_TYPE[type];
}

export type EntryDirection = 'in' | 'out' | 'neutral';

type FlowFields = Pick<LedgerListItem, 'type' | 'direction' | 'account' | 'toAccount'>;

/**
 * How the amount is shown: money in (green +), money out (red -), or neutral (no sign): moves between pos, loans,
 * repayments, write-offs, entries without a pos, and an old Piutang opening balance (an old loan, not cash).
 */
export function entryDirection(e: FlowFields): EntryDirection {
  const sign = cashFlowSign(e);
  return sign === '+' ? 'in' : sign === '-' ? 'out' : 'neutral';
}

/** Second-line flow text. Moves read "Tunai ke Debit" (no ASCII arrow: TalkBack would read it aloud); a write-off "Tidak mengubah saldo kas". */
export function historyFlowText(e: FlowFields): string {
  if (e.type === 'debt_writeoff') return 'Tidak mengubah saldo kas';
  if (e.account === null) return 'Belum ada tempat uang';
  if (e.toAccount) return `${ACCOUNT_LABELS[e.account]} ke ${ACCOUNT_LABELS[e.toAccount]}`;
  if (e.account === 'piutang') return 'Piutang';
  return e.direction === 'in' ? `Masuk ke ${ACCOUNT_LABELS[e.account]}` : `Keluar dari ${ACCOUNT_LABELS[e.account]}`;
}

/** Title of a reversal row: "Koreksi: <type of the original>". */
export function reversalTitle(e: LedgerListItem, byId: ReadonlyMap<string, LedgerListItem>): string {
  const original = e.reversesEntryId ? byId.get(e.reversesEntryId) : undefined;
  return `Koreksi: ${original ? TYPE_LABELS[original.type] : 'catatan'}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Grouping by date

export interface DateSection {
  /** ISO date of the section. */
  date: string;
  title: string;
  data: LedgerListItem[];
}

/** The calendar day before an ISO date ("2026-03-01" gives "2026-02-28"). */
export function previousDay(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** "Hari ini", "Kemarin", otherwise the full date. */
export function dateSectionTitle(date: string, today: string): string {
  if (date === today) return 'Hari ini';
  if (date === previousDay(today)) return 'Kemarin';
  return formatDate(date);
}

/** Groups entries by date, newest date first; the order inside a date is the order of the input. */
export function groupByDate(entries: readonly LedgerListItem[], today: string): DateSection[] {
  const sections = new Map<string, LedgerListItem[]>();
  for (const e of entries) {
    const list = sections.get(e.date);
    if (list) list.push(e);
    else sections.set(e.date, [e]);
  }
  return [...sections.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, data]) => ({ date, title: dateSectionTitle(date, today), data }));
}

// ---------------------------------------------------------------------------------------------------------------
// Filtering

export interface HistoryFilter {
  /** Chip: null = Semua. */
  group: ChipGroup | null;
  memberId: string | null;
  account: Account | null;
  periodId: string | null;
  type: LedgerEntryType | null;
}

export const EMPTY_FILTER: HistoryFilter = { group: null, memberId: null, account: null, periodId: null, type: null };

/** Number of filters in force, for the "Filter (n)" button. The chip is its own control and is not counted. */
export function activeFilterCount(f: HistoryFilter): number {
  return [f.memberId, f.account, f.periodId, f.type].filter((v) => v !== null).length;
}

/** True when nothing narrows the list (no chip and no filter). */
export function isFilterEmpty(f: HistoryFilter): boolean {
  return f.group === null && activeFilterCount(f) === 0;
}

/**
 * Keeps the entries that match every chosen condition. A reversal also counts as the type of the entry it cancels, so a
 * type chip (or the Jenis filter) shows that type's corrections too. The chip "Koreksi" shows the reversals and the
 * entries that were corrected. The input order is kept.
 */
export function filterHistory(entries: readonly LedgerListItem[], f: HistoryFilter): LedgerListItem[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const typesOf = (e: LedgerListItem): LedgerEntryType[] => {
    if (e.type !== 'reversal') return [e.type];
    const original = e.reversesEntryId ? byId.get(e.reversesEntryId) : undefined;
    return original ? ['reversal', original.type] : ['reversal'];
  };
  return entries.filter((e) => {
    const types = typesOf(e);
    if (f.group !== null) {
      const inGroup =
        f.group === 'koreksi' ? e.type === 'reversal' || e.reversedById !== null : types.some((t) => entryGroup(t) === f.group);
      if (!inGroup) return false;
    }
    if (f.type !== null && !types.includes(f.type)) return false;
    if (f.memberId !== null && e.memberId !== f.memberId) return false;
    if (f.account !== null && e.account !== f.account && e.toAccount !== f.account) return false;
    if (f.periodId !== null && e.periodId !== f.periodId) return false;
    return true;
  });
}
