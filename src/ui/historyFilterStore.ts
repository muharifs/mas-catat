// Filter chosen in Riwayat, shared with the Filter screen. A tiny module-level store (like a React context without a
// provider): the tab and the stacked Filter screen both read it with useSyncExternalStore and see the same value.
import { useSyncExternalStore } from 'react';
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
