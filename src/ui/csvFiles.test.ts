import { createRepositories } from '@/db';
import { seedClosedPeriodHistory, seedSampleData } from '@/db/testing/backupFixtures';
import { createMigratedTestDb } from '@/db/testing/sqlJsDriver';
import { CSV_BOM } from '@/domain/csv';
import type { CashCountExportRow } from '@/db/exports';
import { buildCsvFor, cashCountsCsv, CASH_COUNT_HEADER, CSV_FILES, csvFileName, ledgerCsv, LEDGER_HEADER, meetingDuesCsv, MEETING_HEADER, paymentsCsv, PAYMENT_HEADER, periodSummaryCsv, PERIOD_HEADER } from './csvFiles';

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
    expect(LEDGER_HEADER.slice(7, 10)).toEqual(['Masuk (Rp)', 'Keluar (Rp)', 'Tanpa perubahan kas (Rp)']);
    expect(LEDGER_HEADER).not.toContain('Pos');
    expect(table.length - 1).toBe((await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries'))?.n);
    const statuses = table.slice(1).map((r) => r[11]);
    expect(statuses).toContain('Dikoreksi');
    expect(statuses).toContain('Koreksi');
    expect(statuses).toContain('Berlaku');
    const reversal = table.slice(1).find((r) => r[11] === 'Koreksi');
    expect(reversal?.[1]).toBe('Koreksi');
    expect(reversal?.[12]).toBe('salah orang');
    // the corrected original carries the reason too
    expect(table.slice(1).find((r) => r[11] === 'Dikoreksi')?.[12]).toBe('salah orang');
  });

  it('Masuk minus Keluar equals the real change of the total kas; a Tunai-Debit move is not counted in either', async () => {
    const { repos } = await history();
    const table = parse(ledgerCsv(await repos.exports.listLedger())).slice(1);
    const sum = (col: number) => table.reduce((t, r) => t + Number(r[col] || 0), 0);
    const balances = await repos.ledger.getKasBalances();
    expect(sum(7) - sum(8)).toBe(balances.actual);
    for (const r of table) {
      expect(r[7]).toMatch(/^\d*$/);
      expect(r[8]).toMatch(/^\d*$/);
      expect(r[9]).toMatch(/^\d*$/);
      expect(r[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const transfers = table.filter((r) => r[1] === 'Pindah saldo');
    expect(transfers.length).toBeGreaterThan(0);
    for (const t of transfers) {
      expect(t[7]).toBe('');
      expect(t[8]).toBe('');
      expect(t[9]).toBe('50000');
    }
  });

  it('keeps the rule with loans, repayments, an old Piutang balance, a write-off and a correction', async () => {
    const db = await createMigratedTestDb();
    const { repos, memberIds } = await seedClosedPeriodHistory(db);
    const [m1, , m3] = memberIds as [string, string, string];
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-11-06', amount: 100_000, account: 'tunai' });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-11-06', amount: 40_000, account: 'piutang', memberId: m3 });
    await repos.ledger.recordKas({ kind: 'transfer', date: '2026-11-07', amount: 30_000, account: 'tunai', toAccount: 'debit' });
    await repos.ledger.recordKas({ kind: 'transfer', date: '2026-11-07', amount: 10_000, account: 'debit', toAccount: 'tunai' });
    await repos.ledger.recordKas({ kind: 'loan', date: '2026-11-08', amount: 25_000, account: 'tunai', memberId: m1 });
    await repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-11-09', amount: 5_000, memberId: m1 });
    const shared = await repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-11-09', amount: 20_000, account: 'debit', note: 'tur' });
    await repos.ledger.reverseEntry(shared.id, 'salah');
    const rows = await repos.exports.listLedger();
    expect(rows.some((r) => r.type === 'debt_writeoff')).toBe(true);
    const table = parse(ledgerCsv(rows)).slice(1);
    const sum = (col: number) => table.reduce((t, r) => t + Number(r[col] || 0), 0);
    expect(sum(7) - sum(8)).toBe((await repos.ledger.getKasBalances()).actual);
    const byType = (label: string) => table.filter((r) => r[1] === label);
    expect(byType('Pinjaman ke anggota').map((r) => [r[7], r[8], r[9]])).toEqual([['', '25000', '']]);
    expect(byType('Pelunasan pinjaman').map((r) => [r[7], r[8], r[9]])).toEqual([['5000', '', '']]);
    const writeoffs = byType('Tunggakan ditanggung kas');
    expect(writeoffs.length).toBeGreaterThan(0); // an empty list would make the loop below check nothing
    for (const r of writeoffs) expect([r[7], r[8]]).toEqual(['', '']);
    expect(byType('Saldo awal').map((r) => [r[7], r[9]])).toEqual(expect.arrayContaining([['', '40000']]));
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
    expect(table.find((r) => r[10]?.startsWith("'="))).toBeDefined();
    expect(table.find((r) => r[10] === 'baris 1\nbaris 2; "kutip"')).toBeDefined(); // one record, not split
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

/** Expected "Dicatat" cell built from the local Date getters, so the test does not depend on the machine time zone. */
function localStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe('kolom Dicatat', () => {
  it('is the LAST column of Buku kas and Pembayaran; the old columns keep their order', () => {
    expect(LEDGER_HEADER[LEDGER_HEADER.length - 1]).toBe('Dicatat');
    expect(LEDGER_HEADER.slice(0, 13)).toEqual([
      'Tanggal', 'Jenis', 'Tempat uang', 'Tempat uang tujuan', 'Anggota', 'Periode', 'Pertemuan',
      'Masuk (Rp)', 'Keluar (Rp)', 'Tanpa perubahan kas (Rp)', 'Catatan', 'Status', 'Alasan koreksi',
    ]);
    expect(PAYMENT_HEADER[PAYMENT_HEADER.length - 1]).toBe('Dicatat');
    expect(PAYMENT_HEADER.slice(0, 8)).toEqual(['Tanggal', 'Anggota', 'Periode', 'Jumlah (Rp)', 'Untuk pertemuan', 'Titipan (Rp)', 'Status', 'Alasan koreksi']);
  });

  it('Buku kas rows hold the local created_at as YYYY-MM-DD HH:mm; a bad value gives an empty cell', async () => {
    const { repos } = await history();
    const rows = await repos.exports.listLedger();
    const table = parse(ledgerCsv(rows));
    expect(table[0]?.length).toBe(LEDGER_HEADER.length);
    rows.forEach((r, i) => {
      expect(table[i + 1]?.length).toBe(LEDGER_HEADER.length);
      expect(table[i + 1]?.[13]).toBe(localStamp(r.createdAt));
      expect(table[i + 1]?.[13]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });
    const first = rows[0]!;
    for (const bad of ['', 'abc', '2026-01-04']) {
      expect(parse(ledgerCsv([{ ...first, createdAt: bad }]))[1]?.[13]).toBe('');
    }
  });

  it('Pembayaran rows hold the local created_at of the payment; a bad value gives an empty cell', async () => {
    const { repos } = await history();
    const rows = await repos.exports.listPayments();
    expect(rows.length).toBeGreaterThan(0);
    const table = parse(paymentsCsv(rows));
    expect(table[0]?.length).toBe(PAYMENT_HEADER.length);
    rows.forEach((r, i) => {
      expect(table[i + 1]?.[8]).toBe(localStamp(r.createdAt));
    });
    expect(parse(paymentsCsv([{ ...rows[0]!, createdAt: '' }]))[1]?.[8]).toBe('');
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
    expect(PERIOD_HEADER).toContain('Tunggakan ditanggung kas (Rp)');
    expect(table.length - 1).toBe(2);
    expect(table[1]?.[0]).toBe('Periode lama');
    expect(table[1]?.[1]).toBe('Berakhir');
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
  it.each(['buku-kas', 'pembayaran', 'iuran-per-pertemuan', 'ringkasan-periode', 'cek-kas'] as const)('builds %s with a BOM and CRLF', async (kind) => {
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

describe('iuran-per-pertemuan: a skipped meeting', () => {
  it('is written as Dilewati with nothing due', () => {
    const table = parse(
      meetingDuesCsv([{ periodName: 'P', week: 3, date: '2026-01-20', hostName: null, meetingStatus: 'skipped', memberName: 'A', due: 0, paid: 0, offset: 0, credited: 0, outstanding: 0 }]),
    );
    expect(table[1]?.slice(4, 11)).toEqual(['Dilewati', 'A', '0', '0', '0', '0', '0']);
  });
});

describe('cek-kas', () => {
  const row = (o: Partial<CashCountExportRow>): CashCountExportRow => ({
    date: '2026-01-13', periodName: 'P', week: 2, account: 'tunai', expected: 100_000, counted: 100_000, difference: 0, note: null, seq: 1, periodId: 'p1', ...o,
  });

  it('is the fifth file, with the agreed label, hint, detail and file name', () => {
    expect(CSV_FILES.map((f) => f.kind)).toEqual(['buku-kas', 'pembayaran', 'iuran-per-pertemuan', 'ringkasan-periode', 'cek-kas']);
    const spec = CSV_FILES[4];
    expect(spec?.label).toBe('Cek kas');
    expect(spec?.hint).toBe('Hitungan uang fisik tiap pertemuan, termasuk hitungan lama.');
    expect(spec?.detail).toBe('Selisih = dihitung - tercatat. Hanya hitungan berstatus Berlaku yang dipakai di aplikasi; hitungan yang sudah diganti tetap ada sebagai riwayat.');
    expect(csvFileName('cek-kas', '2026-11-17')).toBe('mascatat-cek-kas-20261117.csv');
  });

  it('has the agreed header and header only for no counts', () => {
    expect(CASH_COUNT_HEADER).toEqual(['Tanggal hitung', 'Periode', 'Pertemuan', 'Tempat uang', 'Tercatat (Rp)', 'Dihitung (Rp)', 'Selisih (Rp)', 'Catatan', 'Status']);
    expect(cashCountsCsv([])).toBe(`${CSV_BOM}${CASH_COUNT_HEADER.join(';')}\r\n`);
  });

  it('writes one row per place, a negative difference as a plain integer, empty note, and marks replaced counts', () => {
    const table = parse(
      cashCountsCsv([
        row({ seq: 1, account: 'tunai', counted: 90_000, difference: -10_000, note: 'kurang' }),
        row({ seq: 2, account: 'debit', expected: 50_000, counted: 50_000 }),
        row({ seq: 3, account: 'tunai', counted: 100_000, difference: 0 }), // replaces seq 1 (Tunai only, Debit stays from seq 2)
        row({ seq: 4, week: 3, account: 'tunai', periodId: 'p1' }),
        row({ seq: 5, week: 2, periodName: 'Q', periodId: 'p2', account: 'tunai', counted: 5, difference: -99_995 }),
      ]),
    );
    expect(table[0]).toEqual([...CASH_COUNT_HEADER]);
    expect(table[1]).toEqual(['2026-01-13', 'P', '2', 'Tunai', '100000', '90000', '-10000', 'kurang', 'Diganti']);
    expect(table[2]).toEqual(['2026-01-13', 'P', '2', 'Debit', '50000', '50000', '0', '', 'Berlaku']);
    expect(table[3]?.[8]).toBe('Berlaku');
    expect(table[4]?.[8]).toBe('Berlaku');
    // same meeting number in another period is its own group
    expect(table[5]).toEqual(['2026-01-13', 'Q', '2', 'Tunai', '100000', '5', '-99995', '', 'Berlaku']);
  });

  it('reads the real database: every stored line, replaced counts as Diganti, a skipped Debit has no Debit row', async () => {
    const { repos } = await history();
    const form = await repos.cashCounts.form((await repos.periods.getActive())?.id ?? '');
    const periodId = (await repos.periods.getActive())?.id as string;
    const week = form.defaultWeek as number;
    await repos.cashCounts.save({ periodId, week, tunai: 1_000, debit: 0 });
    await repos.cashCounts.save({ periodId, week, tunai: 2_000, debit: null, note: 'ulang' });
    const table = parse(cashCountsCsv(await repos.exports.listCashCounts()));
    expect(table.length - 1).toBe(3);
    expect(table.slice(1).map((r) => [r[3], r[8]])).toEqual([['Tunai', 'Diganti'], ['Debit', 'Berlaku'], ['Tunai', 'Berlaku']]);
    expect(table[3]?.[7]).toBe('ulang');
    for (const r of table.slice(1)) expect(Number(r[6])).toBe(Number(r[5]) - Number(r[4]));
  });
});
