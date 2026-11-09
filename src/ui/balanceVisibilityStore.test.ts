import {
  BALANCE_MASK,
  HIDE_BALANCE_KEY,
  balanceToggleLabel,
  createBalanceVisibilityStore,
  isBalanceHidden,
  setBalanceHidden,
  toggleBalanceHidden,
  type SyncKeyValueStore,
} from './balanceVisibilityStore';

// The real module uses expo-sqlite/kv-store (native); replace it with an in-memory map.
jest.mock('expo-sqlite/kv-store', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItemSync: (k: string) => data.get(k) ?? null,
      setItemSync: (k: string, v: string) => void data.set(k, v),
    },
  };
});

function memoryKv(initial?: string): SyncKeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(HIDE_BALANCE_KEY, initial);
  return {
    data,
    getItemSync: (k) => data.get(k) ?? null,
    setItemSync: (k, v) => void data.set(k, v),
  };
}

const failing: SyncKeyValueStore = {
  getItemSync: () => {
    throw new Error('read failed');
  },
  setItemSync: () => {
    throw new Error('write failed');
  },
};

describe('balance visibility store (module instance)', () => {
  afterEach(() => setBalanceHidden(false));

  test('visible by default', () => {
    expect(isBalanceHidden()).toBe(false);
  });

  test('toggle flips the state both ways', () => {
    toggleBalanceHidden();
    expect(isBalanceHidden()).toBe(true);
    toggleBalanceHidden();
    expect(isBalanceHidden()).toBe(false);
  });
});

describe('createBalanceVisibilityStore', () => {
  test('missing key means visible', () => {
    expect(createBalanceVisibilityStore(memoryKv()).isHidden()).toBe(false);
  });

  test('a saved "1" is read as hidden and "0" as visible', () => {
    expect(createBalanceVisibilityStore(memoryKv('1')).isHidden()).toBe(true);
    expect(createBalanceVisibilityStore(memoryKv('0')).isHidden()).toBe(false);
  });

  test('an unknown saved value means visible', () => {
    expect(createBalanceVisibilityStore(memoryKv('banana')).isHidden()).toBe(false);
  });

  test('the choice is saved and survives a restart (a new store on the same storage)', () => {
    const kv = memoryKv();
    createBalanceVisibilityStore(kv).toggle();
    expect(kv.data.get(HIDE_BALANCE_KEY)).toBe('1');
    expect(createBalanceVisibilityStore(kv).isHidden()).toBe(true);
    const second = createBalanceVisibilityStore(kv);
    second.toggle();
    expect(kv.data.get(HIDE_BALANCE_KEY)).toBe('0');
  });

  test('a failing read falls back to visible and does not throw', () => {
    expect(createBalanceVisibilityStore(failing).isHidden()).toBe(false);
  });

  test('a failing write does not throw and the choice still works in memory', () => {
    const store = createBalanceVisibilityStore(failing);
    expect(() => store.toggle()).not.toThrow();
    expect(store.isHidden()).toBe(true);
  });

  test('listeners are told about a change, not about a no-op, and can unsubscribe', () => {
    const store = createBalanceVisibilityStore(memoryKv());
    const listener = jest.fn();
    const off = store.subscribe(listener);
    store.setHidden(false);
    expect(listener).not.toHaveBeenCalled();
    store.setHidden(true);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.setHidden(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('texts', () => {
  test('the mask hides every digit', () => {
    expect(BALANCE_MASK).toBe('Rp ••••••');
    expect(BALANCE_MASK).not.toMatch(/\d/);
  });

  test('the button label says what pressing it does', () => {
    expect(balanceToggleLabel(false)).toBe('Sembunyikan saldo');
    expect(balanceToggleLabel(true)).toBe('Tampilkan saldo');
  });
});
