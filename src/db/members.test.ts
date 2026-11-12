// Step M repository tests: hard delete, archive (guards, idempotence, undo), new-period selection, reserved names,
// loans of archived members, the DB triggers and the health invariant. They run on sql.js, so the SQL is proven
// here but the expo-sqlite adapter only on the phone.
import { MemberArchiveError } from '@/domain/members';
import { archiveBlockText, toIndonesian } from '@/ui/errors';
import { healthCheck } from './backup';
import type { Db } from './db';
import { createRepositories, RepositoryError, type Repositories } from './index';
import { markHostsPaid } from './testing/hostPayouts';
import { createMigratedTestDb } from './testing/sqlJsDriver';

interface Fixture {
  db: Db;
  repos: Repositories;
  periodId: string;
  /** Members of the period (hosts of meetings 1..N in order). */
  ids: string[];
  /** A member that never joined anything. */
  unusedId: string;
}

async function setup(memberCount = 2): Promise<Fixture> {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => '2026-12-31T12:00:00.000Z' });
  const ids: string[] = [];
  for (let i = 0; i < memberCount; i += 1) ids.push((await repos.members.create(`Member ${i + 1}`)).id);
  const unusedId = (await repos.members.create('Unused')).id;
  const period = await repos.periods.create({ name: 'Periode 1', startDate: '2026-01-06', memberIds: ids });
  for (let i = 0; i < ids.length; i += 1) {
    await db.run('UPDATE weeks SET host_member_id = ? WHERE period_id = ? AND number = ?', [ids[i] as string, period.id, i + 1]);
  }
  return { db, repos, periodId: period.id, ids, unusedId };
}

async function finishPeriod(f: Fixture): Promise<void> {
  for (const w of await f.repos.weeks.listByPeriod(f.periodId)) {
    if (w.status === 'open') await f.repos.weeks.closeOldest(f.periodId);
  }
  await markHostsPaid(f.repos, f.periodId);
  await f.repos.periods.close(f.periodId, '2026-12-30');
}

const archiveCode = async (f: Fixture, id: string): Promise<string> => {
  try {
    await f.repos.members.archive(id);
    return 'ok';
  } catch (e) {
    if (e instanceof MemberArchiveError) return e.code;
    throw e;
  }
};

const archivedAt = async (f: Fixture, id: string) => (await f.repos.members.getById(id))?.archivedAt;
const lend = (f: Fixture, memberId: string, amount: number) =>
  f.repos.ledger.recordKas({ kind: 'loan', date: '2026-01-06', amount, account: 'tunai', memberId });

describe('hard delete', () => {
  it('deletes a member with no data at all', async () => {
    const f = await setup();
    await f.repos.members.remove(f.unusedId);
    expect(await f.repos.members.getById(f.unusedId)).toBeNull();
    expect((await f.repos.members.list()).map((m) => m.id)).toEqual(f.ids);
  });

  it('refuses a member that is in a period (history), even a closed one, and changes nothing', async () => {
    const f = await setup();
    await expect(f.repos.members.remove(f.ids[0] as string)).rejects.toThrow(RepositoryError);
    await finishPeriod(f);
    await expect(f.repos.members.remove(f.ids[0] as string)).rejects.toThrow(/has history/);
    expect(await f.repos.members.getById(f.ids[0] as string)).not.toBeNull();
    expect(toIndonesian(await f.repos.members.remove(f.ids[0] as string).catch((e: unknown) => e))).toMatch(/Arsipkan/);
  });

  it('reports usage per table', async () => {
    const f = await setup();
    expect(await f.repos.members.getUsage(f.unusedId)).toMatchObject({ periodMemberships: 0, hostedWeeks: 0, ledgerEntries: 0 });
    await f.repos.payments.record({ periodId: f.periodId, memberId: f.ids[0] as string, date: '2026-01-06', amount: 15_000, account: 'tunai' });
    expect(await f.repos.members.getUsage(f.ids[0] as string)).toMatchObject({
      periodMemberships: 1,
      hostedWeeks: 1,
      payments: 1,
      allocations: 1,
      ledgerEntries: 1,
    });
  });

  it('refuses an unknown member', async () => {
    const f = await setup();
    await expect(f.repos.members.remove('ghost')).rejects.toThrow(/not found/);
  });

  it('a raw DELETE of a member that has a period_members row fails on the foreign key', async () => {
    const f = await setup();
    await expect(f.db.run('DELETE FROM members WHERE id = ?', [f.ids[0] as string])).rejects.toThrow();
    expect(await f.repos.members.getById(f.ids[0] as string)).not.toBeNull();
  });
});

describe('archive', () => {
  it('is rejected while the member is in the active period, and archived_at stays NULL', async () => {
    const f = await setup();
    expect(await archiveCode(f, f.ids[0] as string)).toBe('in_active_period');
    expect(await archivedAt(f, f.ids[0] as string)).toBeNull();
    expect(await f.repos.members.archiveBlocker(f.ids[0] as string)).toEqual({ code: 'in_active_period', amount: 0 });
  });

  it('works after the period ends, keeps history and reports, hides from listActive but not from list', async () => {
    const f = await setup();
    await f.repos.payments.record({ periodId: f.periodId, memberId: f.ids[0] as string, date: '2026-01-06', amount: 15_000, account: 'tunai' });
    await finishPeriod(f);
    const before = await f.repos.reports.getPeriodReport(f.periodId);
    const a = f.ids[0] as string;

    expect(await f.repos.members.archiveBlocker(a)).toBeNull();
    await f.repos.members.archive(a);

    expect(await archivedAt(f, a)).toBe('2026-12-31T12:00:00.000Z');
    expect((await f.repos.members.list()).map((m) => m.id)).toContain(a); // not filtered: name lookups keep working
    expect((await f.repos.members.listActive()).map((m) => m.id)).not.toContain(a);
    expect(await f.repos.reports.getPeriodReport(f.periodId)).toEqual(before);
    expect((await f.repos.periods.getMembers(f.periodId)).map((m) => m.memberId)).toContain(a);
    expect((await healthCheck(f.db)).ok).toBe(true);
  });

  it('archiving twice is a no-op and keeps the first time; unarchive sets NULL', async () => {
    const f = await setup();
    await finishPeriod(f);
    const a = f.ids[0] as string;
    await f.repos.members.archive(a);
    await f.db.run("UPDATE members SET archived_at = '2026-06-01T00:00:00.000Z' WHERE id = ?", [a]);
    await f.repos.members.archive(a);
    expect(await archivedAt(f, a)).toBe('2026-06-01T00:00:00.000Z');
    await f.repos.members.unarchive(a);
    expect(await archivedAt(f, a)).toBeNull();
    await f.repos.members.unarchive(a); // not archived: still fine
    expect((await f.repos.members.listActive()).map((m) => m.id)).toContain(a);
  });

  it('can archive a member that never joined anything', async () => {
    const f = await setup();
    await f.repos.members.archive(f.unusedId);
    expect(await archivedAt(f, f.unusedId)).not.toBeNull();
  });

  it('is rejected for an unknown member', async () => {
    const f = await setup();
    await expect(f.repos.members.archive('ghost')).rejects.toThrow(/not found/);
    await expect(f.repos.members.unarchive('ghost')).rejects.toThrow(/not found/);
  });

  it('is rejected while a loan remains, allowed after full repayment', async () => {
    const f = await setup();
    const a = f.ids[0] as string;
    await lend(f, a, 100_000);
    await finishPeriod(f);
    expect(await archiveCode(f, a)).toBe('has_loan');
    expect(await f.repos.members.archiveBlocker(a)).toEqual({ code: 'has_loan', amount: 100_000 });
    expect(archiveBlockText('has_loan', 100_000)).toBe('Belum bisa diarsipkan: masih punya sisa pinjaman Rp100.000. Lunasi dulu di Pinjaman anggota.');
    await f.repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-12-30', amount: 40_000, memberId: a });
    expect(await f.repos.members.archiveBlocker(a)).toEqual({ code: 'has_loan', amount: 60_000 });
    await f.repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-12-30', amount: 60_000, memberId: a });
    expect(await archiveCode(f, a)).toBe('ok');
  });

  it('is rejected while credit is held (any amount), allowed after the refund', async () => {
    const f = await setup();
    const a = f.ids[0] as string;
    await f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 100_000, account: 'debit' });
    await f.repos.payments.record({ periodId: f.periodId, memberId: a, date: '2026-01-06', amount: 60_000, account: 'tunai' }); // 30.000 credit
    await finishPeriod(f);
    expect(await archiveCode(f, a)).toBe('has_credit');
    expect(await f.repos.members.archiveBlocker(a)).toEqual({ code: 'has_credit', amount: 30_000 });
    expect(archiveBlockText('has_credit', 30_000)).toBe('Belum bisa diarsipkan: masih punya titipan Rp30.000. Kembalikan dulu di Titipan anggota.');
    await f.repos.credits.refund(f.periodId, a, '2026-12-30', 'tunai');
    expect(await archiveCode(f, a)).toBe('ok');
  });

  it('checks in a fixed order: active period, then loan, then credit', async () => {
    const f = await setup();
    const a = f.ids[0] as string;
    await f.repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 100_000, account: 'debit' });
    await f.repos.payments.record({ periodId: f.periodId, memberId: a, date: '2026-01-06', amount: 60_000, account: 'tunai' });
    await lend(f, a, 50_000);
    expect(await archiveCode(f, a)).toBe('in_active_period');
    await finishPeriod(f);
    expect(await archiveCode(f, a)).toBe('has_loan'); // loan and credit: the loan is reported
    await f.repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-12-30', amount: 50_000, memberId: a });
    expect(await archiveCode(f, a)).toBe('has_credit');
  });

  it('an archived member may regain a loan by reversing a repayment, and stays visible in Pinjaman', async () => {
    const f = await setup();
    const a = f.ids[0] as string;
    await lend(f, a, 50_000);
    const repayment = await f.repos.ledger.recordKas({ kind: 'loan_repayment', date: '2026-01-06', amount: 50_000, memberId: a });
    await finishPeriod(f);
    await f.repos.members.archive(a);

    await f.repos.ledger.reverseEntry(repayment.id, 'salah catat');

    expect(await archivedAt(f, a)).not.toBeNull();
    expect((await f.repos.ledger.getLoanBalance(a)).remaining).toBe(50_000);
    expect((await f.repos.ledger.listLoanBalances()).members.find((m) => m.memberId === a)?.remaining).toBe(50_000);
    expect((await healthCheck(f.db)).ok).toBe(true);
  });
});

describe('names and new periods', () => {
  it('keeps an archived name reserved for create and rename', async () => {
    const f = await setup();
    await f.repos.members.archive(f.unusedId);
    await expect(f.repos.members.create('unused')).rejects.toThrow(/already exists/);
    await expect(f.repos.members.rename(f.ids[0] as string, 'Unused')).rejects.toThrow(/already exists/);
  });

  it('rejects an archived member in periods.create and leaves no rows behind', async () => {
    const f = await setup();
    await finishPeriod(f);
    const a = f.ids[0] as string;
    await f.repos.members.archive(a);
    const count = async (t: string) => (await f.db.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))?.n ?? -1;
    const before = { periods: await count('periods'), pm: await count('period_members'), weeks: await count('weeks') };
    await expect(f.repos.periods.create({ name: 'P2', startDate: '2027-01-05', memberIds: [a, f.ids[1] as string] })).rejects.toThrow(/archived/);
    expect({ periods: await count('periods'), pm: await count('period_members'), weeks: await count('weeks') }).toEqual(before);
    await f.repos.members.unarchive(a);
    await expect(f.repos.periods.create({ name: 'P2', startDate: '2027-01-05', memberIds: [a, f.ids[1] as string] })).resolves.toBeDefined();
  });
});

describe('database triggers and health check', () => {
  it('members_archive_not_in_active_period stops a raw archive of an active-period member', async () => {
    const f = await setup();
    await expect(f.db.run("UPDATE members SET archived_at = 'x' WHERE id = ?", [f.ids[0] as string])).rejects.toThrow(/active period/);
    await expect(f.db.run("UPDATE members SET archived_at = 'x' WHERE id = ?", [f.unusedId])).resolves.toBeDefined(); // not in a period
  });

  it('period_members_no_archived stops a raw insert of an archived member', async () => {
    const f = await setup();
    await finishPeriod(f);
    await f.repos.members.archive(f.ids[0] as string);
    await f.db.run("INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('px', 'X', 1, 'closed', '2027-01-05', 't')");
    await expect(f.db.run("INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('px', ?, 1)", [f.ids[0] as string])).rejects.toThrow(
      /archived member/,
    );
  });

  it('the CHECK refuses an empty archived_at', async () => {
    const f = await setup();
    await expect(f.db.run("UPDATE members SET archived_at = '  ' WHERE id = ?", [f.unusedId])).rejects.toThrow();
  });

  it('healthCheck reports an archived member in the active period', async () => {
    const f = await setup();
    expect((await healthCheck(f.db)).ok).toBe(true);
    await f.db.exec('DROP TRIGGER members_archive_not_in_active_period');
    await f.db.run("UPDATE members SET archived_at = 'x' WHERE id = ?", [f.ids[0] as string]);
    const report = await healthCheck(f.db);
    expect(report.ok).toBe(false);
    expect(report.problems.map((p) => p.detail)).toContain('archived_member_in_active_period: 1 violation(s)');
  });
});
