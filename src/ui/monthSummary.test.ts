import { monthSummaryLabel, monthSummaryTitle } from './monthSummary';

describe('month summary texts', () => {
  test('title has the month name', () => {
    expect(monthSummaryTitle('2026-11')).toBe('Bulan ini (November)');
  });

  test('label has the amounts when visible', () => {
    const label = monthSummaryLabel('2026-11', 150000, 20000, false);
    expect(label).toMatch(/^Bulan ini, November 2026\. Pemasukan Rp/);
    expect(label).toContain('150.000');
    expect(label).toContain('20.000');
  });

  test('label has no digits of the amounts when hidden', () => {
    const label = monthSummaryLabel('2026-11', 150000, 20000, true);
    expect(label).toBe('Bulan ini, November 2026. Pemasukan dan pengeluaran disembunyikan.');
  });
});
