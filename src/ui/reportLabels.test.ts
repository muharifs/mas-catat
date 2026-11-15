import type { HistoryEvent, HistoryEventKind } from '@/domain/report';
import {
  CORRECTED_NOT_COUNTED,
  correctionText,
  EVENT_LABELS,
  EXPECTED_FORMULA,
  EXPECTED_SUBTITLE,
  EXPECTED_LABELS,
  eventLines,
  isSettledState,
  LOAN_LABELS,
  MEETING_STATUS_LABELS,
  settledText,
  unpaidPayoutText,
  WEEK_STATE_LABELS,
  weekStateTone,
} from './reportLabels';

const event = (p: Partial<HistoryEvent> & Pick<HistoryEvent, 'kind'>): HistoryEvent => ({
  date: '2026-01-06',
  amount: 15_000,
  reversed: false,
  reversalReason: null,
  settled: [],
  credit: 0,
  releasedBySkip: 0,
  week: null,
  otherPeriodName: null,
  account: null,
  ...p,
});

describe('report labels', () => {
  it('never uses the word "kredit" in any text', () => {
    const all = [
      ...Object.values(EVENT_LABELS),
      ...Object.values(LOAN_LABELS),
      ...Object.values(WEEK_STATE_LABELS),
      ...Object.values(EXPECTED_LABELS),
      EXPECTED_FORMULA,
      EXPECTED_SUBTITLE,
      CORRECTED_NOT_COUNTED,
      unpaidPayoutText(0),
      unpaidPayoutText(2),
    ];
    for (const text of all) expect(text.toLowerCase()).not.toContain('kredit');
  });

  it('names written-off arrears "Tunggakan ditanggung kas"', () => {
    expect(EVENT_LABELS.writeoff).toBe('Tunggakan ditanggung kas');
  });

  it('names the report line "Titipan anggota"', () => {
    expect(EXPECTED_LABELS.titipan).toBe('Titipan anggota');
  });

  it('marks the two titipan breakdown lines as a breakdown and names a partial week plainly', () => {
    expect(EXPECTED_LABELS.titipanAvailable).toBe('Rincian titipan: belum dipakai');
    expect(EXPECTED_LABELS.titipanCarried).toMatch(/^Rincian titipan: /);
    expect(WEEK_STATE_LABELS.partial).toBe('Baru sebagian');
  });

  it('has a label for every event kind', () => {
    const kinds: HistoryEventKind[] = ['payment', 'host_payout', 'host_offset', 'titipan_carry_in', 'titipan_carry_out', 'titipan_settle', 'writeoff', 'refund'];
    for (const k of kinds) expect(EVENT_LABELS[k].length).toBeGreaterThan(0);
  });

  it('lists settled meetings with amounts', () => {
    expect(settledText([{ week: 1, amount: 15_000 }, { week: 2, amount: 5_000 }])).toBe('pertemuan 1 (Rp15.000), pertemuan 2 (Rp5.000)');
    expect(settledText([])).toBe('');
  });

  it('describes a payment with the meetings it settled and the part that became titipan', () => {
    expect(eventLines(event({ kind: 'payment', amount: 45_000, settled: [{ week: 1, amount: 30_000 }], credit: 15_000 }))).toEqual([
      'Melunasi: pertemuan 1 (Rp30.000)',
      'Menjadi titipan: Rp15.000',
    ]);
  });

  it('describes carry-in, carry-out, write-off and refund', () => {
    expect(eventLines(event({ kind: 'titipan_carry_in', otherPeriodName: 'Lama', settled: [{ week: 1, amount: 5_000 }] }))).toEqual([
      'Dari Lama',
      'Melunasi: pertemuan 1 (Rp5.000)',
    ]);
    expect(eventLines(event({ kind: 'titipan_carry_out', otherPeriodName: 'Baru' }))).toEqual(['Ke Baru']);
    expect(eventLines(event({ kind: 'writeoff' }))[0]).toContain('Tidak mengubah saldo kas');
    expect(eventLines(event({ kind: 'refund', account: 'debit' }))).toEqual(['Uang keluar dari Debit']);
  });

  it('shows the correction text only for corrected items', () => {
    expect(correctionText({ reversed: false, reversalReason: null })).toBeNull();
    expect(correctionText({ reversed: true, reversalReason: 'salah catat' })).toBe('Dikoreksi: salah catat');
    expect(correctionText({ reversed: true, reversalReason: null })).toBe('Dikoreksi');
  });

  it('treats paid, offset and credited weeks as settled', () => {
    expect(isSettledState('paid')).toBe(true);
    expect(isSettledState('offset')).toBe(true);
    expect(isSettledState('credited')).toBe(true);
    expect(isSettledState('partial')).toBe(false);
    expect(isSettledState('unpaid')).toBe(false);
  });

  it('words the unpaid payout info row', () => {
    expect(unpaidPayoutText(0)).toBe('Semua pertemuan yang ditutup sudah dibayar.');
    expect(unpaidPayoutText(2)).toContain('2 pertemuan');
  });
});

describe('report labels: a skipped meeting (decision 33)', () => {
  it('words the state and the meeting status "Dilewati"', () => {
    expect(WEEK_STATE_LABELS.skipped).toBe('Dilewati');
    expect(MEETING_STATUS_LABELS.skipped).toBe('Dilewati');
  });

  it('colours a skipped state neutral: not settled (green) and not arrears (red)', () => {
    expect(isSettledState('skipped')).toBe(false);
    expect(weekStateTone('skipped')).toBe('neutral');
    expect(weekStateTone('paid')).toBe('ok');
    expect(weekStateTone('offset')).toBe('ok');
    expect(weekStateTone('credited')).toBe('ok');
    for (const s of ['unpaid', 'partial', 'partial_offset', 'partial_credited'] as const) expect(weekStateTone(s)).toBe('bad');
  });

  it('a payment that used to settle the skipped meeting shows the titipan and never lists the skipped meeting', () => {
    // The domain already left the skipped meeting out of `settled` and counted it in `credit`.
    const lines = eventLines(event({ kind: 'payment', amount: 45_000, settled: [{ week: 1, amount: 30_000 }], credit: 15_000, releasedBySkip: 15_000 }));
    expect(lines).toEqual(['Melunasi: pertemuan 1 (Rp30.000)', 'Menjadi titipan: Rp15.000']);
    expect(lines.join(' ')).not.toContain('pertemuan 19');
  });

  it('a host offset that fell on the skipped meeting becomes titipan of the host', () => {
    expect(eventLines(event({ kind: 'host_offset', week: 5, amount: 30_000, settled: [{ week: 3, amount: 15_000 }], releasedBySkip: 15_000 }))).toEqual([
      'Pertemuan 5',
      'Melunasi: pertemuan 3 (Rp15.000)',
      'Menjadi titipan: Rp15.000',
    ]);
  });

  it('carried-in titipan released by the skip is titipan again', () => {
    expect(eventLines(event({ kind: 'titipan_carry_in', otherPeriodName: 'Lama', amount: 15_000, settled: [{ week: 1, amount: 15_000 }], releasedBySkip: 5_000 }))).toEqual([
      'Dari Lama',
      'Melunasi: pertemuan 1 (Rp15.000)',
      'Menjadi titipan: Rp5.000',
    ]);
  });
});
