import { buildCountHistory, CashCountError, type CashCountErrorCode, type StoredCountLine } from '@/domain/cash-count';
import {
  closeWeekCountWarning,
  countRowView,
  countToast,
  differenceLabel,
  firstDifferenceNotice,
  hintAction,
  HINT_TEXT,
  hintsForCount,
  homeCountBadge,
  homeCountSpoken,
  lineSpoken,
  parseCountInput,
  resultSummary,
} from './cashCount';
import { CASH_COUNT_ERROR_TEXT, toIndonesian } from './errors';
import { GLOSSARY } from './glossary';

const nb = (s: string) => s.replace(/ /g, ' ');

const line = (seq: number, week: number, account: 'tunai' | 'debit', expected: number, counted: number): StoredCountLine => ({
  seq,
  batchId: `b${seq}`,
  periodId: 'p1',
  week,
  account,
  date: '2026-01-06',
  expected,
  counted,
  difference: counted - expected,
  note: '',
});

describe('differenceLabel', () => {
  it('uses words, never a minus sign', () => {
    expect(differenceLabel(0)).toEqual({ text: 'Cocok', tone: 'ok' });
    expect(nb(differenceLabel(-25_000).text)).toBe('Kurang Rp25.000');
    expect(nb(differenceLabel(15_000).text)).toBe('Lebih Rp15.000');
    expect(differenceLabel(-1).tone).toBe('warn');
    expect(nb(differenceLabel(1_234_567_000).text)).toBe('Lebih Rp1.234.567.000');
  });
});

describe('hints', () => {
  it('every hint code has a text and an action', () => {
    for (const code of ['member_payment', 'host_payout', 'transfer', 'goal_spending'] as const) {
      expect(HINT_TEXT[code]).toMatch(/mungkin/);
      expect(hintAction(code).label.length).toBeGreaterThan(0);
    }
    expect(hintAction('transfer').target).toEqual({ kind: 'kas_new', entryKind: 'transfer' });
    expect(hintAction('goal_spending').target).toEqual({ kind: 'kas_new', entryKind: 'shared_goal' });
  });

  it('hintsForCount: only differing pos; opposite differences suggest a transfer first; Debit not checked gives no partner', () => {
    const tunai = { account: 'tunai' as const, expected: 100_000, counted: 70_000, difference: -30_000 };
    const debit = { account: 'debit' as const, expected: 0, counted: 30_000, difference: 30_000 };
    const both = hintsForCount([tunai, debit], 10);
    expect(both.map((h) => h.account)).toEqual(['tunai', 'debit']);
    expect(both[0]?.hints[0]).toBe('transfer');
    expect(hintsForCount([tunai], 10)[0]?.hints).toEqual(['transfer', 'goal_spending']);
    expect(hintsForCount([{ ...tunai, counted: 100_000, difference: 0 }], 10)).toEqual([]);
  });
});

describe('result and toast', () => {
  it('clean only when every line matches', () => {
    expect(resultSummary([{ account: 'tunai', expected: 1, counted: 1, difference: 0 }]).clean).toBe(true);
    const s = resultSummary([
      { account: 'tunai', expected: 1, counted: 1, difference: 0 },
      { account: 'debit', expected: 1, counted: 2, difference: 1 },
    ]);
    expect(s.clean).toBe(false);
    expect(s.notice).toMatch(/tidak mengubah saldo kas/);
    expect(countToast(true)).toMatch(/cocok/);
    expect(countToast(false)).toMatch(/selisih/);
  });
  it('spoken line has pos, both amounts and the difference in words', () => {
    expect(nb(lineSpoken({ account: 'tunai', expected: 45_000, counted: 20_000, difference: -25_000 }))).toBe(
      'Tunai, menurut catatan Rp45.000, hasil hitung Rp20.000, kurang rp25.000',
    );
  });
});

describe('closeWeekCountWarning', () => {
  it('warns (never blocks) only when there is no count', () => {
    expect(closeWeekCountWarning(true)).toBeNull();
    expect(closeWeekCountWarning(false)).toMatch(/Menutup pertemuan tetap bisa/);
  });
});

describe('parseCountInput', () => {
  const base = { tunaiText: '', tunaiTouched: false, debitChecked: false, debitTouched: false, debitText: '' };
  it('Tunai must be typed; 0 is typed with the keypad as empty text but touched', () => {
    expect(parseCountInput(base).error).toMatch(/Isi jumlah Tunai/);
    expect(parseCountInput({ ...base, tunaiTouched: true })).toEqual({ tunai: 0, debit: null, error: null });
    expect(parseCountInput({ ...base, tunaiTouched: true, tunaiText: '45000' }).tunai).toBe(45_000);
  });
  it('Debit is null unless checked; checked and empty is 0', () => {
    expect(parseCountInput({ ...base, tunaiTouched: true, tunaiText: '1' }).debit).toBeNull();
    expect(parseCountInput({ ...base, tunaiTouched: true, debitChecked: true, debitTouched: true }).debit).toBe(0);
    expect(parseCountInput({ ...base, tunaiTouched: true, debitChecked: true }).error).toMatch(/Isi jumlah Debit/);
    expect(parseCountInput({ ...base, tunaiTouched: true, debitChecked: true, debitTouched: true, debitText: '12345' }).debit).toBe(12_345);
  });
  it('too many digits is an error', () => {
    expect(parseCountInput({ ...base, tunaiTouched: true, tunaiText: '1234567890123' }).error).toMatch(/Isi jumlah Tunai/);
  });
});

describe('history view', () => {
  const lines = [line(1, 1, 'tunai', 100, 100), line(2, 2, 'tunai', 100, 90), line(3, 2, 'debit', 5, 5), line(4, 3, 'tunai', 100, 80)];
  const rows = buildCountHistory(lines, [1, 2, 3, 4]);
  it('not checked, clean, first, continued', () => {
    expect(countRowView(rows[3] as never, 0).badge).toEqual({ label: 'Belum dicek', tone: 'neutral' });
    const clean = countRowView(rows[0] as never, 1);
    expect(clean.badge).toBeNull();
    expect(clean.lines[0]).toMatchObject({ text: 'Cocok', tone: 'ok' });
    expect(clean.lines[1]).toMatchObject({ text: 'tidak dicek', tone: 'neutral' });
    const first = countRowView(rows[1] as never, 2);
    expect(first).toMatchObject({ tint: true, badge: { label: 'Selisih mulai di sini' }, help: 'Dihitung 2 kali. Yang terbaru dipakai.' });
    expect(countRowView(rows[2] as never, 1)).toMatchObject({ tint: false, badge: { label: 'Selisih berlanjut' } });
  });
  it('first difference notice names the meeting; none when clean', () => {
    expect(firstDifferenceNotice(rows)).toMatch(/pertemuan 2\./);
    expect(firstDifferenceNotice([rows[0] as never])).toBeNull();
  });
});

describe('Beranda badge', () => {
  it('none, clean, difference, other meeting', () => {
    expect(homeCountBadge({ state: 'none', week: null, differing: [] }, 3)).toEqual({ label: 'Belum dicek', tone: 'neutral' });
    expect(homeCountBadge({ state: 'clean', week: 3, differing: [] }, 3)).toEqual({ label: 'Cocok', tone: 'ok' });
    expect(homeCountBadge({ state: 'difference', week: 2, differing: [] }, 3)).toEqual({ label: 'Pertemuan 2: Selisih', tone: 'warn' });
    expect(homeCountSpoken({ state: 'difference', week: 2, differing: [] })).toBe('Cek kas. Pertemuan 2: ada selisih.');
    expect(homeCountSpoken({ state: 'none', week: null, differing: [] })).toBe('Cek kas. Belum ada hitungan.');
  });
});

describe('errors and glossary', () => {
  it('toIndonesian maps every CashCountErrorCode', () => {
    for (const code of Object.keys(CASH_COUNT_ERROR_TEXT) as CashCountErrorCode[]) {
      expect(toIndonesian(new CashCountError(code, 'english'))).toBe(CASH_COUNT_ERROR_TEXT[code]);
    }
  });
  it('the Istilah page explains Cek kas and Selisih', () => {
    const terms = GLOSSARY.map((g) => g.term);
    expect(terms).toEqual(expect.arrayContaining(['Cek kas', 'Selisih', 'Belum dicek']));
  });
});
