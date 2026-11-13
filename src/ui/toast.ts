// In-app snackbar state (the view is components/ToastHost.tsx). Same call as before: toast(message). It replaces
// ToastAndroid, which draws in the phone's system font. Only the newest message matters: it replaces the old one.

export const TOAST_DURATION_MS = 3000;

export interface ActiveToast {
  id: number;
  message: string;
}

let active: ActiveToast | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

export function currentToast(): ActiveToast | null {
  return active;
}

export function subscribeToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Short confirmation at the bottom of the screen. A new message replaces the old one and restarts the timer. */
export function toast(message: string): void {
  if (message.length === 0) return;
  if (timer !== null) clearTimeout(timer);
  const mine: ActiveToast = { id: nextId++, message };
  active = mine;
  // Clear only if this toast is still the active one (the old timer is cancelled above; this is a second guard).
  timer = setTimeout(() => {
    if (active === mine) {
      active = null;
      timer = null;
      notify();
    }
  }, TOAST_DURATION_MS);
  notify();
}

/** Test helper. */
export function resetToastForTest(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  active = null;
  nextId = 1;
  listeners.clear();
}
