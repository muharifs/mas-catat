// CSV building for the spreadsheet export (M7). Pure functions: no file system, no sharing, no database.
//
// Format decisions (owner, M7):
// - UTF-8 with a BOM, so Excel shows Indonesian text correctly.
// - ';' between cells (Indonesian Excel uses ';' because ',' is the decimal mark), CRLF between rows.
// - Money is a plain integer rupiah ("15000"), never a formatted string. Dates are "YYYY-MM-DD".
// - A text cell that starts with = + - @ TAB CR or LF (after any spaces or BOM) gets a leading apostrophe, so a spreadsheet never runs
//   it as a formula (CSV injection). Number cells are NOT touched: a negative number must stay a number.
// A CSV is for reading in a spreadsheet only. It is never a backup and the app never restores from it.
import { DomainError } from './money';
import type { IsoDate } from './types';

/** string = text (formula-protected), number = integer (rupiah or a count), null = empty cell. */
export type CsvCell = string | number | null;

export const CSV_BOM = '﻿';
export const CSV_SEPARATOR = ';';
export const CSV_NEWLINE = '\r\n';

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r', '\n'];

/** Puts an apostrophe in front of text that a spreadsheet could read as a formula. */
export function protectFormula(text: string): string {
  // Some spreadsheets skip leading spaces and a BOM before reading a formula, so look past them.
  const first = text.replace(/^[ ﻿]+/, '').charAt(0);
  return FORMULA_PREFIXES.includes(first) ? `'${text}` : text;
}

/** Quotes a text when it holds the separator, a quote or a line break; quotes inside are doubled. */
function quoteIfNeeded(text: string): string {
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** One cell as it appears in the file. Numbers must be integers (money is never floating point). */
export function csvCell(cell: CsvCell): string {
  if (cell === null) return '';
  if (typeof cell === 'number') {
    if (!Number.isSafeInteger(cell)) throw new DomainError(`csv number cell must be an integer, got ${cell}`);
    return String(cell);
  }
  return quoteIfNeeded(protectFormula(cell));
}

/** The whole file: BOM, header row, data rows, every row ended by CRLF. */
export function buildCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines: string[] = [];
  lines.push(header.map((h) => csvCell(h)).join(CSV_SEPARATOR));
  rows.forEach((row, index) => {
    if (row.length !== header.length) {
      throw new DomainError(`csv row ${index + 1} has ${row.length} cells, the header has ${header.length}`);
    }
    lines.push(row.map(csvCell).join(CSV_SEPARATOR));
  });
  return CSV_BOM + lines.join(CSV_NEWLINE) + CSV_NEWLINE;
}

export type CsvKind = 'buku-kas' | 'pembayaran' | 'iuran-per-pertemuan' | 'ringkasan-periode' | 'cek-kas';

/** "mascatat-buku-kas-20261106.csv": no member names, no period names. */
export function csvFileName(kind: CsvKind, date: IsoDate): string {
  const compact = date.replace(/-/g, '');
  if (!/^\d{8}$/.test(compact)) throw new DomainError(`csv file date must be an ISO date, got ${date}`);
  return `mascatat-${kind}-${compact}.csv`;
}
