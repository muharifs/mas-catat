// M7.1 repository tests: a loan repayment must match what the member borrowed (guard inside the write transaction),
// remaining loans across periods, named/unnamed opening balances, corrections, and old overpaid data.
import { LoanError } from '@/domain/loans';
import { toIndonesian } from '@/ui/errors';
import { healthCheck } from './backup';
import { createRepositories, type Repositories } from './index';
import type { Db } from './db';
import { markHostsPaid } from './testing/hostPayouts';
import { createMigratedTestDb } from './testing/sqlJsDriver';

interface Fixture {
  db: Db;
  repos: Repositories;
  periodId: string;
  ids: string[];
}

async function setup(memberCount = 3): Promise<Fixture> {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
  const ids: string[] = [];
  for (let i = 0; i < memberCount; i += 1) ids.push((await repos.members.create(`Member ${i + 1}`)).id);
  const period = await repos.periods.create({ name: 'Periode 1', startDate: '2026-01-04', memberIds: ids });
  for (let i = 0; i < ids.length; i += 1) {
    await db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [ids[i] as string, period.id, i + 1]);
  }
  return { db, repos, periodId: period.id, ids };
}

const date = '2026-01-04';
const lend = (f: Fixture, memberId: string, amount: number) =>
  f.repos.ledger.recordKas({ kind: 'loan', date, amount, account: 'tunai', memberId });
const repay = (f: Fixture, memberId: string, amount: number) =>
  f.repos.ledger.recordKas({ kind: 'loan_repayment', date, amount, memberId });
const oldLoan = (f: Fixture, memberId: string, amount: number) =>
  f.repos.ledger.recordKas({ kind: 'opening_balance', date, amount, account: 'piutang', memberId });
const entryCount = async (db: Db) => (await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries'))?.n ?? -1;

/** Writes an entry straight into the ledger, like data from before the guard existed. */
const legacy = (f: Fixture, e: { type: 'loan' | 'loan_repayment' | 'opening_balance'; amount: number; memberId: string | null }) =>
  f.repos.ledger.append({
    periodId: f.periodId,
    date,
    direction: e.type === 'opening_balance' ? 'in' : 'out',
    week: null,
    note: '',
    account: e.type === 'loan' ? 'tunai' : 'piutang',
    toAccount: e.type === 'loan' ? 'piutang' : e.type === 'loan_repayment' ? 'tunai' : null,
    ...e,
  });

async function endPeriod(f: Fixture): Promise<void> {
  const weeks = await f.repos.weeks.listByPeriod(f.periodId);
  for (let i = 0; i < weeks.length; i += 1) await f.repos.weeks.closeOldest(f.periodId);
  await markHostsPaid(f.repos, f.periodId);
  await f.repos.periods.close(f.periodId, '2026-12-30');
}

describe('repayment guard', () => {
  it('accepts a partial repayment (not a multiple of Rp15.000) and the exact remainder', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    await lend(f, a, 300_000);
    await repay(f, a, 12_345);
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(287_655);
    await repay(f, a, 287_655);
    expect(await f.repos.ledger.getLoanBalance(a)).toMatchObject({ lent: 300_000, repaid: 300_000, remaining: 0 });
    expect((await f.repos.ledger.listLoanBalances()).openCount).toBe(0);
  });

  it('rejects one rupiah above the remainder, in preview and in save, and writes nothing', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    await lend(f, a, 300_000);
    const before = await entryCount(f.db);
    const input = { kind: 'loan_repayment' as const, date, amount: 300_001, memberId: a };
    await expect(f.repos.ledger.previewKas(input)).rejects.toBeInstanceOf(LoanError);
    await expect(f.repos.ledger.recordKas(input)).rejects.toMatchObject({ code: 'above_remaining', remaining: 300_000 });
    expect(await entryCount(f.db)).toBe(before);
  });

  it('rejects a member who never borrowed and one who is fully repaid', async () => {
    const f = await setup();
    const [a, b] = f.ids as [string, string];
    await expect(repay(f, b, 1_000)).rejects.toMatchObject({ code: 'no_loan' });
    await lend(f, a, 10_000);
    await repay(f, a, 10_000);
    await expect(repay(f, a, 1_000)).rejects.toMatchObject({ code: 'no_loan' });
    expect(toIndonesian(await repay(f, a, 1_000).catch((e: unknown) => e))).toBe('Anggota ini tidak punya sisa pinjaman, jadi tidak ada yang bisa dilunasi.');
  });

  it('the preview shows the remaining loan before and after', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    await lend(f, a, 300_000);
    const p = await f.repos.ledger.previewKas({ kind: 'loan_repayment', date, amount: 100_000, memberId: a });
    expect([p.loanRemainingBefore, p.loanRemainingAfter]).toEqual([300_000, 200_000]);
  });

  it('keeps each member apart', async () => {
    const f = await setup();
    const [a, b] = f.ids as [string, string];
    await lend(f, a, 100_000);
    await lend(f, b, 50_000);
    await expect(repay(f, b, 60_000)).rejects.toMatchObject({ code: 'above_remaining', remaining: 50_000 });
    await repay(f, a, 100_000);
    expect((await f.repos.ledger.listLoanBalances()).openRemaining).toBe(50_000);
  });
});

describe('loans across periods', () => {
  it('adds loans of two periods and lets a repayment settle the sum', async () => {
    const f = await setup(2);
    const [a, b] = f.ids as [string, string];
    await lend(f, a, 200_000);
    await endPeriod(f);
    const p2 = await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-04', memberIds: [a, b] });
    await lend(f, a, 100_000); // goes to the new active period
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(300_000);
    const e = await repay(f, a, 300_000); // all periods count
    expect(e.periodId).toBe(p2.id);
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(0);
  });

  it('a loan of a closed period can be repaid when no period is active', async () => {
    const f = await setup(2);
    const [a] = f.ids as [string];
    await lend(f, a, 40_000);
    await endPeriod(f);
    const e = await repay(f, a, 40_000);
    expect(e.periodId).toBe(f.periodId);
  });

  it('an old loan for a member who is in no period cannot be recorded (the period rule rejects it)', async () => {
    const f = await setup(2);
    const outsider = (await f.repos.members.create('Outsider')).id;
    await expect(oldLoan(f, outsider, 50_000)).rejects.toThrow(/not found in any period/);
  });
});

describe('opening balance in Piutang', () => {
  it('needs a member; Tunai and Debit never keep one', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    await expect(f.repos.ledger.recordKas({ kind: 'opening_balance', date, amount: 1_000, account: 'piutang' })).rejects.toThrow(/needs a member/);
    expect(toIndonesian(await f.repos.ledger.recordKas({ kind: 'opening_balance', date, amount: 1_000, account: 'piutang' }).catch((e: unknown) => e))).toBe(
      'Pilih anggota yang punya pinjaman lama ini.',
    );
    const cash = await f.repos.ledger.recordKas({ kind: 'opening_balance', date, amount: 5_000, account: 'tunai', memberId: a });
    expect(cash.memberId).toBeNull();
  });

  it('counts as that member\'s old loan and can be repaid, in part or in full', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    await oldLoan(f, a, 400_000);
    expect(await f.repos.ledger.getLoanBalance(a)).toMatchObject({ lent: 400_000, remaining: 400_000 });
    await repay(f, a, 150_000);
    await expect(repay(f, a, 250_001)).rejects.toMatchObject({ code: 'above_remaining' });
    await repay(f, a, 250_000);
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(0);
  });

  it('is shown with the member name in the CSV ledger rows', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    await oldLoan(f, a, 400_000);
    const rows = await f.repos.exports.listLedger();
    expect(rows.find((r) => r.type === 'opening_balance')).toMatchObject({ account: 'piutang', memberName: 'Member 1', amount: 400_000 });
  });

  it('an old unnamed one is listed apart, cannot be repaid by anyone, and is fixed by correcting and re-entering it with a name', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    const old = await legacy(f, { type: 'opening_balance', amount: 90_000, memberId: null });
    const o = await f.repos.ledger.listLoanBalances();
    expect(o.unnamedOpening).toBe(90_000);
    expect(o.members).toEqual([]);
    await expect(repay(f, a, 1_000)).rejects.toMatchObject({ code: 'no_loan' });
    expect((await f.repos.ledger.getKasBalances()).piutang).toBe(90_000);

    await f.repos.ledger.reverseEntry(old.id, 'tanpa nama');
    await oldLoan(f, a, 90_000);
    const fixed = await f.repos.ledger.listLoanBalances();
    expect(fixed.unnamedOpening).toBe(0);
    expect(fixed.members).toMatchObject([{ memberId: a, remaining: 90_000 }]);
  });
});

describe('corrections', () => {
  it('refuses to reverse a loan that was repaid, with the repaid amount in the message, and writes nothing', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    const loan = await lend(f, a, 300_000);
    await repay(f, a, 100_000);
    const before = await entryCount(f.db);
    const err = await f.repos.ledger.reverseEntry(loan.id, 'salah').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'reversal_below_zero', repaid: 100_000 });
    expect(toIndonesian(err)).toBe('Pinjaman ini sudah dibayar Rp100.000. Koreksi pelunasannya dulu, baru koreksi pinjamannya.');
    expect(await entryCount(f.db)).toBe(before);
  });

  it('reversing the repayment first unlocks the loan; a repayment reversal is always allowed', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    const loan = await lend(f, a, 300_000);
    const r = await repay(f, a, 300_000);
    await f.repos.ledger.reverseEntry(r.id, 'salah'); // always allowed
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(300_000);
    await f.repos.ledger.reverseEntry(loan.id, 'salah');
    expect(await f.repos.ledger.getLoanBalance(a)).toMatchObject({ lent: 0, repaid: 0, remaining: 0 });
    expect((await f.repos.ledger.getKasBalances()).piutang).toBe(0);
  });

  it('a repayment reversed and entered again counts once; the loan reversed and entered again too', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    const loan = await lend(f, a, 300_000);
    const r1 = await repay(f, a, 300_000);
    await f.repos.ledger.reverseEntry(r1.id, 'salah');
    await repay(f, a, 100_000);
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(200_000);
    await expect(repay(f, a, 200_001)).rejects.toMatchObject({ code: 'above_remaining', remaining: 200_000 });
    // The loan is partly repaid now, so it cannot be taken back while the repayment stands.
    await expect(f.repos.ledger.reverseEntry(loan.id, 'salah')).rejects.toMatchObject({ code: 'reversal_below_zero' });
  });

  it('allows reversing a loan while the remainder still covers it (two loans, one repaid)', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    await lend(f, a, 300_000);
    const second = await lend(f, a, 100_000);
    await repay(f, a, 300_000);
    await f.repos.ledger.reverseEntry(second.id, 'salah'); // remaining 100.000 - 100.000 = 0, not negative
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(0);
  });

  it('applies to a named opening balance as well, but not to an unnamed one', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    const old = await oldLoan(f, a, 200_000);
    await repay(f, a, 50_000);
    await expect(f.repos.ledger.reverseEntry(old.id, 'salah')).rejects.toMatchObject({ code: 'reversal_below_zero', repaid: 50_000 });
    const unnamed = await legacy(f, { type: 'opening_balance', amount: 10_000, memberId: null });
    await expect(f.repos.ledger.reverseEntry(unnamed.id, 'salah')).resolves.toMatchObject({ type: 'reversal' });
  });

  it('reversing a loan that nobody repaid works across a closed period', async () => {
    const f = await setup(2);
    const [a, b] = f.ids as [string, string];
    const loan = await lend(f, a, 25_000);
    await endPeriod(f);
    await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-04', memberIds: [a, b] });
    await f.repos.ledger.reverseEntry(loan.id, 'salah');
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(0);
  });
});

describe('old data with repayments above the loan', () => {
  async function overpaid() {
    const f = await setup();
    const [a, b] = f.ids as [string, string];
    const loan = await legacy(f, { type: 'loan', amount: 100_000, memberId: a });
    const over = await legacy(f, { type: 'loan_repayment', amount: 130_000, memberId: a });
    await lend(f, b, 20_000);
    return { f, a, b, loan, over };
  }

  it('shows the excess, allows no repayment, and leaves the entries alone', async () => {
    const { f, a, b } = await overpaid();
    const before = await entryCount(f.db);
    expect(await f.repos.ledger.getLoanBalance(a)).toMatchObject({ remaining: -30_000, overpaid: 30_000 });
    const o = await f.repos.ledger.listLoanBalances();
    expect(o.openCount).toBe(1); // only b
    await expect(repay(f, a, 1_000)).rejects.toMatchObject({ code: 'no_loan' });
    await repay(f, b, 20_000); // others are not affected
    expect(await entryCount(f.db)).toBe(before + 1);
  });

  it('still allows correcting the repayment; the loan stays locked while the member is overpaid', async () => {
    const { f, a, loan, over } = await overpaid();
    await expect(f.repos.ledger.reverseEntry(loan.id, 'salah')).rejects.toMatchObject({ code: 'reversal_below_zero' });
    await f.repos.ledger.reverseEntry(over.id, 'salah');
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(100_000);
  });

  it('does not make the health check (and so a restore) fail', async () => {
    const { f } = await overpaid();
    expect(await healthCheck(f.db)).toEqual({ ok: true, problems: [] });
  });
});

describe('totals agree everywhere', () => {
  it('member remaining + unnamed opening = Piutang of the kas, also with overpaid data and corrections', async () => {
    const f = await setup(4);
    const [a, b, c, d] = f.ids as [string, string, string, string];
    await legacy(f, { type: 'opening_balance', amount: 75_000, memberId: null });
    await oldLoan(f, a, 400_000);
    const l = await lend(f, b, 60_000);
    await repay(f, a, 100_000);
    await legacy(f, { type: 'loan', amount: 10_000, memberId: c });
    await legacy(f, { type: 'loan_repayment', amount: 25_000, memberId: c });
    await lend(f, d, 5_000);
    await repay(f, b, 20_000);
    await expect(f.repos.ledger.reverseEntry(l.id, 'x')).rejects.toBeInstanceOf(LoanError);
    const o = await f.repos.ledger.listLoanBalances();
    const kas = await f.repos.ledger.getKasBalances();
    expect(o.members.reduce((t, m) => t + m.remaining, 0) + o.unnamedOpening).toBe(kas.piutang);
    expect(kas.piutang).toBe(75_000 + 300_000 + 40_000 - 15_000 + 5_000);
  });

  it('the member report total equals the loan page for the same member (named old loan included)', async () => {
    const f = await setup();
    const [a] = f.ids as [string];
    await oldLoan(f, a, 400_000);
    await lend(f, a, 100_000);
    const r = await repay(f, a, 30_000);
    await repay(f, a, 5_000);
    await f.repos.ledger.reverseEntry(r.id, 'salah');
    const history = await f.repos.reports.getMemberHistory(f.periodId, a);
    expect(history.loans.map((x) => x.kind)).toEqual(['opening_loan', 'loan', 'loan_repayment', 'loan_repayment']);
    expect(history.totals.piutang).toBe(495_000);
    expect(history.totals.piutang).toBe((await f.repos.ledger.getLoanBalance(a)).remaining);
  });

  it('lists a member\'s loan history oldest first, corrections marked, without the reversal rows', async () => {
    const f = await setup();
    const [a, b] = f.ids as [string, string];
    const first = await lend(f, a, 50_000);
    await lend(f, b, 1_000);
    await repay(f, a, 10_000);
    await f.repos.ledger.reverseEntry(first.id, 'salah').catch(() => undefined); // locked: repaid
    const history = await f.repos.ledger.listLoanHistory(a);
    expect(history.map((e) => [e.type, e.amount, e.reversedById])).toEqual([
      ['loan', 50_000, null],
      ['loan_repayment', 10_000, null],
    ]);
  });
});
