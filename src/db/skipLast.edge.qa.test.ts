// INDEPENDENT QA, deterministic edge cases for "skip the last meeting" (decision 33).
// Part 1 (describe "edge cases"): rules from CLAUDE.md / PROJECT.md decision 33, each proven through the real repositories.
// Part 2 (describe "KNOWN FINDINGS"): tests that encode the rule and currently FAIL because of a bug; they must not be
// edited to pass, the developer fixes the code.
import { WeekSkipError } from '@/domain/week-skip';
import { homeReminders } from '@/ui/reminders';
import { paidMeetingRows } from '@/ui/entryDetail';
import { skipCard } from '@/ui/skipMeeting';
import { quickActionReasons } from '@/ui/quickActions';
import { prepareRestore, commitRestore, discardRestore, healthCheck } from './backup';
import { SkipUndoBlockedError } from './errors';
import { createRepositories, type Repositories } from './index';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { createSqlJsEnv, FakeSafetyStore, type SqlJsEnv } from './testing/sqlJsBridge';
import { V5_FIXTURE_SQL } from './testing/v5Fixture';

const TODAY = '2026-03-10';
const NOW = () => new Date(2026, 10, 6, 10, 0, 0);

interface World {
  env: SqlJsEnv;
  repos: Repositories;
  ids: string[];
  periodId: string;
}

async function world(n: number, prefix = 'w'): Promise<World> {
  const env = await createSqlJsEnv();
  let c = 0;
  const repos = createRepositories(env.db, { newId: () => `${prefix}${(c += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) ids.push((await repos.members.create(`M${i + 1}`)).id);
  const period = await repos.periods.create({ name: 'P1', startDate: '2026-01-06', memberIds: ids });
  await repos.ledger.recordKas({ kind: 'opening_balance', date: '2026-01-01', amount: 500_000, account: 'tunai' });
  return { env, repos, ids, periodId: period.id };
}

/** Host k = member k, closed and paid, for meetings 1..upto. */
async function holdMeetings(w: World, upto: number): Promise<void> {
  for (let k = 1; k <= upto; k += 1) {
    const week = await w.repos.weeks.get(w.periodId, k);
    await w.repos.weeks.assignHost(w.periodId, k, w.ids[k - 1] as string, week?.date as string);
    await w.repos.weeks.closeOldest(w.periodId);
    await w.repos.ledger.settleHost(w.periodId, k, TODAY, 'tunai');
  }
}
const pay = (w: World, memberIdx: number, amount: number) =>
  w.repos.payments.record({ periodId: w.periodId, memberId: w.ids[memberIdx] as string, date: '2026-01-06', amount, account: 'tunai' });

describe('skip the last meeting: edge cases', () => {
  it('N=1 is refused (code too_few_members), the preview says why, and the UI card is not shown', async () => {
    const w = await world(1);
    const preview = await w.repos.weeks.previewSkip(w.periodId);
    expect(preview.eligible).toBe(false);
    expect(preview.blocker?.code).toBe('too_few_members');
    expect(skipCard(preview)).toBeNull();
    await expect(w.repos.weeks.skipLast(w.periodId, 'x')).rejects.toMatchObject({ code: 'too_few_members' });
    expect(await w.env.db.getFirst('SELECT COUNT(*) AS n FROM week_skips')).toEqual({ n: 0 });
    // the migration trigger does not know the N>=2 rule: documented, the repository is the guard
    await expect(w.env.db.run("INSERT INTO week_skips (id, period_id, week, reason, created_at) VALUES ('x', ?, 1, 'x', 'x')", [w.periodId])).resolves.toMatchObject({ changes: 1 });
  });

  it('N=2: meeting 1 held, meeting 2 skipped, period closes with only meeting 1 dues written off; kas never moves', async () => {
    const w = await world(2);
    await holdMeetings(w, 1);
    const kas = await w.repos.ledger.getKasBalances();
    const ledgerBefore = (await w.env.db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries'))?.n;
    const rec = await w.repos.weeks.skipLast(w.periodId, 'tuan rumah sakit');
    expect(rec).toMatchObject({ week: 2, reason: 'tuan rumah sakit', undoReason: null });
    expect(await w.repos.ledger.getKasBalances()).toEqual(kas);
    expect((await w.env.db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entries'))?.n).toBe(ledgerBefore);
    const preview = await w.repos.periods.previewClose(w.periodId);
    expect(preview.canClose).toBe(true);
    // nobody paid meeting 1: M1 is the host of meeting 1 and was paid with an offset; M2 owes 15.000 for meeting 1 only
    await w.repos.periods.close(w.periodId, TODAY);
    const off = await w.env.db.getAll<{ member_id: string; amount: number }>("SELECT member_id, amount FROM ledger_entries WHERE type = 'debt_writeoff'");
    expect(off).toEqual([{ member_id: w.ids[1], amount: 15_000 }]);
    expect(await healthCheck(w.env.db)).toEqual({ ok: true, problems: [] });
  });

  it('skip, then pay, then undo: money paid during the skip stays titipan; after the undo the meeting is owed again and the close settles it from credit', async () => {
    const w = await world(3);
    const m1 = w.ids[0] as string;
    await pay(w, 0, 30_000); // M1 pays meetings 1-2 (and is not the host of meeting 3)
    await holdMeetings(w, 2);
    await w.repos.weeks.skipLast(w.periodId, 'x');
    const during = await pay(w, 0, 15_000); // nothing owed any more: all of it is credit
    expect(during.credit).toBe(15_000);
    expect(await w.env.db.getAll('SELECT * FROM allocations WHERE payment_id = ?', [during.payment.id])).toEqual([]);
    expect(await w.repos.credits.getAvailable(w.periodId, m1)).toBe(15_000);
    await w.repos.weeks.undoSkip(w.periodId, 'tuan rumah ternyata bisa');
    const status = (await w.repos.payments.getWeekStatuses(w.periodId, m1))[2];
    expect(status).toMatchObject({ week: 3, due: 15_000, paid: 0, outstanding: 15_000 });
    expect(await w.repos.credits.getAvailable(w.periodId, m1)).toBe(15_000); // as the undo dialog says: still titipan
    // meeting 3 held normally; the close settles M1's arrears from his credit and writes nothing off for him
    await w.repos.weeks.closeOldest(w.periodId);
    await w.repos.ledger.settleHost(w.periodId, 3, TODAY, 'tunai');
    await w.repos.periods.close(w.periodId, TODAY);
    const off = await w.env.db.getAll<{ member_id: string }>("SELECT member_id FROM ledger_entries WHERE type = 'debt_writeoff'");
    expect(off.map((o) => o.member_id)).not.toContain(m1);
    expect(await w.repos.credits.getAvailable(w.periodId, m1)).toBe(0);
    expect((await w.repos.weeks.listSkipHistory(w.periodId)).map((h) => [h.reason, h.undoReason])).toEqual([['x', 'tuan rumah ternyata bisa']]);
  });

  it('payout of the last meeting stands: skip refused (payout_stands); corrected payout: skip allowed, then no payout can be made', async () => {
    const w = await world(3);
    await holdMeetings(w, 2);
    await w.repos.weeks.assignHost(w.periodId, 3, w.ids[2] as string, (await w.repos.weeks.get(w.periodId, 3))?.date as string);
    await w.repos.ledger.settleHost(w.periodId, 3, TODAY, 'tunai'); // allowed while it is the current meeting
    const blocked = await w.repos.weeks.previewSkip(w.periodId);
    expect(blocked.blocker).toMatchObject({ code: 'payout_stands', weeks: [3] });
    await expect(w.repos.weeks.skipLast(w.periodId, 'x')).rejects.toMatchObject({ code: 'payout_stands' });
    await w.repos.ledger.reverseHostPayout(w.periodId, 3, 'koreksi');
    await w.repos.weeks.skipLast(w.periodId, 'x');
    await expect(w.repos.ledger.settleHost(w.periodId, 3, TODAY, 'tunai')).rejects.toThrow(/skipped/);
    expect(await healthCheck(w.env.db)).toEqual({ ok: true, problems: [] });
  });

  it('host of the meeting before the last has a corrected payout: skip refused (host_unpaid, weeks [2]) until paid again', async () => {
    const w = await world(3);
    await holdMeetings(w, 2);
    await w.repos.ledger.reverseHostPayout(w.periodId, 2, 'salah jumlah');
    expect((await w.repos.weeks.previewSkip(w.periodId)).blocker).toMatchObject({ code: 'host_unpaid', weeks: [2] });
    await expect(w.repos.weeks.skipLast(w.periodId, 'x')).rejects.toBeInstanceOf(WeekSkipError);
    await w.repos.ledger.settleHost(w.periodId, 2, TODAY, 'debit');
    await expect(w.repos.weeks.skipLast(w.periodId, 'x')).resolves.toMatchObject({ week: 3 });
  });

  it('a host payout of an earlier meeting corrected AFTER the skip and paid again never offsets the skipped meeting', async () => {
    const w = await world(3);
    await holdMeetings(w, 2);
    await w.repos.weeks.skipLast(w.periodId, 'x');
    await w.repos.ledger.reverseHostPayout(w.periodId, 2, 'koreksi');
    expect((await w.repos.periods.previewClose(w.periodId)).canClose).toBe(false); // an unpaid host blocks the close
    await w.repos.ledger.settleHost(w.periodId, 2, TODAY, 'tunai');
    expect(await w.env.db.getAll('SELECT * FROM offset_credits WHERE week = 3')).toEqual([]);
    await w.repos.periods.close(w.periodId, TODAY);
    expect(await healthCheck(w.env.db)).toEqual({ ok: true, problems: [] });
  });

  it('a host offset that falls on the skipped meeting becomes titipan, can be a non-multiple of 15.000, and carries into the next period as a part of a week', async () => {
    const w = await world(4);
    await pay(w, 2, 15_000); // M3 pays meeting 1 only, then hosts meeting 3
    await holdMeetings(w, 3); // paying host 3 happens while meeting 4 is current: offset covers meetings 2, 3 and 10.000 of 4
    expect(await w.env.db.getAll('SELECT week, amount FROM offset_credits WHERE member_id = ? ORDER BY week', [w.ids[2] as string])).toEqual([
      { week: 2, amount: 15_000 },
      { week: 3, amount: 15_000 },
      { week: 4, amount: 10_000 },
    ]);
    const kas = await w.repos.ledger.getKasBalances();
    await w.repos.weeks.skipLast(w.periodId, 'x');
    expect(await w.repos.ledger.getKasBalances()).toEqual(kas);
    expect(await w.repos.credits.getAvailable(w.periodId, w.ids[2] as string)).toBe(10_000);
    const report = await w.repos.reports.getKasReport();
    expect(report.expected.creditHeld).toBeGreaterThanOrEqual(10_000);
    await w.repos.periods.close(w.periodId, TODAY);
    const p2 = await w.repos.periods.create({ name: 'P2', startDate: '2026-02-17', memberIds: w.ids });
    const st = await w.repos.payments.getWeekStatuses(p2.id, w.ids[2] as string);
    expect(st[0]).toMatchObject({ week: 1, credited: 10_000, outstanding: 5_000 });
    expect(await w.repos.credits.getAvailable(w.periodId, w.ids[2] as string)).toBe(0);
    expect(await healthCheck(w.env.db)).toEqual({ ok: true, problems: [] });
  });

  it('carry-over credit applied to the skipped meeting is released back to its source period, counted once, and carried on; undo takes it back', async () => {
    const w = await world(3);
    await pay(w, 0, 90_000); // M1: 45.000 of dues + 45.000 credit
    await holdMeetings(w, 3);
    await w.repos.periods.close(w.periodId, '2026-02-10');
    const p2 = await w.repos.periods.create({ name: 'P2', startDate: '2026-02-17', memberIds: w.ids });
    const m1 = w.ids[0] as string;
    expect((await w.repos.payments.getWeekStatuses(p2.id, m1)).map((s) => s.credited)).toEqual([15_000, 15_000, 15_000]);
    for (let k = 1; k <= 2; k += 1) {
      const week = await w.repos.weeks.get(p2.id, k);
      await w.repos.weeks.assignHost(p2.id, k, w.ids[k - 1] as string, week?.date as string);
      await w.repos.weeks.closeOldest(p2.id);
      await w.repos.ledger.settleHost(p2.id, k, TODAY, 'tunai');
    }
    const heldBefore = (await w.repos.reports.getKasReport()).expected.creditHeld;
    await w.repos.weeks.skipLast(p2.id, 'x');
    expect(await w.repos.credits.getAvailable(w.periodId, m1)).toBe(15_000); // released from P2 meeting 3
    const report = await w.repos.reports.getKasReport();
    // week 3 carried 15.000 as "carried open" before; after the skip the same 15.000 is "available": the line does not move
    expect(report.expected.creditHeld).toBe(heldBefore);
    // undo works while the released credit is untouched
    await w.repos.weeks.undoSkip(p2.id, 'batal');
    expect(await w.repos.credits.getAvailable(w.periodId, m1)).toBe(0);
    await w.repos.weeks.skipLast(p2.id, 'lagi');
    await w.repos.periods.close(p2.id, TODAY); // the released credit does not settle anything and stays in P1's pool
    expect(await w.repos.credits.getAvailable(w.periodId, m1)).toBe(15_000);
    const p3 = await w.repos.periods.create({ name: 'P3', startDate: '2026-03-17', memberIds: w.ids });
    expect((await w.repos.payments.getWeekStatuses(p3.id, m1))[0]).toMatchObject({ credited: 15_000, outstanding: 0 });
    expect(await healthCheck(w.env.db)).toEqual({ ok: true, problems: [] });
  });

  it('undo is refused (SkipUndoBlockedError) and writes nothing when the released carry-over credit was refunded meanwhile', async () => {
    const w = await world(3);
    await pay(w, 0, 90_000);
    await holdMeetings(w, 3);
    await w.repos.periods.close(w.periodId, '2026-02-10');
    const p2 = await w.repos.periods.create({ name: 'P2', startDate: '2026-02-17', memberIds: w.ids });
    for (let k = 1; k <= 2; k += 1) {
      const week = await w.repos.weeks.get(p2.id, k);
      await w.repos.weeks.assignHost(p2.id, k, w.ids[k - 1] as string, week?.date as string);
      await w.repos.weeks.closeOldest(p2.id);
      await w.repos.ledger.settleHost(p2.id, k, TODAY, 'tunai');
    }
    await w.repos.weeks.skipLast(p2.id, 'x');
    await w.repos.credits.refund(w.periodId, w.ids[0] as string, TODAY, 'tunai');
    const dump = JSON.stringify(await w.env.db.getAll('SELECT * FROM week_skip_undos'));
    await expect(w.repos.weeks.undoSkip(p2.id, 'terlambat')).rejects.toBeInstanceOf(SkipUndoBlockedError);
    expect(JSON.stringify(await w.env.db.getAll('SELECT * FROM week_skip_undos'))).toBe(dump);
    expect((await w.repos.weeks.get(p2.id, 3))?.skipped).toBe(true);
    expect(await healthCheck(w.env.db)).toEqual({ ok: true, problems: [] });
  });

  it('the host stored on the skipped meeting may be missing; the skipped turn is still the one member who never hosted', async () => {
    const w = await world(3);
    await holdMeetings(w, 2);
    await w.env.db.run('UPDATE weeks SET host_member_id = NULL WHERE period_id = ? AND number = 3', [w.periodId]);
    await w.repos.weeks.skipLast(w.periodId, 'x');
    await w.repos.periods.close(w.periodId, TODAY);
    expect(await w.repos.weeks.skippedTurn()).toMatchObject({ memberId: w.ids[2], week: 3 });
  });

  it('a backup taken before the skip restores into a healthy phone where the skip works; one taken after it keeps the skip', async () => {
    const w = await world(3);
    await holdMeetings(w, 2);
    const before = w.env.liveBytes();
    await w.repos.weeks.skipLast(w.periodId, 'x');
    const after = w.env.liveBytes();
    for (const [bytes, skippedExpected] of [[before, false], [after, true]] as const) {
      const phone = await createSqlJsEnv();
      const prepared = await prepareRestore(phone.bridge, phone.db, { kind: 'file', bytes });
      expect((await commitRestore(phone.bridge, phone.db, prepared, new FakeSafetyStore(), NOW)).outcome).toBe('restored');
      const repos = createRepositories(phone.db);
      expect((await repos.weeks.get(w.periodId, 3))?.skipped).toBe(skippedExpected);
      if (!skippedExpected) await repos.weeks.skipLast(w.periodId, 'again');
      expect(await healthCheck(phone.db)).toEqual({ ok: true, problems: [] });
    }
    // restoring the OLD file over the live phone is announced as older (the skip would be lost)
    const prepared = await prepareRestore(w.env.bridge, w.env.db, { kind: 'file', bytes: before });
    expect(prepared.classification.kind).toBe('older');
    await discardRestore(prepared);
  });

  it('a real version 5 backup (before migration 0006) restores, and the whole skip flow then works on that data', async () => {
    const old = await createSqlJsEnv({ migrated: false });
    await migrate(old.db, MIGRATIONS.slice(0, 5));
    await old.db.exec(V5_FIXTURE_SQL);
    const phone = await createSqlJsEnv();
    const prepared = await prepareRestore(phone.bridge, phone.db, { kind: 'file', bytes: old.liveBytes() });
    expect(prepared.originalVersion).toBe(5);
    expect((await commitRestore(phone.bridge, phone.db, prepared, new FakeSafetyStore(), NOW)).outcome).toBe('restored');
    const repos = createRepositories(phone.db, { newId: (() => { let c = 0; return () => `r${(c += 1)}`; })(), now: () => `${TODAY}T12:00:00.000Z` });
    // p2: meeting 1 closed and paid; meeting 2 (host m2, M2 paid it) and 3 (host m3) open. Hold meeting 2, then skip 3.
    await repos.weeks.closeOldest('p2');
    await repos.ledger.settleHost('p2', 2, TODAY, 'tunai');
    const kas = await repos.ledger.getKasBalances();
    await repos.weeks.skipLast('p2', 'x');
    await repos.periods.close('p2', TODAY);
    expect(await repos.ledger.getKasBalances()).toEqual(kas);
    expect(await healthCheck(phone.db)).toEqual({ ok: true, problems: [] });
  });
});

describe('skip the last meeting: UI mechanics from the repository output', () => {
  it('reminders: a skipped meeting never asks to be paid or closed, and the period is ready to end', () => {
    const rows = homeReminders({
      today: '2026-03-10',
      hasActivePeriod: true,
      weeks: [
        { number: 1, status: 'closed', date: '2026-02-24', hostMemberId: 'a' },
        { number: 2, status: 'closed', date: '2026-03-03', hostMemberId: 'b' },
        { number: 3, status: 'skipped', date: '2026-03-10', hostMemberId: 'c' },
      ],
      lastMeetingNumber: 3,
      paidPayoutWeeks: new Set([1, 2]),
      currentHostName: null,
      membersInArrears: 0,
      backup: { due: false } as never,
    });
    expect(rows.map((r) => r.kind).filter((k) => k !== 'backup')).toEqual(['close_period']);
    expect(rows[0]?.title).toBe('Semua pertemuan sudah ditutup atau dilewati');
  });

  it('quick actions mention skipped meetings when no meeting is open', () => {
    const reasons = quickActionReasons({ hasActivePeriod: true, hasAnyPeriod: true, currentWeek: null, anySkipped: true });
    expect(JSON.stringify(reasons)).toContain('dilewati');
  });
});

describe('KNOWN FINDINGS (these fail until the developer fixes the code)', () => {
  it('F1: the payment detail (kas/[entryId].tsx) must not list a skipped meeting under "Pertemuan yang dibayar" (its amount is shown as Menjadi titipan)', async () => {
    const w = await world(3);
    await pay(w, 1, 90_000); // M2 prepays 6 weeks: 45.000 on meetings 1-3, 45.000 credit
    await holdMeetings(w, 2);
    await w.repos.weeks.skipLast(w.periodId, 'x');
    const entry = (await w.repos.ledger.listByMember(w.periodId, w.ids[1] as string)).find((e) => e.type === 'member_payment');
    const detail = await w.repos.payments.getByLedgerEntry(entry?.id as string);
    // the repository tells the truth: the allocation on meeting 3 is flagged and the credit includes it
    expect(detail?.allocations.find((a) => a.week === 3)?.skipped).toBe(true);
    expect(detail?.credit).toBe(90_000 - 30_000);
    // the screen builds its rows with paidMeetingRows(paid.allocations): meeting 3 must not appear there
    expect(paidMeetingRows(detail?.allocations ?? []).map((r) => r.week)).toEqual([1, 2]);
  });
});
