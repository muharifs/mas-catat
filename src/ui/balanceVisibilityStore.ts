// Whether the balances on Beranda are hidden (the eye button). A tiny module-level store, like historyFilterStore, shared
// by every screen that reads it (so it survives tab switches). The choice is remembered across app restarts in
// expo-sqlite/kv-store: a SEPARATE small SQLite file, so the app database, its migrations, backup, restore and fingerprint
// are untouched. The kv-store has a synchronous API, so the saved value is read before the first render (no flash of
// visible amounts). A storage error never blocks the screen: reads fall back to "visible", writes are skipped.
import { useSyncExternalStore } from 'react';
import Storage from 'expo-sqlite/kv-store';

/** Shown instead of an amount while it is hidden. */
export const BALANCE_MASK = 'Rp ••••••';

export const HIDE_BALANCE_KEY = 'beranda.hideBalance';

/** The part of the key-value store this module needs (injectable for tests). */
export interface SyncKeyValueStore {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
}

export function createBalanceVisibilityStore(kv: SyncKeyValueStore) {
  let hidden: boolean | null = null; // null = not read yet
  const listeners = new Set<() => void>();

  function read(): boolean {
    try {
      return kv.getItemSync(HIDE_BALANCE_KEY) === '1';
    } catch {
      return false; // default: visible
    }
  }

  function isHidden(): boolean {
    if (hidden === null) hidden = read();
    return hidden;
  }

  function setHidden(next: boolean): void {
    if (isHidden() === next) return;
    hidden = next;
    try {
      kv.setItemSync(HIDE_BALANCE_KEY, next ? '1' : '0');
    } catch {
      // Not saved: the choice still works until the app closes.
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { isHidden, setHidden, toggle: () => setHidden(!isHidden()), subscribe };
}

// The real store. The kv-store is touched only inside the methods, so even a failure while opening it is caught above.
const store = createBalanceVisibilityStore({
  getItemSync: (key) => Storage.getItemSync(key),
  setItemSync: (key, value) => Storage.setItemSync(key, value),
});

export const isBalanceHidden = store.isHidden;
export const setBalanceHidden = store.setHidden;
export const toggleBalanceHidden = store.toggle;

export function useBalanceHidden(): boolean {
  return useSyncExternalStore(store.subscribe, store.isHidden);
}

/** Spoken label of the eye button: it says what pressing it does. */
export function balanceToggleLabel(isHidden: boolean): string {
  return isHidden ? 'Tampilkan saldo' : 'Sembunyikan saldo';
}
