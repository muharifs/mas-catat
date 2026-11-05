import { createRepositories } from '@/db';
import { seedClosedPeriodHistory, seedSampleData } from '@/db/testing/backupFixtures';
import { createMigratedTestDb } from '@/db/testing/sqlJsDriver';
import { CSV_BOM } from '@/domain/csv';
import { buildCsvFor, ledgerCsv, LEDGER_HEADER, meetingDuesCsv, MEETING_HEADER, paymentsCsv, PAYMENT_HEADER, periodSummaryCsv, PERIOD_HEADER } from './csvFiles';

/** Splits a file we built into records (our own quoting only: quotes double, quoted cells may hold CR/LF). */
function parse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const body = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  for (let i = 0; i < body.length; i += 1) {
    const c = body.charAt(i);
    if (quoted) {
      if (c === '"' && body.charAt(i + 1) === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && body.charAt(i + 1) === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += c;
  }
  return rows;
}

async function history() {
  const db = await createMigratedTestDb();
  const { repos } = await seedSampleData(db);
  return { db, repos };
}

describe('buku-kas', () => {
  it('has the agreed columns and every row of the ledger, corrections and reversals included', async () => {
    const { db, repos } = await history();
    const rows = await repos.exports.listLedger();
    const table = parse(ledgerCsv(rows));
    expect(table[0]).toEqual([...LEDGER_HEADER]);
    expect(table.length - 1).toBe((await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries'))?.n);
    const statuses = table.slice(1).map((r) => r[10]);
    expect(statuses).toContain('Dikoreksi');
    expect(statuses).toContain('Koreksi');
    expect(statuses).toContain('Berlaku');
    const reversal = table.slice(1).find((r) => r[10] === 'Koreksi');
    expect(reversal?.[1]).toBe('Koreksi');
    expect(reversal?.[11]).toBe('salah orang');
    // the corrected original carries the reason too
    expect(table.slice(1).find((r) => r[10] === 'Dikoreksi')?.[11]).toBe('salah orang');
  });

  it('sums of Masuk and Keluar equal the ledger sums (plain integers)', async () => {
    const { db, repos } = await history();
    const table = parse(ledgerCsv(await repos.exports.listLedger())).slice(1);
    const sum = (col: number) => table.reduce((t, r) => t + Number(r[col] || 0), 0);
    const inSql = (await db.getFirst<{ s: number }>("SELECT SUM(amount) AS s FROM ledger_entries WHERE direction = 'in'"))?.s;
    const outSql = (await db.getFirst<{ s: number }>("SELECT SUM(amount) AS s FROM ledger_entries WHERE direction = 'out'"))?.s;
    expect(sum(7)).toBe(inSql);
    expect(sum(8)).toBe(outSql);
    for (const r of table) {
      expect(r[7]).toMatch(/^\d*$/);
      expect(r[8]).toMatch(/^\d*$/);
      expect(r[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('puts the week empty on member payments and a transfer shows both pos', async () => {
    const { repos } = await history();
    const table = parse(ledgerCsv(await repos.exports.listLedger())).slice(1);
    for (const r of table.filter((x) => x[1] === 'Iuran anggota')) expect(r[6]).toBe('');
    const transfer = table.find((r) => r[1] === 'Pindah saldo');
    expect(transfer?.[2]).toBe('Tunai');
    expect(transfer?.[3]).toBe('Debit');
  });

  it('writes the owner note and protects a note that looks like a formula', async () => {
    const { repos } = await history();
    await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-02-01', amount: 5_000, account: 'tunai', note: '=HYPERLINK("http://x";"y")' });
    await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-02-02', amount: 5_000, account: 'tunai', note: 'baris 1\nbaris 2; "kutip"' });
    const text = ledgerCsv(await repos.exports.listLedger());
    expect(text).toContain(`"'=HYPERLINK(""http://x"";""y"")"`);
    const table = parse(text).slice(1);
    expect(table.find((r) => r[9]?.startsWith("'="))).toBeDefined();
    expect(table.find((r) => r[9] === 'baris 1\nbaris 2; "kutip"')).toBeDefined(); // one record, not split
  });

  it('protects member and period names that start with a formula character', async () => {
    const db = await createMigratedTestDb();
    const repos = createRepositories(db);
    const m = await repos.members.create('=cmd|calc');
    await repos.periods.create({ name: '+Periode', startDate: '2026-01-06', memberIds: [m.id] });
    await repos.ledger.recordKas({ kind: 'loan', date: '2026-01-07', amount: 1000, account: 'tunai', memberId: m.id });
    const row = parse(ledgerCsv(await repos.exports.listLedger()))[1];
    expect(row?.[4]).toBe("'=cmd|calc");
    expect(row?.[5]).toBe("'+Periode");
  });

  it('uses "Titipan" and never "kredit"', async () => {
    const db = await createMigratedTestDb();
    await seedClosedPeriodHistory(db);
    const repos = createRepositories(db);
    const all = [
      ledgerCsv(await repos.exports.listLedger()),
      paymentsCsv(await repos.exports.listPayments()),
      meetingDuesCsv(await repos.exports.listMeetingDues()),
      periodSummaryCsv(await repos.exports.listPeriodSummaries()),
    ].join('\n');
    expect(all.toLowerCase()).not.toContain('kredit');
    expect(all).toContain('Titipan');
  });
});

describe('pembayaran', () => {
  it('lists every payment with the meetings it paid, the titipan part and the status', async () => {
    const { repos } = await history();
    const table = parse(paymentsCsv(await repos.exports.listPayments()));
    expect(table[0]).toEqual([...PAYMENT_HEADER]);
    expect(table.length - 1).toBe(4);
    const first = table.find((r) => r[3] === '30000');
    expect(first?.[4]).toBe('1, 2');
    expect(first?.[5]).toBe('0');
    const corrected = table.find((r) => r[6] === 'Dikoreksi');
    expect(corrected?.[4]).toBe('');
    expect(corrected?.[5]).toBe('');
    expect(corrected?.[7]).toBe('salah orang');
  });

  it('shows titipan for a payment above the dues', async () => {
    const db = await createMigratedTestDb();
    await seedClosedPeriodHistory(db);
    const table = parse(paymentsCsv(await createRepositories(db).exports.listPayments()));
    expect(table.find((r) => r[3] === '60000')?.[5]).toBe('15000');
  });
});

describe('iuran-per-pertemuan', () => {
  it('has one row per member per meeting and the amounts add up to the due', async () => {
    const { repos } = await history();
    const table = parse(meetingDuesCsv(await repos.exports.listMeetingDues()));
    expect(table[0]).toEqual([...MEETING_HEADER]);
    expect(table.length - 1).toBe(4 * 4);
    for (const r of table.slice(1)) {
      expect(Number(r[7]) + Number(r[8]) + Number(r[9]) + Number(r[10])).toBe(Number(r[6]));
      expect(r[6]).toBe('15000');
    }
    const week1 = table.slice(1).filter((r) => r[1] === '1');
    expect(week1[0]?.[4]).toBe('Ditutup');
    expect(table.slice(1).filter((r) => r[4] === 'Terbuka').length).toBe(12);
  });

  it('is sorted by member name inside a meeting', async () => {
    const { repos } = await history();
    const names = parse(meetingDuesCsv(await repos.exports.listMeetingDues()))
      .slice(1)
      .filter((r) => r[1] === '1')
      .map((r) => r[5]);
    expect(names).toEqual([...names].sort((a, b) => (a ?? '').localeCompare(b ?? '')));
  });
});

describe('ringkasan-periode', () => {
  it('has one row per period with plain integer totals, a negative net stays a number', async () => {
    const db = await createMigratedTestDb();
    await seedClosedPeriodHistory(db);
    const table = parse(periodSummaryCsv(await createRepositories(db).exports.listPeriodSummaries()));
    expect(table[0]).toEqual([...PERIOD_HEADER]);
    expect(table.length - 1).toBe(2);
    expect(table[1]?.[0]).toBe('Periode lama');
    expect(table[1]?.[1]).toBe('Selesai');
    expect(table[2]?.[1]).toBe('Aktif');
    expect(table[2]?.[3]).toBe('');
    for (const r of table.slice(1)) for (const v of r.slice(4)) expect(v).toMatch(/^-?\d+$/);
  });

  it('writes a negative net kas change without an apostrophe', () => {
    const text = periodSummaryCsv([
      {
        period: { id: 'p', name: 'P', memberCount: 1, status: 'active', startDate: '2026-01-06', endDate: null, createdAt: 'x' },
        summary: { totalDues: 15000, collected: 0, payouts: 10000, offsets: 0, writeoffs: 0, sharedGoal: 0, creditRefunds: 0, netKasChange: -10000 },
      },
    ]);
    expect(text).toContain(';-10000\r\n');
    expect(text).not.toContain("'-10000");
  });
});

describe('buildCsvFor', () => {
  it.each(['buku-kas', 'pembayaran', 'iuran-per-pertemuan', 'ringkasan-periode'] as const)('builds %s with a BOM and CRLF', async (kind) => {
    const { repos } = await history();
    const text = await buildCsvFor(kind, repos);
    expect(text.startsWith(CSV_BOM)).toBe(true);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text).not.toContain('\n\r');
  });

  it('works on an empty database (header only)', async () => {
    const db = await createMigratedTestDb();
    const text = await buildCsvFor('buku-kas', createRepositories(db));
    expect(text).toBe(`${CSV_BOM}${LEDGER_HEADER.join(';')}\r\n`);
  });
});
