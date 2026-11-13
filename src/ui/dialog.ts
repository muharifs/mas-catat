// In-app dialog: pure logic and queue (no react-native import, so Jest can test it). The view is DialogHost.tsx.
// Replaces Alert.alert: same call shape (title, message, buttons with callbacks), but drawn in the app's own font.
// Spec: docs/specs/dialog-spec.md. The file name does not end in "Store" on purpose (gallery.test.ts rejects that).
import type { ReactNode } from 'react';

export type DialogRole = 'default' | 'cancel' | 'destructive';

export interface DialogButton {
  label: string;
  /** Default 'default'. */
  role?: DialogRole;
  onPress?: () => void | Promise<void>;
}

export interface DialogOptions {
  title: string;
  /** Paragraphs separated by a blank line. */
  message?: string;
  /** Optional extra content under the message (not used yet). */
  body?: ReactNode;
  /** 1 to 3 buttons. */
  buttons: DialogButton[];
  /** Default true. false: Back and tapping outside do nothing. */
  cancelable?: boolean;
}

export interface ActiveDialog {
  id: number;
  options: DialogOptions;
  settled: boolean;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const queue: ActiveDialog[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
// True while an onPress callback runs: dialogs opened from inside it must not notify on their own.
let settling = false;

function notify(): void {
  // Copy: a listener may unsubscribe while we iterate.
  for (const listener of [...listeners]) listener();
}

/** The dialog on screen (head of the queue), or null. The reference is stable until the head changes. */
export function current(): ActiveDialog | null {
  return queue[0] ?? null;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Non-cancel buttons in the given order, then the cancel button last (action on top, Batal below). */
export function orderButtons(buttons: DialogButton[]): DialogButton[] {
  return [...buttons.filter((b) => b.role !== 'cancel'), ...buttons.filter((b) => b.role === 'cancel')];
}

export function buttonVariant(role: DialogRole | undefined): ButtonVariant {
  if (role === 'destructive') return 'danger';
  if (role === 'cancel') return 'secondary';
  return 'primary';
}

/** Index (in options.buttons) pressed by the Android Back button, or null when Back does nothing. */
export function backTarget(options: DialogOptions): number | null {
  if (options.cancelable === false) return null;
  const cancelIndex = options.buttons.findIndex((b) => b.role === 'cancel');
  if (cancelIndex >= 0) return cancelIndex;
  return options.buttons.length === 1 ? 0 : null;
}

/** Index pressed by tapping outside the card. Only a one-button, non-destructive (info) dialog closes this way. */
export function scrimTarget(options: DialogOptions): number | null {
  if (options.cancelable === false) return null;
  if (options.buttons.length !== 1) return null;
  return options.buttons[0]?.role === 'destructive' ? null : 0;
}

export function showDialog(options: DialogOptions): void {
  if (options.buttons.length < 1 || options.buttons.length > 3) {
    throw new Error('A dialog needs 1 to 3 buttons.');
  }
  queue.push({ id: nextId++, options, settled: false });
  // Only the head is visible, so a dialog queued behind another changes nothing on screen.
  if (queue.length === 1 && !settling) notify();
}

/** Info dialog with a single "Tutup" button (replaces the two-argument Alert.alert). */
export function showMessage(title: string, message: string): void {
  showDialog({ title, message, buttons: [{ label: 'Tutup' }] });
}

/**
 * Runs button `index` of dialog `id`. Order matches a native Alert: the dialog leaves the queue first, then
 * onPress runs. Listeners are told once, after onPress, so a dialog opened inside onPress (close.tsx, restore.tsx)
 * replaces this one with no empty state in between (the Modal never closes and reopens).
 * A second press, Back, or a press during the close animation is ignored. Errors from onPress are not swallowed.
 */
export function pressButton(id: number, index: number): void {
  const head = queue[0];
  if (!head || head.id !== id || head.settled) return;
  const button = head.options.buttons[index];
  if (!button) return;
  head.settled = true;
  queue.shift();
  settling = true;
  try {
    button.onPress?.();
  } finally {
    settling = false;
    notify();
  }
}

/** Android Back button. */
export function pressBack(id: number): void {
  const head = queue[0];
  if (!head || head.id !== id) return;
  const index = backTarget(head.options);
  if (index !== null) pressButton(id, index);
}

/** Tap outside the card. */
export function pressScrim(id: number): void {
  const head = queue[0];
  if (!head || head.id !== id) return;
  const index = scrimTarget(head.options);
  if (index !== null) pressButton(id, index);
}

/** Test helper: empties the queue and the listeners. */
export function resetDialogsForTest(): void {
  queue.length = 0;
  listeners.clear();
  nextId = 1;
  settling = false;
}
