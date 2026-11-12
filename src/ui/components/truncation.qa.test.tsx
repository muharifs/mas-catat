// QA: long Indonesian text must reach the screen untruncated. jest cannot measure layout (no Yoga), so this guards the
// part it can: which components ask React Native to cut text (numberOfLines) or to shrink it (adjustsFontSizeToFit).
// Icons are not part of the text check; the icon font loader needs expo-asset, which is not installed here.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../balanceVisibilityStore', () => ({ BALANCE_MASK: 'Rp ******' }));

import { act } from 'react';
import { createRoot } from 'test-renderer';
import { Badge } from './Badge';
import { Button } from './Button';
import { Chip } from './Chip';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { IconChoice } from './IconChoice';
import { ListRow, RowText } from './ListRow';
import { Notice } from './Notice';
import { OptionRow } from './OptionRow';
import { PillLink } from './PillLink';
import { QuickAction } from './QuickAction';
import { ReminderRow } from './ReminderRow';
import { ReportLine } from './ReportLine';
import { SectionHeader } from './SectionHeader';
import type { ReactElement } from 'react';

interface Json {
  type?: string;
  props?: Record<string, unknown>;
  children?: (Json | string)[];
}

function walk(node: Json | string | null | undefined, visit: (n: Json) => void): void {
  if (!node || typeof node === 'string') return;
  visit(node);
  for (const c of node.children ?? []) walk(c, visit);
}

async function render(element: ReactElement): Promise<Json> {
  const root = createRoot();
  await act(async () => {
    root.render(element);
  });
  return root.container.toJSON() as unknown as Json;
}

const LONG = 'Lihat pembayaran tuan rumah untuk pertemuan dengan nama yang sangat panjang sekali';
const noop = () => undefined;

function truncating(tree: Json): string[] {
  const found: string[] = [];
  walk(tree, (n) => {
    const p = n.props ?? {};
    if (p.numberOfLines !== undefined) found.push(`numberOfLines=${String(p.numberOfLines)}`);
    if (p.adjustsFontSizeToFit) found.push('adjustsFontSizeToFit');
    if (p.ellipsizeMode !== undefined) found.push(`ellipsizeMode=${String(p.ellipsizeMode)}`);
  });
  return found;
}

function text(tree: Json): string {
  let out = '';
  walk(tree, (n) => {
    for (const c of n.children ?? []) if (typeof c === 'string') out += c;
  });
  return out;
}

describe('QA: components never cut long text', () => {
  const cases: [string, ReactElement, string][] = [
    ['Button', <Button key="b" label={LONG} onPress={noop} />, LONG],
    ['ListRow', <ListRow key="l" title={LONG} right={<RowText>Sudah dibayar</RowText>} onPress={noop} />, LONG],
    ['ErrorState with a title', <ErrorState key="et" title={LONG} message={LONG} />, LONG],
    ['Notice', <Notice key="n" title={LONG}>{LONG}</Notice>, LONG],
    ['ErrorState', <ErrorState key="e" message={LONG} onRetry={noop} />, LONG],
    ['EmptyState', <EmptyState key="m" title={LONG} message={LONG} actionLabel={LONG} onAction={noop} />, LONG],
    ['ReminderRow', <ReminderRow key="r" kind="pay_host" title={LONG} detail={LONG} actionLabel="Bayar tuan rumah" onAction={noop} />, LONG],
    ['QuickAction', <QuickAction key="q" label="Bayar tuan rumah" icon="home-outline" onPress={noop} />, 'Bayar tuan rumah'],
    ['PillLink', <PillLink key="p" label="Piutang (dipinjam anggota)" amount={25_000_000} onPress={noop} />, 'Piutang (dipinjam anggota)'],
    ['Badge', <Badge key="g" label="Sebagian lewat titipan" />, 'Sebagian lewat titipan'],
    ['Chip', <Chip key="c" label="Pindah saldo" onPress={noop} />, 'Pindah saldo'],
    ['OptionRow', <OptionRow key="o" label={LONG} hint={LONG} trailing="Sisa Rp300.000" selected onPress={noop} />, LONG],
    ['ReportLine', <ReportLine key="rl" label={LONG} hint={LONG} amount={1_000} />, LONG],
    ['SectionHeader', <SectionHeader key="s" title={LONG} actionLabel="Lihat semua riwayat" onAction={noop} />, LONG],
  ];

  it.each(cases)('%s asks for no truncation or shrinking and keeps the whole label', async (_name, element, expected) => {
    const tree = await render(element);
    expect(truncating(tree)).toEqual([]);
    expect(text(tree)).toContain(expected);
  });

  it('IconChoice is the one tile that cuts its label to one line (numberOfLines=1)', async () => {
    const tree = await render(<IconChoice label="Tunai ke Debit" icon="swap-horizontal-outline" selected={false} onPress={noop} />);
    expect(truncating(tree)).toEqual(['numberOfLines=1']);
  });
});

// Batch E made several strings longer (close.tsx, Riwayat rows, CorrectionForm, backup captions, credits Notice,
// "Sudah dikembalikan", the Istilah page). jest cannot measure Yoga layout, so this guards by source: only these
// files may ask React Native to cut or shrink text. A new entry here is a decision, not an accident.
describe('QA: only known files use numberOfLines or adjustsFontSizeToFit', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const srcRoot = path.resolve(__dirname, '..', '..');

  function listTsx(dir: string): string[] {
    const out: string[] = [];
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) out.push(...listTsx(full));
      else if (name.endsWith('.tsx') && !name.includes('.test.') && !name.includes('.qa.')) out.push(full);
    }
    return out;
  }

  it('matches the allow-list (masked totals, tiles, multiline fields); long-text screens are free of it', () => {
    const users = listTsx(srcRoot)
      .filter((f) => !f.includes(`${path.sep}gallery${path.sep}`))
      .filter((f) => /numberOfLines|adjustsFontSizeToFit/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(srcRoot, f).split(path.sep).join('/'))
      .sort();
    expect(users).toEqual(
      [
        'app/(tabs)/index.tsx', // masked balance and month totals, one line by design
        'app/istilah.tsx', // only a comment saying it is NOT used
        'app/kas/new.tsx', // multiline note field
        'ui/components/AmountDisplay.tsx',
        'ui/components/CorrectionForm.tsx', // multiline reason field
        'ui/components/IconChoice.tsx',
        'ui/components/Money.tsx',
      ].sort(),
    );
  });
});
