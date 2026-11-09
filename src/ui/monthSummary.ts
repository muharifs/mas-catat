// Texts of the "Bulan ini" summary on Beranda. Pure; the numbers come from summarizeMonth, never computed here.
import { formatRupiah } from './format';
import { formatMonth } from './months';

/** "Bulan ini (November)": the month name only, the year is in the spoken label. */
export function monthSummaryTitle(month: string): string {
  return `Bulan ini (${formatMonth(month).split(' ')[0]})`;
}

/** Spoken label of the whole block. While hidden it says no amounts. */
export function monthSummaryLabel(month: string, moneyIn: number, moneyOut: number, hidden: boolean): string {
  const head = `Bulan ini, ${formatMonth(month)}.`;
  return hidden
    ? `${head} Pemasukan dan pengeluaran disembunyikan.`
    : `${head} Pemasukan ${formatRupiah(moneyIn)}. Pengeluaran ${formatRupiah(moneyOut)}.`;
}
