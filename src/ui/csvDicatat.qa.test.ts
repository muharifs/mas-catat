// QA: edge cases of the CSV "Dicatat" column. Zone independent: explicit offsets, or expectations built from local getters.
import type { LedgerExportRow } from '@/db/exports';
import { csvAmountColumns } from '@/domain/flow';
import { ledgerCsv, LEDGER_HEADER } from './csvFiles';
import { csvRecordedAt } from './dates';

const WIB = 420;

const base: LedgerExportRow = {
  date: '2026-11-17', type: 'member_payment', account: 'tunai', toAccount: null, memberName: 'Budi; "Si" Kecil, Jr',
  periodName: 'Periode 1', week: null, direction: 'in', amount: 30000, note: 'baris1\nbaris2; "kutip", koma',
  status: 'in_force', correctionReason: 'alasan; "x"', createdAt: '2026-11-17T12:42:00.000Z',
};

describe('csvRecordedAt tepi', () => {
  it('SQLite-style UTC text (no T / Z) is treated as malformed: blank cell, no made-up time', () => {
    expect(csvRecordedAt('2026-11-17 12:42:00', WIB)).toBe('');
  });
  it('rejects impossible values instead of rolling over', () => {
    for (const bad of ['2026-02-30T10:00:00Z', '2026-13-01T10:00:00Z', '2026-11-17T24:00:00Z', '2026-11-17T10:60:00Z', '2026-11-17T10:00:60Z']) {
      expect(csvRecordedAt(bad, WIB)).toBe('');
    }
  });
  it('crosses midnight and year/leap boundaries in the local zone', () => {
    expect(csvRecordedAt('2026-12-31T17:00:00.000Z', WIB)).toBe('2027-01-01 00:00');
    expect(csvRecordedAt('2028-02-28T17:30:00.000Z', WIB)).toBe('2028-02-29 00:30');
    expect(csvRecordedAt('2026-11-17T16:59:59.999Z', WIB)).toBe('2026-11-17 23:59');
    expect(csvRecordedAt('2026-01-01T00:00:00Z', -300)).toBe('2025-12-31 19:00');
  });
  it('honours an explicit offset in the stored value and half-hour zones', () => {
    expect(csvRecordedAt('2026-11-17T19:42:00+07:00', WIB)).toBe('2026-11-17 19:42');
    expect(csvRecordedAt('2026-11-17T12:00:00Z', 330)).toBe('2026-11-17 17:30');
  });
  it('is always 16 chars with zero padding', () => {
    expect(csvRecordedAt('2026-01-02T00:05:00Z', 0)).toBe('2026-01-02 00:05');
  });
});

describe('ledgerCsv Dicatat dengan sel berisi pemisah, kutip, baris baru', () => {
  const stamp = csvRecordedAt(base.createdAt);

  it('keeps the Dicatat cell as the last cell of the record and intact after a quoted multi-line note', () => {
    const csv = ledgerCsv([base]);
    expect(csv.endsWith(`;${stamp}`) || csv.endsWith(`;${stamp}\r\n`)).toBe(true);
    // The header gained exactly one column.
    expect(LEDGER_HEADER).toHaveLength(14);
  });

  it('a null / broken createdAt leaves an empty last cell and does not shift the row', () => {
    const csv = ledgerCsv([{ ...base, createdAt: null as unknown as string }]);
    expect(csv.trimEnd().endsWith(';')).toBe(true);
  });

  it('amount columns do not depend on Dicatat: Masuk - Keluar of the rows still equals the kas change (D10)', () => {
    const entries: LedgerExportRow[] = [
      base,
      { ...base, type: 'transfer', account: 'tunai', toAccount: 'debit', direction: 'out', amount: 5000, createdAt: 'rusak' },
      { ...base, type: 'host_payout', direction: 'out', amount: 20000, createdAt: '' },
    ];
    let net = 0;
    for (const e of entries) {
      const c = csvAmountColumns(e);
      net += (c.moneyIn ?? 0) - (c.moneyOut ?? 0);
    }
    expect(net).toBe(30000 - 20000);
  });
});
