// M5b repository tests: period close (write-off, credit before write-off, blockers, atomicity), credit carry-over,
// refund, the offset through the current meeting, kas routing without an active period, and corrections in closed
// periods. Tests run on sql.js, so they prove the SQL logic but not the expo-sqlite adapter on the phone.
import { DomainError } from '@/domain/money';
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

/** Clock at 2026-12-31. Member i hosts meeting i+1 (a full schedule, written straight into the table). */
async function setup(memberCount = 3): Promise<Fixture> {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
  const ids: string[] = [];
  for (let i = 0; i < memberCount; i += 1) ids.push((await repos.members.create(`Member ${i + 1}`)).id);
  const period = await repos.periods.create({ name: 'Periode 1', startDate: '2026-01-04', memberIds: ids });
  await scheduleHosts(db, period.id, ids);
  return { db, repos, periodId: period.id, ids };
}

async function scheduleHosts(db: Db, periodId: string, memberIds: readonly string[]): Promise<void> {
  for (let i = 0; i < memberIds.length; i += 1) {
    await db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [memberIds[i] as string, periodId, i + 1]);
  }
}

const count = async (db: Db, table: string, where = '1 = 1'): Promise<number> =>
  (await db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`))?.n ?? -1;

const pay = (f: Fixture, i: number, amount: number, date = '2026-01-04', account: 'tunai' | 'debit' = 'tunai') => ({
  periodId: f.periodId,
  memberId: f.ids[i] as string,
  date,
  amount,
  account,
});

async function closeAllWeeks(repos: Repositories, periodId: string): Promise<void> {
  for (const w of await repos.weeks.listByPeriod(periodId)) {
    if (w.status === 'open') await repos.weeks.closeOldest(periodId);
  }
}

/** Closes the meetings, marks the hosts paid (no pos, balances untouched) and ends the period. */
async function finishPeriod(f: Fixture, periodId = f.periodId, endDate = '2026-12-30'): Promise<void> {
  await closeAllWeeks(f.repos, periodId);
  await markHostsPaid(f.repos, periodId);
  await f.repos.periods.close(periodId, endDate);
}

const writeoffs = (f: Fixture) =>
  f.db.getAll<{ member_id: string; amount: number; direction: string; account: string | null; week: number | null; date: string; period_id: string }>(
    "SELECT member_id, amount, direction, account, week, date, period_id FROM ledger_entries WHERE type = 'debt_writeoff' ORDER BY rowid",
  );

const applications = (db: Db) =>
  db.getAll<{ kind: string; from_period_id: string; member_id: string; to_period_id: string; week: number; amount: number }>(
    'SELECT kind, from_period_id, member_id, to_period_id, week, amount FROM credit_applications ORDER BY rowid',
  );

/** Member 1 holds 15.000 of credit AND two unpaid weeks: pays 30.000 twice, then the first payment is corrected. */
async function creditWithArrears(f: Fixture): Promise<void> {
  const p1 = await f.repos.payments.record(pay(f, 1, 30_000, '2026-01-04')); // weeks 1-2
  await f.repos.payments.record(pay(f, 1, 30_000, '2026-01-11')); // week 3 + 15.000 credit
  await f.repos.payments.reverse(p1.payment.id, 'salah catat'); // weeks 1-2 unpaid again, credit 15.000 stays
}

describe('period close: write-off', () => {
  it('writes ONE write-off entry per member in arrears, none for the others, and changes no balance', async () => {
    const f = await setup(3);
    const [, b, c] = f.ids as [string, string, string];
    await f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 100_000, account: 'tunai' });
    await f.repos.payments.record(pay(f, 0, 45_000)); // pays everything
    await f.repos.payments.record(pay(f, 1, 15_000, '2026-01-04', 'debit')); // owes 30.000
    // member 3 pays nothing: owes 45.000
    await closeAllWeeks(f.repos, f.periodId);
    await markHostsPaid(f.repos, f.periodId);
    const balancesBefore = await f.repos.ledger.getKasBalances();
    const entriesBefore = await count(f.db, 'ledger_entries');

    await f.repos.periods.close(f.periodId, '2026-12-30');

    expect(await writeoffs(f)).toEqual([
      { member_id: b, amount: 30_000, direction: 'out', account: null, week: null, date: '2026-12-30', period_id: f.periodId },
      { member_id: c, amount: 45_000, direction: 'out', account: null, week: null, date: '2026-12-30', period_id: f.periodId },
    ]);
    expect(await count(f.db, 'ledger_entries')).toBe(entriesBefore + 2);
    expect(await f.repos.ledger.getKasBalances()).toEqual(balancesBefore);
    expect(await f.repos.periods.getById(f.periodId)).toMatchObject({ status: 'closed', endDate: '2026-12-30' });
    // The unpaid dues themselves are not touched: the write-off is a separate append-only entry.
    expect((await f.repos.payments.getWeekStatuses(f.periodId, c)).map((s) => s.outstanding)).toEqual([15_000, 15_000, 15_000]);
  });

  it('lets member credit settle that member\'s OWN arrears first (oldest week first), with no ledger entry for the credit', async () => {
    const f = await setup(3);
    const b = f.ids[1] as string;
    await f.repos.payments.record(pay(f, 0, 45_000));
    await f.repos.payments.record(pay(f, 2, 45_000));
    await creditWithArrears(f);
    expect(await f.repos.payments.getCredit(f.periodId, b)).toBe(15_000);
    await closeAllWeeks(f.repos, f.periodId);
    await markHostsPaid(f.repos, f.periodId);
    const entriesBefore = await count(f.db, 'ledger_entries');
    const balancesBefore = await f.repos.ledger.getKasBalances();

    await f.repos.periods.close(f.periodId, '2026-12-30');

    // Arrears 30.000 - credit 15.000 = 15.000 written off. The only new ledger entry is that write-off.
    expect(await writeoffs(f)).toMatchObject([{ member_id: b, amount: 15_000 }]);
    expect(await count(f.db, 'ledger_entries')).toBe(entriesBefore + 1);
    expect(await f.repos.ledger.getKasBalances()).toEqual(balancesBefore);
    expect(await applications(f.db)).toEqual([
      { kind: 'settle_debt', from_period_id: f.periodId, member_id: b, to_period_id: f.periodId, week: 1, amount: 15_000 },
    ]);
    const statuses = await f.repos.payments.getWeekStatuses(f.periodId, b);
    expect(statuses.map((s) => [s.credited, s.outstanding])).toEqual([
      [15_000, 0],
      [0, 15_000],
      [0, 0],
    ]);
    expect(statuses.every((s) => s.due === s.paid + s.offset + s.credited + s.outstanding)).toBe(true);
    expect(await f.repos.credits.getAvailable(f.periodId, b)).toBe(0);
  });

  it('keeps credit that is larger than the arrears and writes nothing off for that member', async () => {
    const f = await setup(3);
    const b = f.ids[1] as string;
    await f.repos.payments.record(pay(f, 0, 45_000));
    await f.repos.payments.record(pay(f, 2, 45_000));
    const p1 = await f.repos.payments.record(pay(f, 1, 15_000, '2026-01-04')); // week 1
    await f.repos.payments.record(pay(f, 1, 60_000, '2026-01-11')); // weeks 2-3 + 30.000 credit
    await f.repos.payments.reverse(p1.payment.id, 'salah'); // week 1 unpaid again
    const preview = await (async () => {
      await closeAllWeeks(f.repos, f.periodId);
      await markHostsPaid(f.repos, f.periodId);
      return f.repos.periods.previewClose(f.periodId);
    })();
    expect(preview).toMatchObject({ canClose: true, totalArrears: 15_000, totalSettledByCredit: 15_000, totalWriteoff: 0, totalCreditLeft: 15_000 });

    await f.repos.periods.close(f.periodId, '2026-12-30');

    expect(await writeoffs(f)).toEqual([]);
    expect(await f.repos.credits.getAvailable(f.periodId, b)).toBe(15_000); // 30.000 - 15.000 used
  });

  it('previews exactly what close then does', async () => {
    const f = await setup(3);
    await f.repos.payments.record(pay(f, 0, 45_000));
    await creditWithArrears(f);
    await closeAllWeeks(f.repos, f.periodId);
    await markHostsPaid(f.repos, f.periodId);
    const preview = await f.repos.periods.previewClose(f.periodId);
    expect(await count(f.db, 'credit_applications')).toBe(0); // previewing writes nothing
    await f.repos.periods.close(f.periodId, '2026-12-30');
    expect(
      (await writeoffs(f)).map((w) => ({ memberId: w.member_id, amount: w.amount })),
    ).toEqual(preview.writeoffs);
  });

  it('rejects a double write-off for the same member and period, and malformed write-off or refund entries', async () => {
    const f = await setup(2);
    const base = { periodId: f.periodId, type: 'debt_writeoff', direction: 'out', date: '2026-12-30', amount: 1_000, memberId: f.ids[0] as string, week: null, note: '' } as const;
    await f.repos.ledger.append({ ...base, account: null });
    await expect(f.repos.ledger.append({ ...base, account: null })).rejects.toThrow(/UNIQUE/i);
    // Another member is fine.
    await f.repos.ledger.append({ ...base, memberId: f.ids[1] as string, account: null });
    // Shape: no pos, no week, out, a member.
    await expect(f.repos.ledger.append({ ...base, memberId: f.ids[1] as string, account: 'tunai' })).rejects.toThrow(/debt_writeoff/);
    const refund = { ...base, type: 'credit_refund', account: 'tunai' } as const;
    await expect(f.repos.ledger.append({ ...refund, account: null })).rejects.toThrow(/credit_refund/);
    await expect(f.repos.ledger.append({ ...refund, account: 'piutang' })).rejects.toThrow(/credit_refund/);
    await expect(f.repos.ledger.append({ ...refund, direction: 'in' })).rejects.toThrow(/credit_refund/);
  });

  it('is atomic: when a write-off fails nothing is written (credit applications, entries, status)', async () => {
    const f = await setup(3);
    const c = f.ids[2] as string;
    await f.repos.payments.record(pay(f, 0, 45_000));
    await creditWithArrears(f); // member 2: credit settles first, then a write-off
    // member 3 owes 45.000. Pre-existing write-off for member 3: the close will hit the unique index on it.
    await f.repos.ledger.append({
      periodId: f.periodId,
      type: 'debt_writeoff',
      direction: 'out',
      date: '2026-12-30',
      amount: 1_000,
      memberId: c,
      week: null,
      note: '',
      account: null,
    });
    await closeAllWeeks(f.repos, f.periodId);
    await markHostsPaid(f.repos, f.periodId);
    const entriesBefore = await count(f.db, 'ledger_entries');

    await expect(f.repos.periods.close(f.periodId, '2026-12-30')).rejects.toThrow(/UNIQUE/i);

    expect(await count(f.db, 'ledger_entries')).toBe(entriesBefore);
    expect(await count(f.db, 'credit_applications')).toBe(0);
    expect(await f.repos.periods.getById(f.periodId)).toMatchObject({ status: 'active', endDate: null });
  });

  it('refuses everything on an ended period: payments, corrections of payments and of payouts', async () => {
    const f = await setup(2);
    const p = await f.repos.payments.record(pay(f, 0, 15_000));
    await finishPeriod(f);
    await expect(f.repos.payments.record(pay(f, 0, 15_000))).rejects.toThrow(/has ended/);
    await expect(f.repos.payments.reverse(p.payment.id, 'terlambat')).rejects.toThrow(/has ended/);
    await expect(f.repos.ledger.reverseHostPayout(f.periodId, 1, 'terlambat')).rejects.toThrow(/has ended/);
    await expect(f.repos.periods.close(f.periodId, '2026-12-30')).rejects.toThrow(/already closed/);
  });
});

describe('period close: blockers', () => {
  it('is blocked while a meeting is open, and writes nothing', async () => {
    const f = await setup(3);
    await f.repos.weeks.closeOldest(f.periodId);
    await markHostsPaid(f.repos, f.periodId);
    const entries = await count(f.db, 'ledger_entries');
    await expect(f.repos.periods.close(f.periodId, '2026-12-30')).rejects.toThrow(/open weeks/);
    expect(await f.repos.periods.previewClose(f.periodId)).toMatchObject({ canClose: false, openWeeks: [2, 3] });
    expect(await count(f.db, 'ledger_entries')).toBe(entries);
    expect((await f.repos.periods.getById(f.periodId))?.status).toBe('active');
  });

  it('is blocked while a host is unpaid', async () => {
    const f = await setup(3);
    await closeAllWeeks(f.repos, f.periodId);
    await expect(f.repos.periods.close(f.periodId, '2026-12-30')).rejects.toThrow(/weeks 1, 2, 3 have no host payout in force/);
    expect(await f.repos.periods.previewClose(f.periodId)).toMatchObject({ canClose: false, openWeeks: [], unpaidHostWeeks: [1, 2, 3] });
    expect(await count(f.db, 'credit_applications')).toBe(0);
    expect((await f.repos.periods.getById(f.periodId))?.status).toBe('active');
  });

  it('counts a corrected payout as unpaid until the host is paid again', async () => {
    const f = await setup(3);
    await closeAllWeeks(f.repos, f.periodId);
    for (const n of [1, 2, 3]) await f.repos.ledger.settleHost(f.periodId, n, '2026-12-01');
    expect(await f.repos.periods.previewClose(f.periodId)).toMatchObject({ canClose: true, unpaidHostWeeks: [] });

    await f.repos.ledger.reverseHostPayout(f.periodId, 2, 'salah pos');
    expect(await f.repos.periods.previewClose(f.periodId)).toMatchObject({ canClose: false, unpaidHostWeeks: [2] });
    await expect(f.repos.periods.close(f.periodId, '2026-12-30')).rejects.toThrow(/weeks 2 have no host payout in force/);

    await f.repos.ledger.settleHost(f.periodId, 2, '2026-12-02');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    expect((await f.repos.periods.getById(f.periodId))?.status).toBe('closed');
  });

  it('rejects an end date before the start date, in the future or not real', async () => {
    const f = await setup(2);
    await closeAllWeeks(f.repos, f.periodId);
    await markHostsPaid(f.repos, f.periodId);
    await expect(f.repos.periods.close(f.periodId, '2026-01-01')).rejects.toThrow(/before the start/);
    await expect(f.repos.periods.close(f.periodId, '2027-01-01')).rejects.toThrow(/in the future/);
    await expect(f.repos.periods.close(f.periodId, '2027-01-01')).rejects.toThrow(DomainError);
    await expect(f.repos.periods.close(f.periodId, '2026-02-31')).rejects.toThrow(DomainError);
    expect((await f.repos.periods.getById(f.periodId))?.status).toBe('active');
    await f.repos.periods.close(f.periodId, '2026-12-31'); // today is allowed
  });
});

describe('credit carry-over into a new period', () => {
  /** N=2: the host of meeting 1 gets a CAPPED offset (20.000 of 30.000), pays 15.000 and is left with 5.000 credit. */
  async function periodWithFiveThousandCredit(): Promise<Fixture> {
    const f = await setup(2);
    await closeAllWeeks(f.repos, f.periodId);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-12-01'); // host debt through the current meeting: 30.000, cap 20.000
    const paid = await f.repos.payments.record(pay(f, 0, 15_000, '2026-12-02')); // fills the 10.000 left of meeting 2
    expect(paid.credit).toBe(5_000);
    await f.repos.payments.record(pay(f, 1, 30_000, '2026-12-02'));
    await f.repos.ledger.settleHost(f.periodId, 2, '2026-12-03');
    await f.repos.periods.close(f.periodId, '2026-12-30');
    return f;
  }

  it('settles PART of meeting 1 with a credit of 5.000, stored per week, with no ledger entry', async () => {
    const f = await periodWithFiveThousandCredit();
    const a = f.ids[0] as string;
    const extra = (await f.repos.members.create('Cici')).id;
    expect(await writeoffs(f)).toEqual([]);
    expect(await f.repos.credits.getAvailable(f.periodId, a)).toBe(5_000);

    const preview = await f.repos.periods.previewCarryOver([a, f.ids[1] as string, extra]);
    expect(preview.find((p) => p.memberId === a)).toMatchObject({
      creditBefore: 5_000,
      plan: { applications: [{ fromPeriodId: f.periodId, week: 1, amount: 5_000 }], applied: 5_000, creditLeft: 0 },
    });
    expect(preview.find((p) => p.memberId === extra)?.plan.applications).toEqual([]);

    const entriesBefore = await count(f.db, 'ledger_entries');
    const next = await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-01', memberIds: [a, f.ids[1] as string, extra] });

    expect(await count(f.db, 'ledger_entries')).toBe(entriesBefore); // no ledger entry for carry-over
    expect(await applications(f.db)).toEqual([
      { kind: 'carry_over', from_period_id: f.periodId, member_id: a, to_period_id: next.id, week: 1, amount: 5_000 },
    ]);
    const statuses = await f.repos.payments.getWeekStatuses(next.id, a);
    expect(statuses[0]).toMatchObject({ credited: 5_000, outstanding: 10_000, paid: 0, offset: 0 });
    expect(statuses.every((s) => s.due === s.paid + s.offset + s.credited + s.outstanding)).toBe(true);
    expect(await f.repos.credits.getAvailable(f.periodId, a)).toBe(0);

    // A normal payment fills the room that is left: 10.000 of meeting 1, then meeting 2.
    const recorded = await f.repos.payments.record({ periodId: next.id, memberId: a, date: '2026-12-31', amount: 15_000, account: 'tunai' });
    expect(recorded.allocations.map((x) => [x.week, x.amount])).toEqual([
      [1, 10_000],
      [2, 5_000],
    ]);
  });

  it('is stored once and never recomputed by later activity', async () => {
    const f = await periodWithFiveThousandCredit();
    const a = f.ids[0] as string;
    const next = await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-01', memberIds: f.ids });
    const stored = await applications(f.db);
    expect(stored).toHaveLength(1);

    await f.repos.payments.record({ periodId: next.id, memberId: a, date: '2026-12-31', amount: 45_000, account: 'debit' });
    await f.repos.payments.record({ periodId: next.id, memberId: f.ids[1] as string, date: '2026-12-31', amount: 30_000, account: 'tunai' });
    expect(await applications(f.db)).toEqual(stored);
    await expect(f.db.run('UPDATE credit_applications SET amount = 1')).rejects.toThrow(/append-only/);
    await expect(f.db.run('DELETE FROM credit_applications')).rejects.toThrow(/append-only/);
  });

  it('keeps the rest when credit is above the new period dues and uses credit from ALL closed periods', async () => {
    const f = await setup(2);
    const [a, b] = f.ids as [string, string];
    await f.repos.payments.record(pay(f, 0, 90_000)); // dues 30.000, credit 60.000
    await finishPeriod(f);
    expect(await f.repos.credits.getAvailable(f.periodId, a)).toBe(60_000);

    const p2 = await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-01', memberIds: [a, b] });
    expect((await f.repos.payments.getWeekStatuses(p2.id, a)).map((s) => [s.credited, s.outstanding])).toEqual([
      [15_000, 0],
      [15_000, 0],
    ]);
    expect(await f.repos.credits.getAvailable(f.periodId, a)).toBe(30_000); // the rest stays available
    expect(await f.repos.credits.listRefundable()).toEqual([{ periodId: f.periodId, periodName: 'Periode 1', memberId: a, amount: 30_000 }]);
  });

  it('carries credit of an older closed period into a third period', async () => {
    const f = await setup(2);
    const [a, b] = f.ids as [string, string];
    await f.repos.payments.record(pay(f, 0, 90_000));
    await finishPeriod(f);
    // Period 2 starts in the past so it can end before "today" (2026-12-31).
    const p2 = await f.repos.periods.create({ name: 'Periode 2', startDate: '2026-06-01', memberIds: [a, b] });
    await scheduleHosts(f.db, p2.id, [a, b]);
    await finishPeriod(f, p2.id, '2026-12-31');
    expect(await f.repos.credits.getAvailable(f.periodId, a)).toBe(30_000);

    const p3 = await f.repos.periods.create({ name: 'Periode 3', startDate: '2027-01-01', memberIds: [a, b] });
    expect((await f.repos.payments.getWeekStatuses(p3.id, a)).map((s) => s.credited)).toEqual([15_000, 15_000]);
    expect(await f.repos.credits.getAvailable(f.periodId, a)).toBe(0);
    expect(await applications(f.db)).toEqual([
      expect.objectContaining({ kind: 'carry_over', from_period_id: f.periodId, to_period_id: p2.id, member_id: a, week: 1, amount: 15_000 }),
      expect.objectContaining({ kind: 'carry_over', from_period_id: f.periodId, to_period_id: p2.id, member_id: a, week: 2, amount: 15_000 }),
      expect.objectContaining({ kind: 'carry_over', from_period_id: f.periodId, to_period_id: p3.id, member_id: a, week: 1, amount: 15_000 }),
      expect.objectContaining({ kind: 'carry_over', from_period_id: f.periodId, to_period_id: p3.id, member_id: a, week: 2, amount: 15_000 }),
    ]);
  });

  it('does not touch members who are not in the new period', async () => {
    const f = await setup(2);
    const [a, b] = f.ids as [string, string];
    await f.repos.payments.record(pay(f, 0, 45_000)); // 15.000 credit
    await finishPeriod(f);
    const other = (await f.repos.members.create('Cici')).id;
    await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-01', memberIds: [b, other] });
    expect(await applications(f.db)).toEqual([]);
    expect(await f.repos.credits.getAvailable(f.periodId, a)).toBe(15_000);
  });
});

describe('credit refund', () => {
  async function closedPeriodWithCredit(): Promise<Fixture> {
    const f = await setup(2);
    await f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 100_000, account: 'debit' });
    await f.repos.payments.record(pay(f, 0, 90_000)); // 60.000 credit, received into Tunai
    return f;
  }

  it('refunds ALL remaining credit with one out entry on the chosen pos and leaves credit 0', async () => {
    const f = await closedPeriodWithCredit();
    const a = f.ids[0] as string;
    await expect(f.repos.credits.refund(f.periodId, a, '2026-12-30', 'debit')).rejects.toThrow(/has not ended/); // still active
    await finishPeriod(f);
    const before = await f.repos.ledger.getKasBalances();
    const entriesBefore = await count(f.db, 'ledger_entries');

    const preview = await f.repos.credits.previewRefund(f.periodId, a, '2026-12-30', 'debit');
    expect(preview).toMatchObject({ entry: { amount: 60_000, direction: 'out', account: 'debit', type: 'credit_refund' } });
    expect(await count(f.db, 'ledger_entries')).toBe(entriesBefore); // preview writes nothing

    const entry = await f.repos.credits.refund(f.periodId, a, '2026-12-30', 'debit');
    expect(entry).toMatchObject({ type: 'credit_refund', direction: 'out', account: 'debit', amount: 60_000, memberId: a, week: null, periodId: f.periodId, date: '2026-12-30' });
    expect(await count(f.db, 'ledger_entries')).toBe(entriesBefore + 1);
    const after = await f.repos.ledger.getKasBalances();
    expect(after.debit).toBe(before.debit - 60_000);
    expect(after.tunai).toBe(before.tunai); // only the chosen pos moves
    expect(await f.repos.credits.getAvailable(f.periodId, a)).toBe(0);
    expect(await f.repos.credits.listRefundable()).toEqual([]);
    await expect(f.repos.credits.refund(f.periodId, a, '2026-12-30', 'debit')).rejects.toThrow(/nothing to refund/);
  });

  it('can refund from Tunai, rejects a future date and a pos other than Tunai/Debit, and cannot be corrected', async () => {
    const f = await closedPeriodWithCredit();
    const a = f.ids[0] as string;
    await finishPeriod(f);
    await expect(f.repos.credits.refund(f.periodId, a, '2027-01-01', 'tunai')).rejects.toThrow(/in the future/);
    await expect(f.repos.credits.refund(f.periodId, a, '2026-12-30', 'piutang')).rejects.toThrow(/tunai or debit/);
    await expect(f.repos.credits.refund(f.periodId, f.ids[1] as string, '2026-12-30', 'tunai')).rejects.toThrow(/nothing to refund/);
    await expect(f.repos.credits.refund(f.periodId, 'ghost', '2026-12-30', 'tunai')).rejects.toThrow(/not found/);
    const tunaiBefore = (await f.repos.ledger.getKasBalances()).tunai;
    const entry = await f.repos.credits.refund(f.periodId, a, '2026-12-30', 'tunai');
    expect((await f.repos.ledger.getKasBalances()).tunai).toBe(tunaiBefore - 60_000);
    await expect(f.repos.ledger.reverseEntry(entry.id, 'salah')).rejects.toThrow(/cannot be corrected here/);
  });

  it('only refunds what is left after a carry-over', async () => {
    const f = await closedPeriodWithCredit();
    const [a, b] = f.ids as [string, string];
    await finishPeriod(f);
    await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-01', memberIds: [a, b] }); // takes 30.000
    const entry = await f.repos.credits.refund(f.periodId, a, '2026-12-30', 'tunai');
    expect(entry.amount).toBe(30_000);
  });
});

describe('host offset counts arrears through the CURRENT meeting', () => {
  it('offsets the host\'s unpaid weeks up to the current meeting, not only up to the host\'s own meeting', async () => {
    const f = await setup(5); // payout 50.000
    await f.repos.weeks.closeOldest(f.periodId);
    await f.repos.weeks.closeOldest(f.periodId); // meetings 1-2 closed: the current meeting is 3
    const preview = await f.repos.ledger.previewHostPayout(f.periodId, 1, '2026-01-04');
    expect(preview).toMatchObject({ payout: 50_000, offset: 45_000, netCash: 5_000, remainingDebt: 0 });
    const { entries } = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    expect(entries.map((e) => [e.type, e.amount])).toEqual([
      ['host_payout', 50_000],
      ['host_offset', 45_000],
    ]);
    expect((await f.repos.payments.getWeekStatuses(f.periodId, f.ids[0] as string)).map((s) => s.offset)).toEqual([
      15_000, 15_000, 15_000, 0, 0,
    ]);
  });

  it('uses the last meeting as the current one when every meeting is closed, still capped at the payout', async () => {
    const f = await setup(3); // payout 30.000, the host owes 45.000 through meeting 3
    await closeAllWeeks(f.repos, f.periodId);
    const { entries, settlement } = await f.repos.ledger.settleHost(f.periodId, 1, '2026-12-01');
    expect(entries.map((e) => e.amount)).toEqual([30_000, 30_000]);
    expect(settlement.remainingDebt).toBe(15_000);
  });

  it('is the same as before for the current meeting itself', async () => {
    const f = await setup(4);
    const { entries } = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    expect(entries.map((e) => e.amount)).toEqual([40_000, 15_000]);
  });
});

describe('kas entries without an active period', () => {
  async function twoClosedPeriods(): Promise<{ f: Fixture; p2: string; outsider: string; cici: string }> {
    const f = await setup(2); // period 1: members 1, 2
    const cici = (await f.repos.members.create('Cici')).id;
    const outsider = (await f.repos.members.create('Orang Luar')).id;
    await finishPeriod(f);
    const p2 = await f.repos.periods.create({ name: 'Periode 2', startDate: '2026-06-01', memberIds: [f.ids[1] as string, cici] });
    await scheduleHosts(f.db, p2.id, [f.ids[1] as string, cici]);
    await finishPeriod(f, p2.id, '2026-12-31');
    return { f, p2: p2.id, outsider, cici };
  }

  it('attaches opening balances, transfers and shared goals to the LATEST closed period', async () => {
    const { f, p2 } = await twoClosedPeriods();
    const e1 = await f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-12-31', amount: 10_000, account: 'tunai' });
    const e2 = await f.repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-12-31', amount: 1_000, account: 'tunai', note: 'tur' });
    expect(e1.periodId).toBe(p2);
    expect(e2.periodId).toBe(p2);
  });

  it('rejects a new loan without an active period, but routes repayments to the latest period of the member', async () => {
    const { f, p2, outsider } = await twoClosedPeriods();
    const [a, b] = f.ids as [string, string];
    await expect(f.repos.ledger.recordKas({ kind: 'loan', date: '2026-12-31', amount: 1_000, account: 'tunai', memberId: b })).rejects.toThrow(/no active period/);
    const repay = (memberId: string) => f.repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-12-31', amount: 1_000, memberId });
    // Old loans (named opening balances) follow the same period rule as repayments, so they work without an active period.
    const oldLoan = (memberId: string) => f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-12-31', amount: 1_000, account: 'piutang', memberId });
    expect((await oldLoan(a)).periodId).toBe(f.periodId);
    expect((await oldLoan(b)).periodId).toBe(p2);
    expect((await repay(a)).periodId).toBe(f.periodId); // only in period 1
    expect((await repay(b)).periodId).toBe(p2); // in both: the latest
    await expect(repay(outsider)).rejects.toThrow(/not found in any period/);
  });

  it('prefers the active period for a repayment when the member is in it, otherwise the latest period of the member', async () => {
    const { f, p2, cici } = await twoClosedPeriods();
    const [a, b] = f.ids as [string, string];
    const p3 = await f.repos.periods.create({ name: 'Periode 3', startDate: '2027-01-01', memberIds: [a, cici] });
    const repay = (memberId: string) => f.repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-12-31', amount: 1_000, memberId });
    for (const id of [a, b, cici]) {
      await f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-12-31', amount: 1_000, account: 'piutang', memberId: id });
    }
    expect((await repay(a)).periodId).toBe(p3.id); // in the active period
    expect((await repay(cici)).periodId).toBe(p3.id);
    expect((await repay(b)).periodId).toBe(p2); // not in period 3: latest period containing b
    // New loans stay limited to the active period's members.
    expect((await f.repos.ledger.recordKas({ kind: 'loan', date: '2026-12-31', amount: 1_000, account: 'tunai', memberId: a })).periodId).toBe(p3.id);
    await expect(f.repos.ledger.recordKas({ kind: 'loan', date: '2026-12-31', amount: 1_000, account: 'tunai', memberId: b })).rejects.toThrow(/not found in period/);
  });
});

describe('corrections in a closed period', () => {
  it('reverses a kas entry of a closed period, recorded on that entry\'s period, while a payment still cannot be', async () => {
    const f = await setup(2);
    const opening = await f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 40_000, account: 'tunai' });
    const payment = await f.repos.payments.record(pay(f, 0, 15_000));
    await finishPeriod(f);
    const p2 = await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-01', memberIds: f.ids });

    const reversal = await f.repos.ledger.reverseEntry(opening.id, 'salah ketik');
    expect(reversal).toMatchObject({ type: 'reversal', periodId: f.periodId, reversesEntryId: opening.id });
    expect(reversal.periodId).not.toBe(p2.id);
    expect((await f.repos.ledger.getKasBalances()).tunai).toBe(15_000); // only the payment is left
    await expect(f.repos.ledger.reverseEntry(opening.id, 'lagi')).rejects.toThrow(/already corrected/);
    await expect(f.repos.payments.reverse(payment.payment.id, 'terlambat')).rejects.toThrow(/has ended/);
  });
});
