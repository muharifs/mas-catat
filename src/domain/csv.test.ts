import { buildCsv, csvCell, csvFileName, CSV_BOM, protectFormula } from './csv';
import { DomainError } from './money';

describe('csvCell: escaping', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('Iuran anggota')).toBe('Iuran anggota');
  });

  it('quotes a cell with the separator', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
  });

  it('quotes a cell with a quote and doubles the quote', () => {
    expect(csvCell('kata "baik"')).toBe('"kata ""baik"""');
  });

  it('quotes a cell with a line break (LF, CRLF)', () => {
    expect(csvCell('baris 1\nbaris 2')).toBe('"baris 1\nbaris 2"');
    expect(csvCell('baris 1\r\nbaris 2')).toBe('"baris 1\r\nbaris 2"');
  });

  it('does not quote a comma (the separator is a semicolon)', () => {
    expect(csvCell('a,b')).toBe('a,b');
  });

  it('writes null as an empty cell', () => {
    expect(csvCell(null)).toBe('');
  });
});

describe('csvCell: numbers', () => {
  it('writes integers plainly, negative too', () => {
    expect(csvCell(15000)).toBe('15000');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(-5000)).toBe('-5000');
  });

  it('does not touch a negative number with the formula protection', () => {
    expect(csvCell(-5000)).not.toContain("'");
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60])('rejects %p (not a safe integer)', (value) => {
    expect(() => csvCell(value)).toThrow(DomainError);
  });
});

describe('formula protection on text', () => {
  it.each([
    ['=', '=1+1'],
    ['+', '+62812'],
    ['-', '-5'],
    ['@', '@SUM(A1)'],
    ['TAB', '\tcmd'],
  ])('prefixes an apostrophe for %s', (_name, text) => {
    expect(protectFormula(text)).toBe(`'${text}`);
    expect(csvCell(text)).toBe(`'${text}`);
  });

  it('prefixes an apostrophe for CR, and the cell is then quoted because of the CR', () => {
    expect(protectFormula('\rx')).toBe("'\rx");
    expect(csvCell('\rx')).toBe(`"'\rx"`);
  });

  it('prefixes an apostrophe for LF, and looks past leading spaces and a BOM', () => {
    expect(protectFormula('\nx')).toBe("'\nx");
    expect(csvCell(' =x')).toBe("' =x");
    expect(csvCell('  @SUM(A1)')).toBe("'  @SUM(A1)");
    expect(protectFormula('﻿=1+1')).toBe("'﻿=1+1");
    expect(protectFormula('   ')).toBe('   ');
  });

  it('protects first, then quotes (a formula with a separator)', () => {
    expect(csvCell('=HYPERLINK("http://x";"y")')).toBe(`"'=HYPERLINK(""http://x"";""y"")"`);
  });

  it('does not touch text that only contains those characters later on', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('Rp 5 - 10')).toBe('Rp 5 - 10');
    expect(csvCell('a =x')).toBe('a =x');
  });

  it('does not touch an ISO date', () => {
    expect(csvCell('2026-01-04')).toBe('2026-01-04');
  });

  it('protects the header row too', () => {
    expect(buildCsv(['=x'], [])).toBe(`${CSV_BOM}'=x\r\n`);
  });
});

describe('buildCsv', () => {
  it('starts with the UTF-8 BOM, uses ; and CRLF, and ends with CRLF', () => {
    const text = buildCsv(['Tanggal', 'Masuk (Rp)'], [['2026-01-04', 15000], ['2026-01-11', null]]);
    expect(text).toBe(`${CSV_BOM}Tanggal;Masuk (Rp)\r\n2026-01-04;15000\r\n2026-01-11;\r\n`);
    expect(text.charCodeAt(0)).toBe(0xfeff);
  });

  it('encodes the BOM as the bytes EF BB BF in UTF-8', () => {
    const bytes = new TextEncoder().encode(buildCsv(['a'], []));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('writes a header only file when there are no rows', () => {
    expect(buildCsv(['A', 'B'], [])).toBe(`${CSV_BOM}A;B\r\n`);
  });

  it('keeps a multi line note in ONE record (quoted), so a spreadsheet does not split the row', () => {
    const text = buildCsv(['Catatan', 'Jumlah'], [['a\nb', 1]]);
    expect(text).toBe(`${CSV_BOM}Catatan;Jumlah\r\n"a\nb";1\r\n`);
  });

  it('rejects a row whose length differs from the header', () => {
    expect(() => buildCsv(['A', 'B'], [['x']])).toThrow(/csv row 1 has 1 cells/);
  });

  it('rejects a non integer amount', () => {
    expect(() => buildCsv(['A'], [[0.1 + 0.2]])).toThrow(DomainError);
  });
});

describe('csvFileName', () => {
  it('has the kind and the date and no names', () => {
    expect(csvFileName('buku-kas', '2026-11-06')).toBe('mascatat-buku-kas-20261106.csv');
    expect(csvFileName('ringkasan-periode', '2026-01-04')).toBe('mascatat-ringkasan-periode-20260104.csv');
    expect(csvFileName('cek-kas', '2026-01-04')).toBe('mascatat-cek-kas-20260104.csv');
  });

  it('rejects a date that is not ISO', () => {
    expect(() => csvFileName('pembayaran', '4 Jan 2026')).toThrow(DomainError);
  });
});
