// First-run checklist on Home. Pure: Home loads the facts, this decides what is ticked and whether to show it.

export interface ChecklistInput {
  memberCount: number;
  /** An opening_balance entry that has not been corrected exists. */
  hasOpeningBalance: boolean;
  periodCount: number;
  /** At least one period has ended: the owner is past first-run. */
  hasEndedPeriod: boolean;
  /** The active period, or null when there is none. */
  activePeriod: { hasClosedMeeting: boolean; firstMeetingHasHost: boolean } | null;
}

export interface ChecklistItem {
  key: 'members' | 'period' | 'opening' | 'host';
  label: string;
  done: boolean;
}

export interface Checklist {
  /** False once everything is done, or when the owner is clearly past first-run (a meeting closed or a period ended). */
  visible: boolean;
  items: ChecklistItem[];
}

// Order follows the real dependency: an opening balance is a kas entry and kas entries need a period (owner decision 2026-11-13, B1).
export function firstRunChecklist(input: ChecklistInput): Checklist {
  const items: ChecklistItem[] = [
    { key: 'members', label: 'Tambah anggota', done: input.memberCount > 0 },
    { key: 'period', label: 'Buat periode', done: input.periodCount > 0 },
    { key: 'opening', label: 'Isi saldo awal kas', done: input.hasOpeningBalance },
    { key: 'host', label: 'Tentukan tuan rumah pertemuan 1', done: input.activePeriod?.firstMeetingHasHost ?? false },
  ];
  const pastFirstRun = input.hasEndedPeriod || (input.activePeriod?.hasClosedMeeting ?? false);
  return { visible: !pastFirstRun && items.some((i) => !i.done), items };
}
