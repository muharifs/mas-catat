// M5a repository tests: host payout (pos, closed weeks, rules), kas ledger across pos, and corrections.
import { DomainError } from '@/domain/money';
import { createRepositories, RepositoryError, type Repositories } from './index';
import type { Db } from './db';
import { markHostsPaid } from './testing/hostPayouts';
import { createMigratedTestDb } from './testing/sqlJsDriver';

interface Fixture {
  db: Db;
  repos: Repositories;
  periodId: string;
  ids: string[];
}

/** Like the M4 fixture: a full host schedule (member i hosts week i+1), clock at 2026-12-31. */
async function setup(memberCount = 4): Promise<Fixture> {
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

const count = async (db: Db, table: string): Promise<number> =>
  (await db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? -1;

const pay = (f: Fixture, i: number, amount: number, date = '2026-01-04', account: 'tunai' | 'debit' = 'tunai') => ({
  periodId: f.periodId,
  memberId: f.ids[i] as string,
  date,
  amount,
  account,
});

// An opening balance in Piutang is an old loan and must name the member.
const opening = (f: Fixture, account: 'tunai' | 'debit' | 'piutang', amount: number, memberId?: string) =>
  f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount, account, memberId });

async function closeWeeks(f: Fixture, upTo: number): Promise<void> {
  for (let i = 0; i < upTo; i += 1) await f.repos.weeks.closeOldest(f.periodId);
}

async function endPeriod(f: Fixture): Promise<void> {
  const weeks = await f.repos.weeks.listByPeriod(f.periodId);
  await closeWeeks(f, weeks.filter((w) => w.status === 'open').length);
  await markHostsPaid(f.repos, f.periodId); // closing needs every host paid; these payouts have no pos
  await f.repos.periods.close(f.periodId, '2026-12-30');
}

describe('host payout: which weeks, which pos', () => {
  it('pays the current week and writes payout + offset on the same pos (Tunai by default)', async () => {
    const f = await setup(4);
    const { entries, settlement } = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    expect(entries.map((e) => [e.type, e.direction, e.amount, e.account])).toEqual([
      ['host_payout', 'out', 40_000, 'tunai'],
      ['host_offset', 'in', 15_000, 'tunai'],
    ]);
    expect(settlement.netCash).toBe(25_000);
    expect(await f.repos.ledger.getKasBalances()).toMatchObject({ tunai: -25_000, debit: 0 });
  });

  it('uses the chosen pos for BOTH entries and only that pos loses the net cash', async () => {
    const f = await setup(4);
    await opening(f, 'tunai', 100_000);
    await opening(f, 'debit', 100_000);
    const { entries } = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04', 'debit');
    expect(entries.map((e) => e.account)).toEqual(['debit', 'debit']);
    expect(await f.repos.ledger.getKasBalances()).toMatchObject({ tunai: 100_000, debit: 75_000, actual: 175_000 });
  });

  it('allows a payout on an already CLOSED week', async () => {
    const f = await setup(4);
    await closeWeeks(f, 2);
    const { entries } = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    expect(entries.map((e) => e.type)).toEqual(['host_payout', 'host_offset']);
    // Week 3 is now the current week and can be paid too.
    await f.repos.ledger.settleHost(f.periodId, 3, '2026-01-18');
  });

  it('offsets the arrears AT PAYOUT TIME: a late payment of the host after closing is respected', async () => {
    const f = await setup(4);
    await closeWeeks(f, 1);
    await f.repos.payments.record(pay(f, 0, 30_000, '2026-01-10')); // host pays weeks 1 and 2 (the current one) late
    const { entries } = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-11');
    expect(entries.map((e) => e.type)).toEqual(['host_payout']);
  });

  it('rejects a second payout for the same week, open or closed', async () => {
    const f = await setup(4);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    await expect(f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04')).rejects.toThrow(/already has a host payout/);
    await closeWeeks(f, 1);
    await expect(f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04', 'debit')).rejects.toThrow(/already has a host payout/);
    expect(await count(f.db, 'ledger_entries')).toBe(2);
  });

  it('rejects a future week (open and not the current one) and writes nothing', async () => {
    const f = await setup(4);
    await expect(f.repos.ledger.settleHost(f.periodId, 2, '2026-01-04')).rejects.toThrow(/cannot be paid out yet/);
    await expect(f.repos.ledger.settleHost(f.periodId, 4, '2026-01-04')).rejects.toThrow(/cannot be paid out yet/);
    expect(await count(f.db, 'ledger_entries')).toBe(0);
  });

  it('rejects a week without a host (also a future one)', async () => {
    const f = await setup(4);
    await f.db.run('UPDATE weeks SET host_member_id = NULL WHERE period_id = ? AND number = 1', [f.periodId]);
    await expect(f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04')).rejects.toThrow(/has no host/);
    await expect(f.repos.ledger.previewHostPayout(f.periodId, 1, '2026-01-04')).rejects.toThrow(/has no host/);
    expect(await count(f.db, 'ledger_entries')).toBe(0);
  });

  it('rejects an unknown week, a future date, a bad pos and an ended period', async () => {
    const f = await setup(2);
    await expect(f.repos.ledger.settleHost(f.periodId, 9, '2026-01-04')).rejects.toThrow(/not found/);
    await expect(f.repos.ledger.settleHost(f.periodId, 1, '2027-01-01')).rejects.toThrow(/in the future/);
    await expect(f.repos.ledger.settleHost(f.periodId, 1, '2026-02-31')).rejects.toThrow(DomainError);
    await expect(f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04', 'piutang')).rejects.toThrow(RepositoryError);
    await endPeriod(f);
    const entriesAfterClose = await count(f.db, 'ledger_entries');
    await expect(f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04')).rejects.toThrow(/has ended/);
    expect(await count(f.db, 'ledger_entries')).toBe(entriesAfterClose);
  });

  it('previews exactly what settleHost saves, with the balance warnings, and writes nothing', async () => {
    const f = await setup(4);
    await opening(f, 'tunai', 10_000);
    await opening(f, 'debit', 50_000);
    const before = await count(f.db, 'ledger_entries');
    const preview = await f.repos.ledger.previewHostPayout(f.periodId, 1, '2026-01-04', 'tunai');
    expect(await count(f.db, 'ledger_entries')).toBe(before);
    expect(preview).toMatchObject({ payout: 40_000, offset: 15_000, netCash: 25_000, kasBefore: 60_000, accountBefore: 10_000 });
    expect(preview.kasShort).toBe(false); // 60.000 covers the net 25.000
    expect(preview.accountShort).toBe(true); // Tunai alone has only 10.000
    const saved = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04', 'tunai'); // a warning never blocks
    expect(saved.entries.map((e) => e.amount)).toEqual(preview.entries.map((e) => e.amount));
  });
});

describe('kas ledger', () => {
  it('computes balances from opening balances, transfers both ways, loans and repayments', async () => {
    const f = await setup(3);
    const m = f.ids[0] as string;
    await opening(f, 'tunai', 100_000);
    await opening(f, 'debit', 50_000);
    await opening(f, 'piutang', 20_000, m);
    await f.repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-02', amount: 30_000, account: 'tunai', toAccount: 'debit' });
    await f.repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-02', amount: 10_000, account: 'debit', toAccount: 'tunai' });
    expect(await f.repos.ledger.getKasBalances()).toEqual({ tunai: 80_000, debit: 70_000, piutang: 20_000, actual: 150_000 });

    await f.repos.ledger.recordKas({ kind: 'loan', date: '2026-01-03', amount: 25_000, account: 'debit', memberId: m });
    await f.repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-01-04', amount: 5_000, memberId: m });
    await f.repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-01-05', amount: 12_345, account: 'tunai', note: 'DP tur' });
    expect(await f.repos.ledger.getKasBalances()).toEqual({ tunai: 72_655, debit: 45_000, piutang: 40_000, actual: 117_655 });
    expect(await count(f.db, 'ledger_entries')).toBe(8); // every action is exactly ONE entry
  });

  it('puts member payments and payouts into the same balances', async () => {
    const f = await setup(4);
    await f.repos.payments.record(pay(f, 1, 30_000, '2026-01-04', 'debit'));
    await f.repos.payments.record(pay(f, 2, 15_000, '2026-01-04', 'tunai'));
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04', 'tunai');
    expect(await f.repos.ledger.getKasBalances()).toMatchObject({ tunai: 15_000 - 25_000, debit: 30_000 });
  });

  it('is global: it sums the entries of every period', async () => {
    const f = await setup(2);
    await opening(f, 'tunai', 40_000);
    await endPeriod(f);
    const next = await f.repos.periods.create({ name: 'Periode 2', startDate: '2027-01-01', memberIds: f.ids });
    await f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-12-31', amount: 10_000, account: 'tunai' });
    // The closing helper also wrote a payout per week into period 1, so compare the distinct periods.
    expect([...new Set((await f.repos.ledger.listKas()).map((e) => e.periodId))].sort()).toEqual([f.periodId, next.id].sort());
    expect((await f.repos.ledger.getKasBalances()).tunai).toBe(50_000);
  });

  it('entries without a pos never change the balances and stay visible', async () => {
    const f = await setup(2);
    const base = { periodId: f.periodId, date: '2026-01-04', memberId: null, week: null, note: '' } as const;
    await f.repos.ledger.append({ ...base, type: 'host_payout', direction: 'out', amount: 20_000 }); // like an M2 payout
    await f.repos.ledger.append({ ...base, type: 'host_offset', direction: 'in', amount: 15_000, account: null });
    await opening(f, 'tunai', 5_000);
    expect(await f.repos.ledger.getKasBalances()).toEqual({ tunai: 5_000, debit: 0, piutang: 0, actual: 5_000 });
    const list = await f.repos.ledger.listKas();
    expect(list).toHaveLength(3);
    expect(list.filter((e) => e.account === null)).toHaveLength(2);
  });

  it('rejects every kas entry when there is no period at all', async () => {
    const db = await createMigratedTestDb();
    const repos = createRepositories(db, { newId: () => 'x', now: () => '2026-12-31T12:00:00.000Z' });
    await expect(repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 1_000, account: 'tunai' })).rejects.toThrow(
      /no period exists yet/,
    );
    await expect(
      repos.ledger.previewKas({ kind: 'transfer', date: '2026-01-01', amount: 1, account: 'tunai', toAccount: 'debit' }),
    ).rejects.toThrow(/no period exists yet/);
    expect(await count(db, 'ledger_entries')).toBe(0);
  });

  it('rejects a loan to someone outside the active period, a future date and malformed entries', async () => {
    const f = await setup(2);
    const outsider = (await f.repos.members.create('Orang Luar')).id;
    await expect(f.repos.ledger.recordKas({ kind: 'loan', date: '2026-01-04', amount: 1_000, account: 'tunai', memberId: outsider })).rejects.toThrow(
      /not found in period/,
    );
    await expect(f.repos.ledger.recordKas({ kind: 'loan', date: '2027-01-04', amount: 1_000, account: 'tunai', memberId: f.ids[0] as string })).rejects.toThrow(
      /in the future/,
    );
    await expect(f.repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-01-04', amount: 1_000, account: 'tunai', note: ' ' })).rejects.toThrow(DomainError);
    await expect(f.repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-04', amount: 1_000, account: 'tunai', toAccount: 'tunai' })).rejects.toThrow(
      DomainError,
    );
    await expect(f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-04', amount: 0, account: 'tunai' })).rejects.toThrow();
    expect(await count(f.db, 'ledger_entries')).toBe(0);
  });

  it('previews balances and warns about a negative pos without blocking the save', async () => {
    const f = await setup(2);
    await opening(f, 'tunai', 10_000);
    const preview = await f.repos.ledger.previewKas({ kind: 'shared_goal', date: '2026-01-04', amount: 30_000, account: 'tunai', note: 'tur' });
    expect(preview.negativeAccounts).toEqual(['tunai']);
    expect(preview.after.tunai).toBe(-20_000);
    expect(await count(f.db, 'ledger_entries')).toBe(1);
    await f.repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-01-04', amount: 30_000, account: 'tunai', note: 'tur' });
    expect((await f.repos.ledger.getKasBalances()).tunai).toBe(-20_000);
  });

  it('stores a move as ONE entry with source and destination', async () => {
    const f = await setup(2);
    const e = await f.repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-04', amount: 5_000, account: 'tunai', toAccount: 'debit' });
    expect(await f.repos.ledger.getEntry(e.id)).toMatchObject({ type: 'transfer', account: 'tunai', toAccount: 'debit', direction: 'out' });
    await expect(f.db.run("UPDATE ledger_entries SET to_account = 'tunai' WHERE id = ?", [e.id])).rejects.toThrow(/append-only/);
    await expect(
      f.repos.ledger.append({ periodId: f.periodId, type: 'transfer', direction: 'out', date: '2026-01-04', amount: 1, memberId: null, week: null, note: '', account: 'tunai', toAccount: 'tunai' }),
    ).rejects.toThrow(/two different pos/);
  });
});

describe('corrections of kas entries', () => {
  it('reverses every kind with the opposite effect and marks the original', async () => {
    const f = await setup(3);
    const m = f.ids[0] as string;
    const made = [
      await opening(f, 'tunai', 100_000),
      await opening(f, 'piutang', 8_000, m),
      await f.repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-02', amount: 30_000, account: 'tunai', toAccount: 'debit' }),
      await f.repos.ledger.recordKas({ kind: 'loan', date: '2026-01-03', amount: 20_000, account: 'debit', memberId: m }),
      await f.repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-01-04', amount: 5_000, memberId: m }),
      await f.repos.ledger.recordKas({ kind: 'shared_goal', date: '2026-01-05', amount: 12_000, account: 'tunai', note: 'tur' }),
    ];
    for (const e of made.slice().reverse()) await f.repos.ledger.reverseEntry(e.id, 'salah catat');
    expect(await f.repos.ledger.getKasBalances()).toEqual({ tunai: 0, debit: 0, piutang: 0, actual: 0 });

    for (const e of made) {
      const original = await f.repos.ledger.getEntry(e.id);
      expect(original?.reversedById).not.toBeNull();
      const reversal = await f.repos.ledger.getEntry(original?.reversedById as string);
      expect(reversal).toMatchObject({ type: 'reversal', reversesEntryId: e.id, correctionReason: 'salah catat', amount: e.amount, date: '2026-12-31' });
      // The original row itself is unchanged.
      expect(original).toMatchObject({ type: e.type, amount: e.amount, account: e.account, toAccount: e.toAccount, date: e.date });
    }
  });

  it('swaps source and destination of a reversed transfer', async () => {
    const f = await setup(2);
    const t = await f.repos.ledger.recordKas({ kind: 'transfer', date: '2026-01-04', amount: 5_000, account: 'tunai', toAccount: 'debit' });
    const r = await f.repos.ledger.reverseEntry(t.id, 'salah arah');
    expect(r).toMatchObject({ account: 'debit', toAccount: 'tunai', direction: 'out', amount: 5_000, reversesEntryId: t.id });
  });

  it('refuses a second reversal (explicitly and by the unique index)', async () => {
    const f = await setup(2);
    const e = await opening(f, 'tunai', 1_000);
    const r = await f.repos.ledger.reverseEntry(e.id, 'salah');
    await expect(f.repos.ledger.reverseEntry(e.id, 'sekali lagi')).rejects.toThrow(/already corrected/);
    await expect(f.repos.ledger.reverseEntry(r.id, 'batalkan koreksi')).rejects.toThrow(/cannot be corrected here/);
    expect(await count(f.db, 'ledger_entries')).toBe(2);
    // Even a hand-written insert cannot reverse the same entry twice.
    await expect(
      f.db.run(
        "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, created_at, reverses_entry_id, correction_reason) VALUES ('x', ?, '2026-01-04', 1000, 'out', 'reversal', 't', ?, 'again')",
        [f.periodId, e.id],
      ),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it('requires a reason, in the repository and in the database', async () => {
    const f = await setup(2);
    const e = await opening(f, 'tunai', 1_000);
    await expect(f.repos.ledger.reverseEntry(e.id, '')).rejects.toThrow(DomainError);
    await expect(f.repos.ledger.reverseEntry(e.id, '   ')).rejects.toThrow(/reason is required/);
    await expect(
      f.db.run(
        "INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, created_at, reverses_entry_id) VALUES ('x', ?, '2026-01-04', 1000, 'out', 'reversal', 't', ?)",
        [f.periodId, e.id],
      ),
    ).rejects.toThrow(/correction reason/);
    expect(await count(f.db, 'ledger_entries')).toBe(1);
  });

  it('corrects kas entries even in an ended period; payments and payouts stay uncorrectable there', async () => {
    const f = await setup(2);
    const e = await opening(f, 'tunai', 1_000);
    const p = await f.repos.payments.record(pay(f, 0, 15_000));
    await expect(f.repos.ledger.reverseEntry(f.ids[0] as string, 'x')).rejects.toThrow(/not found/);
    const payEntry = (await f.repos.ledger.listByMember(f.periodId, f.ids[0] as string))[0];
    await expect(f.repos.ledger.reverseEntry(payEntry?.id as string, 'x')).rejects.toThrow(/cannot be corrected here/);
    await endPeriod(f);
    await expect(f.repos.payments.reverse(p.payment.id, 'terlambat')).rejects.toThrow(/has ended/);
    await expect(f.repos.ledger.reverseHostPayout(f.periodId, 1, 'terlambat')).rejects.toThrow(/has ended/);
    // A kas entry of the ended period can still be reversed, recorded on ITS period.
    const reversal = await f.repos.ledger.reverseEntry(e.id, 'salah catat');
    expect(reversal).toMatchObject({ type: 'reversal', periodId: f.periodId, reversesEntryId: e.id });
    expect((await f.repos.ledger.getKasBalances()).tunai).toBe(15_000); // the payment only; the opening balance is cancelled
  });
});

describe('corrections of payments', () => {
  it('reverses the ledger entry, frees the dues, keeps other payments in place and the allocations stored', async () => {
    const f = await setup(4);
    const member = f.ids[1] as string;
    const p1 = await f.repos.payments.record(pay(f, 1, 30_000, '2026-01-04', 'debit')); // weeks 1-2
    const p2 = await f.repos.payments.record(pay(f, 1, 15_000, '2026-01-11')); // week 3
    expect((await f.repos.ledger.getKasBalances()).actual).toBe(45_000);
    const allocationsBefore = await count(f.db, 'allocations');

    const reversal = await f.repos.payments.reverse(p1.payment.id, 'salah anggota');
    expect(reversal).toMatchObject({ type: 'reversal', direction: 'out', amount: 30_000, account: 'debit', memberId: member, correctionReason: 'salah anggota' });
    expect(await count(f.db, 'allocations')).toBe(allocationsBefore); // nothing deleted
    expect(await count(f.db, 'payment_reversals')).toBe(1);

    const statuses = await f.repos.payments.getWeekStatuses(f.periodId, member);
    expect(statuses.map((s) => s.paid)).toEqual([0, 0, 15_000, 0]); // week 3 (payment 2) did not move
    expect(statuses.map((s) => s.outstanding)).toEqual([15_000, 15_000, 0, 15_000]);
    expect((await f.repos.ledger.getKasBalances()).actual).toBe(15_000);

    const list = await f.repos.payments.listWithCredit(f.periodId, member);
    expect(list.map((p) => [p.id, p.reversed, p.reversalReason])).toEqual([
      [p1.payment.id, true, 'salah anggota'],
      [p2.payment.id, false, null],
    ]);

    // The correct payment is entered again through the normal path and fills the oldest unpaid weeks.
    const again = await f.repos.payments.record(pay(f, 1, 30_000, '2026-01-12'));
    expect(again.allocations.map((a) => a.week)).toEqual([1, 2]);
    expect((await f.repos.payments.getWeekStatuses(f.periodId, member)).map((s) => s.outstanding)).toEqual([0, 0, 0, 15_000]);
  });

  it('drops the credit of a corrected payment', async () => {
    const f = await setup(2);
    const member = f.ids[0] as string;
    const big = await f.repos.payments.record(pay(f, 0, 60_000)); // 30.000 allocated, 30.000 credit
    const small = await f.repos.payments.record(pay(f, 0, 15_000, '2026-01-05')); // pure credit
    expect(await f.repos.payments.getCredit(f.periodId, member)).toBe(45_000);
    await f.repos.payments.reverse(small.payment.id, 'dobel');
    expect(await f.repos.payments.getCredit(f.periodId, member)).toBe(30_000);
    await f.repos.payments.reverse(big.payment.id, 'salah jumlah');
    expect(await f.repos.payments.getCredit(f.periodId, member)).toBe(0);
    expect((await f.repos.payments.listBalances(f.periodId)).find((b) => b.memberId === member)).toMatchObject({ credit: 0, arrears: 15_000 });
    expect((await f.repos.payments.listWithCredit(f.periodId, member)).every((p) => p.credit === 0 && p.reversed)).toBe(true);
    expect((await f.repos.ledger.getKasBalances()).actual).toBe(0);
  });

  it('works on a payment for a closed week', async () => {
    const f = await setup(3);
    const p = await f.repos.payments.record(pay(f, 0, 15_000));
    await closeWeeks(f, 1);
    await f.repos.payments.reverse(p.payment.id, 'salah');
    expect((await f.repos.payments.getWeekStatuses(f.periodId, f.ids[0] as string))[0]).toMatchObject({ paid: 0, outstanding: 15_000 });
  });

  it('requires a reason and corrects a payment only once', async () => {
    const f = await setup(3);
    const p = await f.repos.payments.record(pay(f, 0, 15_000));
    await expect(f.repos.payments.reverse(p.payment.id, '')).rejects.toThrow(DomainError);
    await expect(f.repos.payments.reverse(p.payment.id, '  ')).rejects.toThrow(/reason is required/);
    expect(await count(f.db, 'payment_reversals')).toBe(0);
    await f.repos.payments.reverse(p.payment.id, 'salah');
    await expect(f.repos.payments.reverse(p.payment.id, 'lagi')).rejects.toThrow(/already corrected/);
    await expect(f.repos.payments.reverse('ghost', 'x')).rejects.toThrow(/not found/);
    expect(await count(f.db, 'payment_reversals')).toBe(1);
    expect(await count(f.db, 'ledger_entries')).toBe(2);
    // The database also refuses a second row for the same payment, and edits to the table.
    await expect(f.db.run("INSERT INTO payment_reversals (payment_id, reversal_entry_id, reason, created_at) VALUES (?, 'x', 'y', 't')", [p.payment.id])).rejects.toThrow();
    await expect(f.db.run("UPDATE payment_reversals SET reason = 'z'")).rejects.toThrow(/append-only/);
    await expect(f.db.run('DELETE FROM payment_reversals')).rejects.toThrow(/append-only/);
  });

  it('is atomic: nothing stays when the last step fails', async () => {
    const f = await setup(3);
    const p = await f.repos.payments.record(pay(f, 0, 15_000));
    await f.db.exec("CREATE TRIGGER boom BEFORE INSERT ON payment_reversals BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(f.repos.payments.reverse(p.payment.id, 'salah')).rejects.toThrow(/boom/);
    expect(await count(f.db, 'ledger_entries')).toBe(1);
    expect((await f.repos.payments.getWeekStatuses(f.periodId, f.ids[0] as string))[0]?.paid).toBe(15_000);
  });

  it('links every new payment to its ledger entry (one to one)', async () => {
    const f = await setup(3);
    await f.repos.payments.record(pay(f, 0, 15_000));
    await f.repos.payments.record(pay(f, 0, 15_000));
    const rows = await f.db.getAll<{ ledger_entry_id: string | null }>('SELECT ledger_entry_id FROM payments ORDER BY rowid');
    expect(rows.every((r) => r.ledger_entry_id !== null)).toBe(true);
    expect(new Set(rows.map((r) => r.ledger_entry_id)).size).toBe(2);
    await expect(f.db.run("UPDATE payments SET ledger_entry_id = NULL WHERE ledger_entry_id IS NOT NULL")).rejects.toThrow(/cannot change/);
  });
});

describe('corrections of host payouts', () => {
  it('reverses payout and offset together, frees the host dues, and allows a new payout', async () => {
    const f = await setup(4);
    const host = f.ids[0] as string;
    await opening(f, 'tunai', 100_000);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04', 'tunai');
    expect((await f.repos.payments.getWeekStatuses(f.periodId, host))[0]).toMatchObject({ offset: 15_000, outstanding: 0 });
    expect((await f.repos.ledger.getKasBalances()).tunai).toBe(75_000);

    const reversals = await f.repos.ledger.reverseHostPayout(f.periodId, 1, 'pos salah');
    expect(reversals.map((r) => [r.type, r.direction, r.amount, r.account, r.week])).toEqual([
      ['reversal', 'in', 40_000, 'tunai', 1],
      ['reversal', 'out', 15_000, 'tunai', 1],
    ]);
    expect(reversals.every((r) => r.correctionReason === 'pos salah')).toBe(true);
    expect((await f.repos.ledger.getKasBalances()).tunai).toBe(100_000);
    expect(await f.repos.ledger.getWeekPayout(f.periodId, 1)).toBeNull();
    // The offset credit row is still there but ignored: the dues are unpaid again.
    expect(await count(f.db, 'offset_credits')).toBe(1);
    expect((await f.repos.payments.getWeekStatuses(f.periodId, host))[0]).toMatchObject({ offset: 0, outstanding: 15_000 });

    // New, correct payout on the other pos: the offset is computed again.
    const again = await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-05', 'debit');
    expect(again.entries.map((e) => [e.type, e.account])).toEqual([
      ['host_payout', 'debit'],
      ['host_offset', 'debit'],
    ]);
    expect(await count(f.db, 'offset_credits')).toBe(2);
    expect((await f.repos.payments.getWeekStatuses(f.periodId, host))[0]).toMatchObject({ offset: 15_000, outstanding: 0 });
    expect(await f.repos.ledger.getKasBalances()).toMatchObject({ tunai: 100_000, debit: -25_000 });
    const current = await f.repos.ledger.getWeekPayout(f.periodId, 1);
    expect(current?.payout.id).toBe(again.entries[0]?.id);
    expect(current?.offset?.id).toBe(again.entries[1]?.id);
  });

  it('corrects a payout without an offset (host had no debt) and a payout on a closed week', async () => {
    const f = await setup(4);
    await f.repos.payments.record(pay(f, 0, 30_000)); // weeks 1 and 2: after closing week 1 the current week is 2
    await closeWeeks(f, 1);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    const reversals = await f.repos.ledger.reverseHostPayout(f.periodId, 1, 'salah');
    expect(reversals).toHaveLength(1);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-06');
  });

  it('refuses a second correction, a correction without payout and a missing reason; changes nothing', async () => {
    const f = await setup(4);
    await expect(f.repos.ledger.reverseHostPayout(f.periodId, 1, 'x')).rejects.toThrow(/no host payout to correct/);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    await expect(f.repos.ledger.reverseHostPayout(f.periodId, 1, '')).rejects.toThrow(DomainError);
    expect(await count(f.db, 'ledger_entries')).toBe(2);
    await f.repos.ledger.reverseHostPayout(f.periodId, 1, 'salah');
    await expect(f.repos.ledger.reverseHostPayout(f.periodId, 1, 'lagi')).rejects.toThrow(/no host payout to correct/);
    expect(await count(f.db, 'ledger_entries')).toBe(4);
  });

  it('is atomic: if the second reversal fails the first is rolled back', async () => {
    const f = await setup(4);
    await f.repos.ledger.settleHost(f.periodId, 1, '2026-01-04');
    // Fail on the second reversal only (the offset), after the payout reversal was already inserted.
    await f.db.exec(
      "CREATE TRIGGER boom BEFORE INSERT ON ledger_entries WHEN NEW.type = 'reversal' AND NEW.direction = 'out' BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    await expect(f.repos.ledger.reverseHostPayout(f.periodId, 1, 'salah')).rejects.toThrow(/boom/);
    expect(await count(f.db, 'ledger_entries')).toBe(2);
    expect(await f.repos.ledger.getWeekPayout(f.periodId, 1)).not.toBeNull();
  });
});
