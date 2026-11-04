import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { toIndonesian } from './errors';

/**
 * Loads data every time the screen gets focus (also when coming back from another screen), so lists are fresh
 * after adding or editing. On the web a component usually re-fetches on mount only; with a navigation stack the
 * previous screen stays mounted, hence useFocusEffect. `reload` can be called after a change.
 * Pass a `load` function that is stable (wrap it in useCallback).
 */
export function useLoad<T>(load: () => Promise<T>): { data: T | null; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(toIndonesian(e));
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void run();
    }, [run]),
  );

  return { data, error, reload: run };
}
