import { dateFieldText, isoToPickerDate, pickerDateToIso } from './datePicker';

describe('isoToPickerDate / pickerDateToIso', () => {
  test('round trip keeps the same calendar day, including month and year ends', () => {
    for (const iso of ['2026-11-09', '2026-01-01', '2026-12-31', '2028-02-29', '2026-03-29', '2026-10-25']) {
      expect(pickerDateToIso(isoToPickerDate(iso, '2026-11-09'))).toBe(iso);
    }
  });

  test('opens at noon local time (safe from daylight-saving shifts)', () => {
    expect(isoToPickerDate('2026-11-09', '2026-11-09').getHours()).toBe(12);
  });

  test('text that is not a real date opens on today', () => {
    expect(pickerDateToIso(isoToPickerDate('', '2026-11-09'))).toBe('2026-11-09');
    expect(pickerDateToIso(isoToPickerDate('2026-02-31', '2026-11-09'))).toBe('2026-11-09');
    expect(pickerDateToIso(isoToPickerDate('2026-1', '2026-11-09'))).toBe('2026-11-09');
  });

  test('a day picked at any time of day maps to that local day', () => {
    expect(pickerDateToIso(new Date(2026, 10, 9, 0, 0, 0))).toBe('2026-11-09');
    expect(pickerDateToIso(new Date(2026, 10, 9, 23, 59, 59))).toBe('2026-11-09');
  });
});

describe('dateFieldText', () => {
  test('today is labelled', () => {
    expect(dateFieldText('2026-11-09', '2026-11-09')).toBe('Hari ini, 9 Nov 2026');
  });

  test('another day is the plain date', () => {
    expect(dateFieldText('2026-11-03', '2026-11-09')).toBe('3 Nov 2026');
  });

  test('not a real date asks to pick one', () => {
    expect(dateFieldText('', '2026-11-09')).toBe('Pilih tanggal');
    expect(dateFieldText('2026-02-31', '2026-11-09')).toBe('Pilih tanggal');
  });
});
