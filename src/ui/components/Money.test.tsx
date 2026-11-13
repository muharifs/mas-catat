// G2: only the painted text uses the typographic minus (U+2212). format.ts, CSV and dialogs keep the ASCII hyphen.
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot } from 'test-renderer';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { buildCsv } from '@/domain/csv';
import { fonts } from '../theme';
import { formatRupiah, formatSigned } from '../format';
import { displayMoneyText, Money, moneyAccessibilityLabel, splitMoneyText } from './Money';

interface Json {
  type?: string;
  props?: Record<string, unknown>;
  children?: (Json | string)[];
}

async function render(element: ReactElement): Promise<Json> {
  const root = createRoot();
  await act(async () => {
    root.render(element);
  });
  return root.container.toJSON() as unknown as Json;
}

function firstText(tree: Json): Json {
  const stack: (Json | string)[] = [tree];
  while (stack.length > 0) {
    const n = stack.shift();
    if (!n || typeof n === 'string') continue;
    if (n.children?.some((c) => typeof c === 'string')) return n;
    stack.push(...(n.children ?? []));
  }
  throw new Error('no text node');
}

describe('Money (screen only)', () => {
  it('paints a minus sign as U+2212 and says "minus" to screen readers', async () => {
    const node = firstText(await render(<Money amount={50_000} sign="-" />));
    expect(node.children).toEqual(['−Rp50.000']);
    expect(node.props?.accessibilityLabel).toBe('minus Rp50.000');
  });

  it('paints a negative balance without explicit sign the same way', async () => {
    const node = firstText(await render(<Money amount={-5_000} />));
    expect(node.children).toEqual(['−Rp5.000']);
    expect(node.props?.accessibilityLabel).toBe('minus Rp5.000');
  });

  it('keeps "+" and says "plus"; an unsigned positive amount has no override label', async () => {
    const plus = firstText(await render(<Money amount={50_000} sign="+" />));
    expect(plus.children).toEqual(['+Rp50.000']);
    expect(plus.props?.accessibilityLabel).toBe('plus Rp50.000');
    const none = firstText(await render(<Money amount={50_000} />));
    expect(none.children).toEqual(['Rp50.000']);
    expect(none.props?.accessibilityLabel).toBeUndefined();
  });

  it('helpers only touch a leading hyphen', () => {
    expect(displayMoneyText('-Rp1.000')).toBe('−Rp1.000');
    expect(displayMoneyText('Rp1.000')).toBe('Rp1.000');
    expect(moneyAccessibilityLabel('Rp0')).toBeUndefined();
  });
});

describe('Money smallPrefix', () => {
  it('splitMoneyText separates sign, Rp and digits', () => {
    expect(splitMoneyText('−Rp5.000')).toEqual(['−', 'Rp', '5.000']);
    expect(splitMoneyText('Rp15.000')).toEqual(['', 'Rp', '15.000']);
    expect(splitMoneyText('+Rp1')).toEqual(['+', 'Rp', '1']);
    expect(splitMoneyText('15.000')).toBeNull();
  });

  it('nests a smaller Rp and reads the whole amount once', async () => {
    const tree = firstText(await render(<Money amount={15_000} size="hero" smallPrefix />));
    expect(tree.props?.accessibilityLabel).toBe('Rp15.000');
    const prefix = (tree.children ?? []).find((c): c is Json => typeof c !== 'string');
    expect(prefix?.children).toEqual(['Rp']);
    expect(StyleSheet.flatten(prefix?.props?.style as never)).toEqual({ fontSize: 20, fontFamily: fonts.bold });
    expect((tree.children ?? []).filter((c) => typeof c === 'string')).toEqual(['15.000']);
  });

  it('keeps the minus at full size and says "minus" in words', async () => {
    const tree = firstText(await render(<Money amount={-5_000} smallPrefix />));
    expect(tree.props?.accessibilityLabel).toBe('minus Rp5.000');
    expect((tree.children ?? []).filter((c) => typeof c === 'string')).toEqual(['−', '5.000']);
  });

  it('without smallPrefix the output is the single plain string as before', async () => {
    const tree = firstText(await render(<Money amount={15_000} size="hero" />));
    expect(tree.children).toEqual(['Rp15.000']);
    expect(tree.props?.accessibilityLabel).toBeUndefined();
  });
});

describe('everything outside Money keeps the ASCII hyphen (byte-identical)', () => {
  it('formatSigned and formatRupiah', () => {
    expect(formatSigned(15_000, '-')).toBe('-Rp15.000');
    expect(formatSigned(-15_000, '')).toBe('-Rp15.000');
    expect(formatRupiah(-5_000)).toBe('-Rp5.000');
    expect(formatSigned(15_000, '-').charCodeAt(0)).toBe(0x2d);
    expect(formatRupiah(-5_000).includes('−')).toBe(false);
  });

  it('CSV amounts stay plain integers and no U+2212 appears', () => {
    const csv = buildCsv(['Jumlah', 'Catatan'], [[-5_000, 'tes - strip'], [50_000, '']]);
    expect(csv).toContain('-5000;tes - strip');
    expect(csv).toContain('50000;');
    expect(csv.includes('−')).toBe(false);
  });

  it('the source of format.ts, csv.ts and csvFiles.ts never contains U+2212', () => {
    const files = ['../format.ts', '../csvFiles.ts', '../../domain/csv.ts'];
    for (const f of files) {
      expect(fs.readFileSync(path.resolve(__dirname, f), 'utf8').includes('−')).toBe(false);
    }
  });
});
