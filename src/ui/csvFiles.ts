// The four CSV files of the export (M7): column names and Indonesian labels, built on the pure CSV core in
// src/domain/csv.ts. Display only: every amount comes from the repositories as a plain integer.
// A CSV is for reading in a spreadsheet. It is NOT a backup and is never used to restore data.
import type { ExportsRepo, LedgerExportRow, MeetingDueExportRow, PaymentExportRow, PeriodExportRow } from '@/db/exports';
import { buildCsv, csvFileName, type CsvCell, type CsvKind } from '@/domain/csv';
import { ACCOUNT_LABELS } from '@/domain/kas';
import type { Account } from '@/domain/types';
import { TYPE_LABELS, showsNoPosWarning, visibleNote } from './kasLabels';

const posText = (account: Account | null, type: LedgerExportRow['type']): string => {
  if (account) return ACCOUNT_LABELS[account];
  return showsNoPosWarning({ type, account }) ? 'Tanpa pos' : '';
};

export const LEDGER_HEADER = [
  'Tanggal',
  'Jenis',
  'Pos',
  'Pos tujuan',
  'Anggota',
  'Periode',
  'Pertemuan',
  'Masuk (Rp)',
  'Keluar (Rp)',
  'Catatan',
  'Status',
  'Alasan koreksi',
] as const;

const LEDGER_STATUS: Record<LedgerExportRow['status'], string> = {
  in_force: 'Berlaku',
  corrected: 'Dikoreksi',
  reversal: 'Koreksi',
};

/** Buku kas: every ledger row, corrections and reversals included. A move between pos is listed under "Keluar". */
export function ledgerCsv(rows: readonly LedgerExportRow[]): string {
  return buildCsv(
    LEDGER_HEADER,
    rows.map((r): CsvCell[] => [
      r.date,
      TYPE_LABELS[r.type],
      posText(r.account, r.type),
      r.toAccount ? ACCOUNT_LABELS[r.toAccount] : '',
      r.memberName,
      r.periodName,
      r.week,
      r.direction === 'in' ? r.amount : null,
      r.direction === 'out' ? r.amount : null,
      visibleNote(r),
      LEDGER_STATUS[r.status],
      r.correctionReason,
    ]),
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
  'Potongan tuan rumah (Rp)',
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
      r.meetingStatus === 'closed' ? 'Ditutup' : 'Terbuka',
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
  'Selesai',
  'Jumlah anggota',
  'Iuran seharusnya (Rp)',
  'Iuran diterima (Rp)',
  'Pembayaran tuan rumah (Rp)',
  'Potongan tunggakan tuan rumah (Rp)',
  'Penghapusan tunggakan (Rp)',
  'Pengeluaran bersama (Rp)',
  'Pengembalian titipan (Rp)',
  'Perubahan kas bersih (Rp)',
] as const;

export function periodSummaryCsv(rows: readonly PeriodExportRow[]): string {
  return buildCsv(
    PERIOD_HEADER,
    rows.map((r): CsvCell[] => [
      r.period.name,
      r.period.status === 'active' ? 'Aktif' : 'Selesai',
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

export interface CsvFileSpec {
  kind: CsvKind;
  /** Button text. */
  label: string;
  /** One line under the button. */
  hint: string;
}

export const CSV_FILES: readonly CsvFileSpec[] = [
  { kind: 'buku-kas', label: 'Buku kas', hint: 'Semua catatan kas, termasuk koreksi.' },
  { kind: 'pembayaran', label: 'Pembayaran', hint: 'Setiap pembayaran iuran anggota.' },
  { kind: 'iuran-per-pertemuan', label: 'Iuran per pertemuan', hint: 'Status iuran tiap anggota di tiap pertemuan.' },
  { kind: 'ringkasan-periode', label: 'Ringkasan periode', hint: 'Total tiap periode.' },
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
  }
}
