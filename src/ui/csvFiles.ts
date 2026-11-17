// The four CSV files of the export (M7): column names and Indonesian labels, built on the pure CSV core in
// src/domain/csv.ts. Display only: every amount comes from the repositories as a plain integer.
// A CSV is for reading in a spreadsheet. It is NOT a backup and is never used to restore data.
import type { CashCountExportRow, ExportsRepo, LedgerExportRow, MeetingDueExportRow, PaymentExportRow, PeriodExportRow } from '@/db/exports';
import { effectiveLines, type StoredCountLine } from '@/domain/cash-count';
import { buildCsv, csvFileName, type CsvCell, type CsvKind } from '@/domain/csv';
import { csvAmountColumns } from '@/domain/flow';
import { ACCOUNT_LABELS } from '@/domain/kas';
import type { Account } from '@/domain/types';
import { CSV_LEDGER_HINT } from './backupLabels';
import { TYPE_LABELS, showsNoPosWarning, visibleNote } from './kasLabels';

const posText = (account: Account | null, type: LedgerExportRow['type']): string => {
  if (account) return ACCOUNT_LABELS[account];
  return showsNoPosWarning({ type, account }) ? 'Belum ada tempat uang' : '';
};

export const LEDGER_HEADER = [
  'Tanggal',
  'Jenis',
  'Tempat uang',
  'Tempat uang tujuan',
  'Anggota',
  'Periode',
  'Pertemuan',
  'Masuk (Rp)',
  'Keluar (Rp)',
  'Tanpa perubahan kas (Rp)',
  'Catatan',
  'Status',
  'Alasan koreksi',
] as const;

const LEDGER_STATUS: Record<LedgerExportRow['status'], string> = {
  in_force: 'Berlaku',
  corrected: 'Dikoreksi',
  reversal: 'Koreksi',
};

/**
 * Buku kas: every ledger row, corrections and reversals included. "Masuk" and "Keluar" hold only money that really
 * entered or left Tunai + Debit (csvAmountColumns). A Tunai <-> Debit move, a write-off and an old Piutang opening
 * balance go in "Tanpa perubahan kas", so summing Masuk minus Keluar gives the real change of the total kas.
 */
export function ledgerCsv(rows: readonly LedgerExportRow[]): string {
  return buildCsv(
    LEDGER_HEADER,
    rows.map((r): CsvCell[] => {
      const amounts = csvAmountColumns(r);
      return [
        r.date,
        TYPE_LABELS[r.type],
        posText(r.account, r.type),
        r.toAccount ? ACCOUNT_LABELS[r.toAccount] : '',
        r.memberName,
        r.periodName,
        r.week,
        amounts.moneyIn,
        amounts.moneyOut,
        amounts.noKasChange,
        visibleNote(r),
        LEDGER_STATUS[r.status],
        r.correctionReason,
      ];
    }),
  );
}

export const PAYMENT_HEADER = ['Tanggal', 'Anggota', 'Periode', 'Jumlah (Rp)', 'Untuk pertemuan', 'Titipan (Rp)', 'Status', 'Alasan koreksi'] as const;

export function paymentsCsv(rows: readonly PaymentExportRow[]): string {
  return buildCsv(
    PAYMENT_HEADER,
    rows.map((r): CsvCell[] => [
      r.date,
      r.memberName,
      r.periodName,
      r.amount,
      r.weeks.join(', '),
      r.corrected ? null : r.credit,
      r.corrected ? 'Dikoreksi' : 'Berlaku',
      r.correctionReason,
    ]),
  );
}

export const MEETING_HEADER = [
  'Periode',
  'Pertemuan',
  'Tanggal pertemuan',
  'Tuan rumah',
  'Status pertemuan',
  'Anggota',
  'Iuran (Rp)',
  'Dibayar (Rp)',
  'Iuran dilunasi lewat potongan (Rp)',
  'Dari titipan (Rp)',
  'Belum dibayar (Rp)',
] as const;

export function meetingDuesCsv(rows: readonly MeetingDueExportRow[]): string {
  return buildCsv(
    MEETING_HEADER,
    rows.map((r): CsvCell[] => [
      r.periodName,
      r.week,
      r.date,
      r.hostName ?? 'Belum ditentukan',
      r.meetingStatus === 'closed' ? 'Ditutup' : r.meetingStatus === 'skipped' ? 'Dilewati' : 'Terbuka',
      r.memberName,
      r.due,
      r.paid,
      r.offset,
      r.credited,
      r.outstanding,
    ]),
  );
}

export const PERIOD_HEADER = [
  'Periode',
  'Status',
  'Mulai',
  'Berakhir',
  'Jumlah anggota',
  'Iuran seharusnya (Rp)',
  'Iuran diterima (Rp)',
  'Pembayaran tuan rumah (Rp)',
  'Dipotong dari bayaran tuan rumah (Rp)',
  'Tunggakan ditanggung kas (Rp)',
  'Pengeluaran bersama (Rp)',
  'Pengembalian titipan (Rp)',
  'Perubahan kas bersih (Rp)',
] as const;

export function periodSummaryCsv(rows: readonly PeriodExportRow[]): string {
  return buildCsv(
    PERIOD_HEADER,
    rows.map((r): CsvCell[] => [
      r.period.name,
      r.period.status === 'active' ? 'Aktif' : 'Berakhir',
      r.period.startDate,
      r.period.endDate,
      r.period.memberCount,
      r.summary.totalDues,
      r.summary.collected,
      r.summary.payouts,
      r.summary.offsets,
      r.summary.writeoffs,
      r.summary.sharedGoal,
      r.summary.creditRefunds,
      r.summary.netKasChange,
    ]),
  );
}

export const CASH_COUNT_HEADER = [
  'Tanggal hitung',
  'Periode',
  'Pertemuan',
  'Tempat uang',
  'Tercatat (Rp)',
  'Dihitung (Rp)',
  'Selisih (Rp)',
  'Catatan',
  'Status',
] as const;

/**
 * Cek kas: one row per counted place (a count with Debit gives two rows; a skipped Debit has no Debit row). Selisih =
 * dihitung - tercatat as stored. "Berlaku" = the latest line per (period, meeting, place), the one the app uses;
 * every other line is "Diganti" and stays as history.
 */
export function cashCountsCsv(rows: readonly CashCountExportRow[]): string {
  const asLines: StoredCountLine[] = rows.map((r) => ({
    seq: r.seq,
    batchId: '',
    periodId: r.periodId,
    week: r.week,
    account: r.account,
    date: r.date,
    expected: r.expected,
    counted: r.counted,
    difference: r.difference,
    note: r.note ?? '',
  }));
  const inForce = new Set(effectiveLines(asLines).map((l) => l.seq));
  return buildCsv(
    CASH_COUNT_HEADER,
    rows.map((r): CsvCell[] => [
      r.date,
      r.periodName,
      r.week,
      ACCOUNT_LABELS[r.account],
      r.expected,
      r.counted,
      r.difference,
      r.note,
      inForce.has(r.seq) ? 'Berlaku' : 'Diganti',
    ]),
  );
}

export interface CsvFileSpec {
  kind: CsvKind;
  /** Button text. */
  label: string;
  /** One line under the button. */
  hint: string;
  /** Optional longer explanation, shown as a second caption. */
  detail?: string;
}

export const CSV_FILES: readonly CsvFileSpec[] = [
  { kind: 'buku-kas', label: 'Buku kas', hint: 'Semua catatan kas, termasuk koreksi.', detail: CSV_LEDGER_HINT },
  { kind: 'pembayaran', label: 'Pembayaran', hint: 'Setiap pembayaran iuran anggota.' },
  { kind: 'iuran-per-pertemuan', label: 'Iuran per pertemuan', hint: 'Status iuran tiap anggota di tiap pertemuan.' },
  { kind: 'ringkasan-periode', label: 'Ringkasan periode', hint: 'Total tiap periode.' },
  {
    kind: 'cek-kas',
    label: 'Cek kas',
    hint: 'Hitungan uang fisik tiap pertemuan, termasuk hitungan lama.',
    detail: 'Selisih = dihitung - tercatat. Hanya hitungan berstatus Berlaku yang dipakai di aplikasi; hitungan yang sudah diganti tetap ada sebagai riwayat.',
  },
];

export { csvFileName };

/** Loads the rows of one file and builds its text. Read-only. */
export async function buildCsvFor(kind: CsvKind, repos: { exports: ExportsRepo }): Promise<string> {
  switch (kind) {
    case 'buku-kas':
      return ledgerCsv(await repos.exports.listLedger());
    case 'pembayaran':
      return paymentsCsv(await repos.exports.listPayments());
    case 'iuran-per-pertemuan':
      return meetingDuesCsv(await repos.exports.listMeetingDues());
    case 'ringkasan-periode':
      return periodSummaryCsv(await repos.exports.listPeriodSummaries());
    case 'cek-kas':
      return cashCountsCsv(await repos.exports.listCashCounts());
  }
}
