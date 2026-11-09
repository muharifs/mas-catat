// QA regression (independent) for the code of this session: checkRepaymentAmount, the future-date block (UI vs domain),
// Step M (archive / delete / reserved names / triggers), the multiple-of-15.000 rule on the keypad path, and a v4 backup
// restored end to end. Expected values come from CLAUDE.md, not from app output. Runs on sql.js, not on the phone.
import { appendAmountDigits, checkPaymentAmount, deleteLastDigit, type AmountKey } from '@/domain/amount-input';
import { endDateProblem } from '@/domain/close';
import { assertEntryDate } from '@/domain/kas';
import { assertRepaymentWithinLoan, checkRepaymentAmount, LoanError } from '@/domain/loans';
import { MemberArchiveError } from '@/domain/members';
import { assertPaymentDate, parseRupiahInput } from '@/domain/payment-preview';
import { todayIso } from '@/ui/dates';
import { commitRestore, LATEST_VERSION, prepareRestore } from './backup';
import { todayOf } from './deps';
import { createRepositories, type Repositories } from './index';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createSqlJsEnv, FakeSafetyStore } from './testing/sqlJsBridge';
import { createMigratedTestDb } from './testing/sqlJsDriver';
import type { Db } from './db';

const TODAY = '2026-03-10';
const TOMORROW = '2026-03-11';
const START = '2026-02-03';

interface Env {
  db: Db;
  repos: Repositories;
}

async function env(nowIso = `${TODAY}T12:00:00.000Z`): Promise<Env> {
  const db = await createMigratedTestDb();
  let n = 0;
  return { db, repos: createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => nowIso }) };
}

/** A one-member period run to the end: pay (optional), payout, close meeting, close period. */
async function runOnePersonPeriod(e: Env, name: string, memberId: string, opts: { pay?: number; startDate?: string } = {}) {
  const p = await e.repos.periods.create({ name, startDate: opts.startDate ?? START, memberIds: [memberId] });
  if (opts.pay) await e.repos.payments.record({ periodId: p.id, memberId, date: TODAY, amount: opts.pay, account: 'tunai' });
  await e.repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
  await e.repos.weeks.closeOldest(p.id);
  await e.repos.periods.close(p.id, TODAY);
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
describe('checkRepaymentAmount (partial repayment, not tied to the 15.000 multiple)', () => {
  it('table: every outcome by hand', () => {
    const table: [number | null, number, string][] = [
      [null, 100_000, 'empty'],
      [0, 100_000, 'empty'],
      [-1, 100_000, 'empty'],
      [1.5, 100_000, 'empty'],
      [Number.NaN, 100_000, 'empty'],
      [1, 100_000, 'ok'], // one rupiah is a legal partial repayment
      [7_500, 100_000, 'ok'], // not a multiple of 15.000
      [15_000, 100_000, 'ok'],
      [99_999, 100_000, 'ok'],
      [100_000, 100_000, 'ok'], // exactly the remaining
      [100_001, 100_000, 'above_remaining'],
      [1, 0, 'no_loan'], // nothing left to repay
      [15_000, 0, 'no_loan'],
      [15_000, -5_000, 'no_loan'], // old overpaid data
    ];
    for (const [amount, remaining, expected] of table) expect([amount, remaining, checkRepaymentAmount(amount, remaining)]).toEqual([amount, remaining, expected]);
  });

  it('agrees with assertRepaymentWithinLoan and with the repository preview/record for a sweep of amounts', async () => {
    const e = await env();
    const m = (await e.repos.members.create('Ani')).id;
    await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [m] });
    await e.repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 100_000, account: 'tunai', memberId: m });
    for (const amount of [1, 7_500, 15_000, 99_999, 100_000, 100_001, 150_000]) {
      const verdict = checkRepaymentAmount(amount, 100_000);
      let domainOk = true;
      try {
        assertRepaymentWithinLoan(amount, 100_000);
      } catch {
        domainOk = false;
      }
      let repoOk = true;
      try {
        await e.repos.ledger.previewKas({ kind: 'loan_repayment', date: TODAY, amount, memberId: m });
      } catch {
        repoOk = false;
      }
      expect([amount, verdict === 'ok', domainOk, repoOk]).toEqual([amount, domainOk, domainOk, domainOk]);
    }
  });

  it('partial repayments end exactly at 0, then no further repayment; the remaining is lent - repaid', async () => {
    const e = await env();
    const m = (await e.repos.members.create('Ani')).id;
    await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [m] });
    await e.repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 100_000, account: 'tunai', memberId: m });
    await e.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 7_500, memberId: m });
    expect((await e.repos.ledger.getLoanBalance(m)).remaining).toBe(92_500);
    await expect(e.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 92_501, memberId: m })).rejects.toBeInstanceOf(LoanError);
    await e.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 92_500, memberId: m });
    expect((await e.repos.ledger.getLoanBalance(m)).remaining).toBe(0);
    await expect(e.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 1, memberId: m })).rejects.toMatchObject({ code: 'no_loan' });
    // Piutang bookkeeping: Tunai = -100.000 (loan) + 100.000 (repaid) = 0, Piutang = 0
    expect(await e.repos.ledger.getKasBalances()).toMatchObject({ tunai: 0, piutang: 0 });
  });

  it('a repayment is rejected for a member who never borrowed, and for a member who is not in any period', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    const outsider = (await e.repos.members.create('Luar')).id;
    await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [a] });
    await expect(e.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 1_000, memberId: a })).rejects.toMatchObject({ code: 'no_loan' });
    await expect(e.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 1_000, memberId: outsider })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('multiple-of-15.000 rule through the keypad path (amount-input.ts)', () => {
  const type = (keys: AmountKey[]) => keys.reduce<string>((text, k) => appendAmountDigits(text, k), '');
  const verdict = (keys: AmountKey[]) => checkPaymentAmount(parseRupiahInput(type(keys)));

  it('typed examples', () => {
    expect(verdict(['1', '5', '000'])).toBe('ok'); // 15.000
    expect(verdict(['3', '0', '000'])).toBe('ok');
    expect(verdict(['1', '5', '0', '0', '1'])).toBe('not_multiple');
    expect(verdict(['7', '5', '0', '0'])).toBe('not_multiple'); // half a due
    expect(verdict(['2', '2', '5', '0', '0'])).toBe('not_multiple'); // 22.500
    expect(verdict(['0'])).toBe('empty');
    expect(verdict(['0', '000', '1', '5', '000'])).toBe('ok'); // leading zeros are ignored
    expect(verdict([])).toBe('empty');
  });

  it('backspace walks 15000 -> 1500 (not ok) -> ... -> empty', () => {
    let text = type(['1', '5', '000']);
    expect(checkPaymentAmount(parseRupiahInput(text))).toBe('ok');
    text = deleteLastDigit(text);
    expect(text).toBe('1500');
    expect(checkPaymentAmount(parseRupiahInput(text))).toBe('not_multiple');
    for (let i = 0; i < 4; i += 1) text = deleteLastDigit(text);
    expect(text).toBe('');
    expect(checkPaymentAmount(parseRupiahInput(text))).toBe('empty');
    expect(deleteLastDigit('')).toBe('');
  });

  it('the 12-digit limit: a key that would make 13 digits is ignored as a whole and the result is still a safe integer', () => {
    const twelve = type(['1', '5', '000', '000', '000', '000'].slice(0, 6) as AmountKey[]); // 15 + 12 zeros = 14 digits, cut
    expect(twelve.length).toBeLessThanOrEqual(12);
    const n = parseRupiahInput(twelve);
    expect(n === null || Number.isSafeInteger(n)).toBe(true);
    expect(appendAmountDigits('999999999999', '1')).toBe('999999999999');
    expect(appendAmountDigits('99999999999', '000')).toBe('99999999999'); // 11 + 3 = 14 > 12: whole key ignored
  });

  it('sweep: every multiple k x 15.000 typed digit by digit is ok; k x 15.000 + 1 and + 7.500 are not', () => {
    for (let k = 1; k <= 2000; k += 1) {
      const digits = String(k * 15_000).split('') as AmountKey[];
      expect(verdict(digits)).toBe('ok');
      expect(verdict(String(k * 15_000 + 1).split('') as AmountKey[])).toBe('not_multiple');
      expect(verdict(String(k * 15_000 + 7_500).split('') as AmountKey[])).toBe('not_multiple');
    }
  });

  it('the repository enforces the same rule when a screen is bypassed (nothing written on reject)', async () => {
    const e = await env();
    const m = (await e.repos.members.create('Ani')).id;
    const p = await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [m, (await e.repos.members.create('Budi')).id] });
    for (const amount of [0, 1, 14_999, 15_001, 22_500, -15_000, 15_000.5]) {
      await expect(e.repos.payments.record({ periodId: p.id, memberId: m, date: TODAY, amount, account: 'tunai' })).rejects.toThrow();
    }
    expect((await e.db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries'))?.n).toBe(0);
    for (const amount of [15_000, 30_000, 45_000]) {
      await e.repos.payments.record({ periodId: p.id, memberId: m, date: TODAY, amount, account: 'tunai' });
    }
  });

  it('an old non-multiple loan repayment (7.500) is NOT blocked by the dues rule: keypad path for kas vs payments differ on purpose', () => {
    expect(checkPaymentAmount(7_500)).toBe('not_multiple');
    expect(checkRepaymentAmount(7_500, 20_000)).toBe('ok');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('future-date block: UI (todayIso, maxDate) equals the domain/repository (todayOf)', () => {
  it('todayIso(Date) and todayOf(clock) give the same day for instants around local midnight', () => {
    const instants = [
      new Date(2026, 2, 10, 0, 0, 0),
      new Date(2026, 2, 10, 0, 0, 1),
      new Date(2026, 2, 10, 6, 59, 59),
      new Date(2026, 2, 10, 12, 0, 0),
      new Date(2026, 2, 10, 23, 59, 59),
      new Date(2026, 11, 31, 23, 59, 59),
      new Date(2028, 1, 29, 0, 0, 0), // leap day
    ];
    for (const d of instants) expect(todayOf({ newId: () => 'x', now: () => d.toISOString() })).toBe(todayIso(d));
  });

  it('assert functions: today passes, tomorrow is refused, an impossible date is refused', () => {
    expect(() => assertPaymentDate(TODAY, TODAY)).not.toThrow();
    expect(() => assertPaymentDate(TOMORROW, TODAY)).toThrow(/future/);
    expect(() => assertPaymentDate('2026-02-30', TODAY)).toThrow();
    expect(() => assertEntryDate(TODAY, TODAY)).not.toThrow();
    expect(() => assertEntryDate(TOMORROW, TODAY)).toThrow(/future/);
    expect(endDateProblem(TOMORROW, START, TODAY)).toBe('future');
    expect(endDateProblem(TODAY, START, TODAY)).toBeNull();
    expect(endDateProblem('2026-02-01', START, TODAY)).toBe('before_start');
  });

  it('every record that the UI blocks with maxDate=today is also refused by its repository for tomorrow, and accepted for today', async () => {
    // Clock right after local midnight: a UTC-based "today" would be a day behind in a timezone east of UTC.
    const e = await env(new Date(2026, 2, 10, 0, 30, 0).toISOString());
    const today = todayOf({ newId: () => 'x', now: () => new Date(2026, 2, 10, 0, 30, 0).toISOString() });
    const tomorrow = todayIso(new Date(2026, 2, 11, 12, 0, 0));
    expect(today).toBe('2026-03-10');
    const a = (await e.repos.members.create('Ani')).id;
    const b = (await e.repos.members.create('Budi')).id;
    const p = await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [a, b] });
    await e.repos.weeks.assignHost(p.id, 1, a, START);
    const bad = (fn: () => Promise<unknown>) => expect(fn()).rejects.toThrow(/future/);
    // pay.tsx
    await bad(() => e.repos.payments.record({ periodId: p.id, memberId: a, date: tomorrow, amount: 15_000, account: 'tunai' }));
    await bad(() => e.repos.payments.preview({ periodId: p.id, memberId: a, date: tomorrow, amount: 15_000 }));
    await e.repos.payments.record({ periodId: p.id, memberId: a, date: today, amount: 15_000, account: 'tunai' });
    // payout.tsx
    await bad(() => e.repos.ledger.previewHostPayout(p.id, 1, tomorrow, 'tunai'));
    await bad(() => e.repos.ledger.settleHost(p.id, 1, tomorrow, 'tunai'));
    // kas/new.tsx: all kinds that exist
    await bad(() => e.repos.ledger.recordKas({ kind: 'shared_goal', date: tomorrow, amount: 1_000, account: 'tunai', note: 'wisata' }));
    await bad(() => e.repos.ledger.recordKas({ kind: 'transfer', date: tomorrow, amount: 1_000, account: 'tunai', toAccount: 'debit' }));
    await bad(() => e.repos.ledger.recordKas({ kind: 'opening_balance', date: tomorrow, amount: 1_000, account: 'tunai' }));
    await bad(() => e.repos.ledger.recordKas({ kind: 'loan', date: tomorrow, amount: 1_000, account: 'tunai', memberId: a }));
    await e.repos.ledger.recordKas({ kind: 'shared_goal', date: today, amount: 1_000, account: 'tunai', note: 'wisata' });
    expect((await e.db.getFirst<{ n: number }>("SELECT COUNT(*) AS n FROM ledger_entries WHERE date > '2026-03-10'"))?.n).toBe(0);
  });

  it('close.tsx / credits: end date and refund date in the future are refused; meeting and start dates may be in the future (as the field table says)', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    const p = await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [a] });
    await e.repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: 30_000, account: 'tunai' }); // 15.000 becomes Titipan
    await e.repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await e.repos.weeks.closeOldest(p.id);
    await expect(e.repos.periods.close(p.id, TOMORROW)).rejects.toThrow(/future/);
    await e.repos.periods.close(p.id, TODAY);
    await expect(e.repos.credits.refund(p.id, a, TOMORROW, 'tunai')).rejects.toThrow(/future/);
    await expect(e.repos.credits.previewRefund(p.id, a, TOMORROW, 'tunai')).rejects.toThrow(/future/);
    const refund = await e.repos.credits.refund(p.id, a, TODAY, 'tunai');
    expect(refund.amount).toBe(15_000);
    // not blocked on purpose:
    const b = (await e.repos.members.create('Budi')).id;
    const c = (await e.repos.members.create('Citra')).id;
    const future = await e.repos.periods.create({ name: 'Depan', startDate: '2026-12-01', memberIds: [b, c] });
    await e.repos.weeks.assignHost(future.id, 1, b, '2026-12-01');
    expect((await e.repos.weeks.get(future.id, 1))?.hostMemberId).toBe(b);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Step M: archive, delete, reserved names, triggers', () => {
  it('guard 1: a member of the ACTIVE period cannot be archived (code in_active_period), nothing changes', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [a] });
    await expect(e.repos.members.archive(a)).rejects.toMatchObject({ code: 'in_active_period' });
    expect((await e.repos.members.getById(a))?.archivedAt).toBeNull();
    expect(await e.repos.members.archiveBlocker(a)).toEqual({ code: 'in_active_period', amount: 0 });
  });

  it('guard 2: a remaining loan blocks (even 1 rupiah); a partial repayment still blocks; full repayment allows', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    const p = await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [a] });
    await e.repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 50_000, account: 'tunai', memberId: a });
    await e.repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: 15_000, account: 'tunai' }); // pay BEFORE the payout: no debt, no Titipan
    await e.repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await e.repos.weeks.closeOldest(p.id);
    await e.repos.periods.close(p.id, TODAY);
    await expect(e.repos.members.archive(a)).rejects.toMatchObject({ code: 'has_loan', amount: 50_000 });
    await e.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 49_999, memberId: a });
    await expect(e.repos.members.archive(a)).rejects.toMatchObject({ code: 'has_loan', amount: 1 });
    await e.repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 1, memberId: a });
    await e.repos.members.archive(a);
    expect((await e.repos.members.listActive()).map((m) => m.id)).not.toContain(a);
    expect((await e.repos.members.list()).map((m) => m.id)).toContain(a); // history lookup still resolves the name
  });

  it('guard 3: any Titipan blocks, also a non-multiple of 15.000 (10.000 after a capped host offset); refund allows', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    // N=1: payout 10.000; arrears 15.000 -> offset 10.000 (cap), 5.000 stays; paying 15.000 settles 5.000, 10.000 becomes Titipan.
    const p = await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [a] });
    const settled = await e.repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    expect(settled.settlement).toMatchObject({ payout: 10_000, offset: 10_000, remainingDebt: 5_000 });
    const r = await e.repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: 15_000, account: 'tunai' });
    expect(r.credit).toBe(10_000);
    await e.repos.weeks.closeOldest(p.id);
    await e.repos.periods.close(p.id, TODAY);
    await expect(e.repos.members.archive(a)).rejects.toMatchObject({ code: 'has_credit', amount: 10_000 });
    const err = await e.repos.members.archive(a).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(MemberArchiveError);
    await e.repos.credits.refund(p.id, a, TODAY, 'tunai');
    await e.repos.members.archive(a);
    expect((await e.repos.members.getById(a))?.archivedAt).not.toBeNull();
  });

  it('hard delete only with NO data: unused member yes; any period_members row (even a closed period) no; counts per table', async () => {
    const e = await env();
    const unused = (await e.repos.members.create('Kosong')).id;
    const used = (await e.repos.members.create('Pakai')).id;
    expect(Object.values(await e.repos.members.getUsage(unused)).every((n) => n === 0)).toBe(true);
    await runOnePersonPeriod(e, 'P', used);
    await expect(e.repos.members.remove(used)).rejects.toThrow(/history/);
    expect((await e.repos.members.getUsage(used)).periodMemberships).toBe(1);
    await e.repos.members.remove(unused);
    expect(await e.repos.members.getById(unused)).toBeNull();
    await expect(e.repos.members.remove(unused)).rejects.toThrow(/not found/);
    // an archived member with history is not deletable either
    await e.repos.members.archive(used);
    await expect(e.repos.members.remove(used)).rejects.toThrow(/history/);
  });

  it('a never-used member can be archived and then deleted (no data is lost either way)', async () => {
    const e = await env();
    const m = (await e.repos.members.create('Kosong')).id;
    await e.repos.members.archive(m);
    await e.repos.members.remove(m);
    expect(await e.repos.members.getById(m)).toBeNull();
  });

  it('reserved names: an archived name stays taken (case-insensitive, trimmed) for create AND rename; unarchive keeps it unique', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    const other = (await e.repos.members.create('Budi')).id;
    await runOnePersonPeriod(e, 'P', a);
    await e.repos.members.archive(a);
    await expect(e.repos.members.create('  ANI ')).rejects.toThrow(/already exists/);
    await expect(e.repos.members.create('ani')).rejects.toThrow(/already exists/);
    await expect(e.repos.members.rename(other, 'aNi')).rejects.toThrow(/already exists/);
    await e.repos.members.rename(a, 'ANI'); // an archived member may re-case its own name
    await e.repos.members.unarchive(a);
    expect((await e.repos.members.listActive()).map((m) => m.name)).toContain('ANI');
    await expect(e.repos.members.create('ani')).rejects.toThrow(/already exists/);
    await expect(e.repos.members.unarchive('missing')).rejects.toThrow(/not found/);
  });

  it('periods.create refuses an archived member, rolls back completely, and accepts the member again after unarchive', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    const b = (await e.repos.members.create('Budi')).id;
    await runOnePersonPeriod(e, 'Lama', a);
    await e.repos.members.archive(a);
    const count = async (t: string) => (await e.db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))?.n ?? -1;
    const before = { periods: await count('periods'), weeks: await count('weeks'), pm: await count('period_members') };
    await expect(e.repos.periods.create({ name: 'Baru', startDate: '2026-03-03', memberIds: [b, a] })).rejects.toThrow(/archived/);
    expect({ periods: await count('periods'), weeks: await count('weeks'), pm: await count('period_members') }).toEqual(before);
    await e.repos.members.unarchive(a);
    await e.repos.periods.create({ name: 'Baru', startDate: '2026-03-03', memberIds: [b, a] });
    expect(await count('periods')).toBe(before.periods + 1);
  });

  it('archive keeps history and reports intact (member history, kas, period report)', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    const p = await runOnePersonPeriod(e, 'P', a, { pay: 15_000 });
    const kasBefore = await e.repos.reports.getKasReport();
    const reportBefore = await e.repos.reports.getPeriodReport(p.id);
    await e.repos.members.archive(a);
    expect(await e.repos.reports.getKasReport()).toEqual(kasBefore);
    expect(await e.repos.reports.getPeriodReport(p.id)).toEqual(reportBefore);
    const history = await e.repos.reports.getMemberHistory(p.id, a);
    expect(history.totals.paid).toBe(15_000);
  });

  it('database triggers: raw SQL cannot archive an active-period member, cannot add an archived member to a period, empty archived_at is refused', async () => {
    const e = await env();
    const a = (await e.repos.members.create('Ani')).id;
    const b = (await e.repos.members.create('Budi')).id;
    await e.repos.periods.create({ name: 'P', startDate: START, memberIds: [a] });
    await expect(e.db.run('UPDATE members SET archived_at = ? WHERE id = ?', ['2026-03-10T00:00:00.000Z', a])).rejects.toThrow();
    await e.repos.members.archive(b);
    await e.db.run("UPDATE periods SET status = 'closed' WHERE status = 'active'"); // simulate an ended period at raw level
    await expect(e.db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ((SELECT id FROM periods LIMIT 1), ?, 9)", [b])).rejects.toThrow();
    await expect(e.db.run("UPDATE members SET archived_at = '' WHERE id = ?", [a])).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('backup: a version 4 file (before archived_at) restored end to end into a live database', () => {
  it('data, kas and reports survive, archived_at is NULL, archive guards work on the restored data', async () => {
    const old = await createSqlJsEnv({ migrated: false });
    await migrate(old.db, MIGRATIONS.slice(0, 4));
    // N=2: due 30.000 per meeting, payout 20.000. m1 paid weeks 1-2 (30.000) and was paid out for week 1.
    await old.db.exec(`
      INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', 'x'), ('m2', 'Budi', 'x');
      INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('p1', 'Lama', 2, 'active', '2026-01-06', 'x');
      INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1), ('p1', 'm2', 2);
      INSERT INTO weeks (period_id, number, date, host_member_id, status) VALUES ('p1', 1, '2026-01-06', 'm1', 'closed'), ('p1', 2, '2026-01-13', 'm2', 'open');
      INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at, account)
        VALUES ('led1', 'p1', '2026-01-06', 30000, 'in', 'member_payment', 'm1', NULL, '', 'x', 'tunai'),
               ('led2', 'p1', '2026-01-06', 20000, 'out', 'host_payout', 'm1', 1, '', 'x', 'tunai');
      INSERT INTO payments (id, period_id, member_id, date, amount, created_at, ledger_entry_id) VALUES ('pay1', 'p1', 'm1', '2026-01-06', 30000, 'x', 'led1');
      INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES ('pay1', 'p1', 'm1', 1, 15000, '2026-01-06'), ('pay1', 'p1', 'm1', 2, 15000, '2026-01-06');
    `);
    const live = await createSqlJsEnv();
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: old.liveBytes() });
    expect(prepared.originalVersion).toBe(4);
    const outcome = await commitRestore(live.bridge, live.db, prepared, new FakeSafetyStore(), () => new Date(2026, 10, 9, 10, 0, 0));
    expect(outcome.outcome).toBe('restored');
    expect((await live.db.getFirst<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(LATEST_VERSION);

    const repos = createRepositories(live.db, { newId: () => 'z', now: () => '2026-03-10T12:00:00.000Z' });
    expect((await repos.members.list()).map((m) => [m.name, m.archivedAt])).toEqual([['Ani', null], ['Budi', null]]);
    expect((await repos.reports.getKasReport()).balances).toMatchObject({ tunai: 10_000, actual: 10_000 }); // 30.000 - 20.000
    const report = await repos.reports.getPeriodReport('p1');
    expect(report.summary).toMatchObject({ collected: 30_000, payouts: 20_000, netKasChange: 10_000 });
    expect((await repos.payments.getWeekStatuses('p1', 'm1')).map((s) => s.outstanding)).toEqual([0, 0]);
    await expect(repos.members.archive('m1')).rejects.toMatchObject({ code: 'in_active_period' });
  });
});
