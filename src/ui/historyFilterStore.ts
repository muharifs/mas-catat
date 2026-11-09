// Filter chosen in Riwayat, shared with the Filter screen. A tiny module-level store (like a React context without a
// provider): the tab and the stacked Filter screen both read it with useSyncExternalStore and see the same value.
import { useSyncExternalStore } from 'react';
import { todayIso } from './dates';
import { EMPTY_FILTER, type HistoryFilter } from './history';

let current: HistoryFilter = EMPTY_FILTER;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setHistoryFilter(next: HistoryFilter): void {
  current = next;
  listeners.forEach((l) => l());
}

export function resetHistoryFilter(): void {
  setHistoryFilter(EMPTY_FILTER);
}

export function useHistoryFilter(): HistoryFilter {
  return useSyncExternalStore(subscribe, () => current);
}

// Month shown in Riwayat ("YYYY-MM"). Same pattern as the filter above. Default: the current month of the phone.
let currentMonth: string = todayIso().slice(0, 7);
const monthListeners = new Set<() => void>();

function subscribeMonth(listener: () => void): () => void {
  monthListeners.add(listener);
  return () => {
    monthListeners.delete(listener);
  };
}

export function setHistoryMonth(next: string): void {
  currentMonth = next;
  monthListeners.forEach((l) => l());
}

export function resetHistoryMonth(): void {
  setHistoryMonth(todayIso().slice(0, 7));
}

export function useHistoryMonth(): string {
  return useSyncExternalStore(subscribeMonth, () => currentMonth);
}
