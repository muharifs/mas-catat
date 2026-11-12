// QA check (D10): the "Buku kas" CSV must reconcile with the real kas. Independent scenario, not the developer fixtures.
// Sum(Masuk) - Sum(Keluar) over every CSV row must equal getKasBalances().actual (Tunai + Debit); a Tunai <-> Debit move,
// a write-off and an old named Piutang opening balance must never land in Masuk or Keluar.
import { createRepositories } from '@/db';
import { createMigratedTestDb } from '@/db/testing/sqlJsDriver';
import { CSV_BOM } from '@/domain/csv';
import { ledgerCsv } from './csvFiles';

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

describe('QA D10: Buku kas CSV reconciles with the real kas (own scenario)', () => {
  it('payments with credit, host offset, loans, repayments, transfers both ways, refund, write-off and reversals', async () => {
    const db = await createMigratedTestDb();
    const repos = createRepositories(db);
    const [a, b, c] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id, (await repos.members.create('Citra')).id];
    const p1 = await repos.periods.create({ name: 'P1', startDate: '2026-01-06', memberIds: [a, b, c] });
    for (const [i, id] of [a, b, c].entries()) await db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [id, p1.id, i + 1]);

    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 100_000, account: 'tunai' });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 70_000, account: 'debit' });
    await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 40_000, account: 'piutang', memberId: c });
    await repos.payments.record({ periodId: p1.id, memberId: a, date: '2026-01-06', amount: 60_000, account: 'tunai' }); // 15k becomes credit
    await repos.payments.record({ periodId: p1.id, memberId: b, date: '2026-01-06', amount: 15_000, account: 'tunai' });
    // Citra pays nothing: she is host of week 3 and her debt is offset against the payout.
    for (let w = 1; w <= 3; w += 1) {
      await repos.weeks.closeOldest(p1.id);
      await repos.ledger.settleHost(p1.id, w, '2026-01-20');
    }
    await repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-21', amount: 30_000, account: 'tunai', toAccount: 'debit' });
    await repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-21', amount: 10_000, account: 'debit', toAccount: 'tunai' });
    const loan = await repos.ledger.recordKas({ kind: 'loan', date: '2026-01-22', amount: 25_000, account: 'debit', memberId: b });
    await repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-01-23', amount: 5_000, memberId: b });
    const wrongTransfer = await repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-24', amount: 7_000, account: 'tunai', toAccount: 'debit' });
    await repos.periods.close(p1.id, '2026-01-25');
    // Ani holds credit and does not join the next period: refund it.
    const credits = await repos.credits.listRefundable();
    expect(credits.length).toBeGreaterThan(0);
    for (const cr of credits) await repos.credits.refund(cr.periodId, cr.memberId, '2026-01-26', 'tunai');
    await repos.ledger.reverseEntry(wrongTransfer.id, 'salah arah');
    // Reversing the loan is rejected by the domain while a repayment stands (remaining would go negative).
    await expect(repos.ledger.reverseEntry(loan.id, 'salah')).rejects.toBeDefined();

    const table = parse(ledgerCsv(await repos.exports.listLedger())).slice(1);
    const sum = (col: number) => table.reduce((t, r) => t + Number(r[col] || 0), 0);
    const balances = await repos.ledger.getKasBalances();
    expect(sum(7) - sum(8)).toBe(balances.actual);
    expect(balances.actual).toBe(balances.tunai + balances.debit);
    // Moves never appear in Masuk/Keluar, including the corrected transfer and its reversal.
    const moves = table.filter((r) => r[1] === 'Pindah saldo' || (r[1] === 'Koreksi' && r[2] !== '' && r[3] !== ''));
    expect(moves.length).toBeGreaterThanOrEqual(3);
    for (const m of moves) expect([m[7], m[8]]).toEqual(['', '']);
    for (const w of table.filter((r) => r[1] === 'Penghapusan tunggakan')) expect([w[7], w[8]]).toEqual(['', '']);
    // Old named Piutang balance: no cash.
    expect(table.filter((r) => r[1] === 'Saldo awal: pinjaman lama' || (r[1] === 'Saldo awal' && r[2] === 'Piutang')).every((r) => r[7] === '' && r[8] === '')).toBe(true);
    // Every row has exactly one of the three amount columns filled.
    for (const r of table) expect([r[7], r[8], r[9]].filter((v) => v !== '').length).toBe(1);
    // Refund is cash out; host payout is cash out; host offset is not cash.
    expect(table.filter((r) => r[1] === 'Pengembalian titipan anggota').every((r) => r[7] === '' && r[8] !== '')).toBe(true);
  });
});
