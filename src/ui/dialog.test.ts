/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  backTarget,
  buttonVariant,
  current,
  orderButtons,
  pressBack,
  pressButton,
  pressScrim,
  resetDialogsForTest,
  scrimTarget,
  showDialog,
  showMessage,
  subscribe,
  type DialogButton,
  type DialogOptions,
} from './dialog';
import { currentToast, resetToastForTest, toast, TOAST_DURATION_MS } from './toast';

const cancel: DialogButton = { label: 'Batal', role: 'cancel' };
const ok: DialogButton = { label: 'Simpan' };
const red: DialogButton = { label: 'Hapus', role: 'destructive' };

function opts(buttons: DialogButton[], extra: Partial<DialogOptions> = {}): DialogOptions {
  return { title: 't', buttons, ...extra };
}

beforeEach(() => {
  resetDialogsForTest();
  resetToastForTest();
});

describe('orderButtons and buttonVariant', () => {
  it('moves cancel last and keeps the other order', () => {
    expect(orderButtons([cancel, ok, red])).toEqual([ok, red, cancel]);
    expect(orderButtons([ok, cancel])).toEqual([ok, cancel]);
  });
  it('keeps the order when there is no cancel', () => {
    expect(orderButtons([red, ok])).toEqual([red, ok]);
  });
  it('maps roles to Button variants', () => {
    expect(buttonVariant('destructive')).toBe('danger');
    expect(buttonVariant('default')).toBe('primary');
    expect(buttonVariant(undefined)).toBe('primary');
    expect(buttonVariant('cancel')).toBe('secondary');
  });
  it('showDialog rejects 0 or more than 3 buttons', () => {
    expect(() => showDialog(opts([]))).toThrow();
    expect(() => showDialog(opts([ok, ok, ok, cancel]))).toThrow();
    expect(current()).toBeNull();
  });
});

describe('backTarget and scrimTarget', () => {
  it('Back points at the cancel button', () => {
    expect(backTarget(opts([ok, cancel]))).toBe(1);
  });
  it('Back on a single button without cancel presses that button', () => {
    expect(backTarget(opts([ok]))).toBe(0);
  });
  it('Back with several buttons and no cancel does nothing', () => {
    expect(backTarget(opts([ok, red]))).toBeNull();
  });
  it('cancelable false disables Back and scrim', () => {
    expect(backTarget(opts([ok, cancel], { cancelable: false }))).toBeNull();
    expect(scrimTarget(opts([ok], { cancelable: false }))).toBeNull();
  });
  it('scrim closes only a one-button non-destructive dialog', () => {
    expect(scrimTarget(opts([ok]))).toBe(0);
    expect(scrimTarget(opts([red]))).toBeNull();
    expect(scrimTarget(opts([ok, cancel]))).toBeNull();
    expect(scrimTarget(opts([red, cancel]))).toBeNull();
  });
});

describe('settling', () => {
  it('runs onPress once on a double press', () => {
    const onPress = jest.fn();
    showDialog(opts([{ label: 'A', onPress }]));
    const id = current()!.id;
    pressButton(id, 0);
    pressButton(id, 0);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('button then Back: only the first runs', () => {
    const a = jest.fn();
    const c = jest.fn();
    showDialog(opts([{ label: 'A', onPress: a }, { label: 'Batal', role: 'cancel', onPress: c }]));
    const id = current()!.id;
    pressButton(id, 0);
    pressBack(id);
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
  });
  it('Back and scrim follow the rules', () => {
    const c = jest.fn();
    showDialog(opts([{ label: 'A' }, { label: 'Batal', role: 'cancel', onPress: c }]));
    const id = current()!.id;
    pressScrim(id);
    expect(current()?.id).toBe(id);
    pressBack(id);
    expect(c).toHaveBeenCalledTimes(1);
    expect(current()).toBeNull();
  });
  it('the dialog has left the head of the queue while onPress runs', () => {
    let seen: unknown = 'unset';
    showDialog(opts([{ label: 'A', onPress: () => { seen = current(); } }]));
    pressButton(current()!.id, 0);
    expect(seen).toBeNull();
  });
  it('a throwing onPress is rethrown and does not jam the queue', () => {
    const listener = jest.fn();
    showDialog(opts([{ label: 'A', onPress: () => { throw new Error('boom'); } }]));
    showDialog(opts([ok], { title: 'second' }));
    subscribe(listener);
    expect(() => pressButton(current()!.id, 0)).toThrow('boom');
    expect(current()?.options.title).toBe('second');
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('a rejected async onPress does not change the host state', async () => {
    let rejected: Promise<void> | undefined;
    showDialog(opts([{ label: 'A', onPress: () => { rejected = Promise.reject(new Error('late')); return rejected; } }]));
    pressButton(current()!.id, 0);
    expect(current()).toBeNull();
    await expect(rejected).rejects.toThrow('late');
    expect(current()).toBeNull();
  });
});

describe('queue', () => {
  it('shows dialogs first in, first out', () => {
    showDialog(opts([ok], { title: 'one' }));
    showDialog(opts([ok], { title: 'two' }));
    expect(current()?.options.title).toBe('one');
    pressButton(current()!.id, 0);
    expect(current()?.options.title).toBe('two');
  });
  it('a dialog opened inside onPress replaces the current one with a single notification', () => {
    const seen: (string | undefined)[] = [];
    showDialog(opts([{ label: 'Lanjut', onPress: () => showDialog(opts([ok], { title: 'step 2' })) }], { title: 'step 1' }));
    subscribe(() => seen.push(current()?.options.title));
    pressButton(current()!.id, 0);
    expect(seen).toEqual(['step 2']);
  });
  it('keeps dialogs shown before a listener exists', () => {
    showDialog(opts([ok], { title: 'early' }));
    const listener = jest.fn();
    subscribe(listener);
    expect(current()?.options.title).toBe('early');
  });
  it('showMessage is one default "Tutup" button', () => {
    showMessage('Judul', 'Isi');
    expect(current()?.options).toMatchObject({ title: 'Judul', message: 'Isi', buttons: [{ label: 'Tutup' }] });
    expect(current()?.options.buttons[0]?.role).toBeUndefined();
  });
});

describe('toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('the newest message replaces the old one with a new id', () => {
    toast('a');
    const first = currentToast()!;
    toast('b');
    expect(currentToast()?.message).toBe('b');
    expect(currentToast()!.id).toBeGreaterThan(first.id);
  });
  it('an old timer does not clear a newer message', () => {
    toast('a');
    jest.advanceTimersByTime(TOAST_DURATION_MS - 100);
    toast('b');
    jest.advanceTimersByTime(200);
    expect(currentToast()?.message).toBe('b');
    jest.advanceTimersByTime(TOAST_DURATION_MS);
    expect(currentToast()).toBeNull();
  });
  it('ignores an empty message', () => {
    toast('');
    expect(currentToast()).toBeNull();
  });
});

describe('static checks', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx') ? [full] : [];
    });
  }
  const srcDir = join(__dirname, '..');

  it('no file in src imports Alert or ToastAndroid from react-native', () => {
    for (const file of sourceFiles(srcDir)) {
      const imports = readFileSync(file, 'utf8').match(/import\s*\{[^}]*\}\s*from\s*'react-native'/g) ?? [];
      for (const line of imports) expect(line).not.toMatch(/\b(Alert|ToastAndroid)\b/);
      expect(readFileSync(file, 'utf8')).not.toMatch(/Alert\.alert\(/);
    }
  });
  it('DialogHost keeps the Android window rules and never sets fontWeight', () => {
    const source = readFileSync(join(__dirname, 'components', 'DialogHost.tsx'), 'utf8');
    expect(source).toContain('statusBarTranslucent');
    expect(source).toContain('onRequestClose');
    expect(source).toContain('accessibilityViewIsModal');
    expect(source).not.toContain('fontWeight');
  });
});
