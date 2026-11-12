// QA run before M7b (2026-11-12). Independent scenarios checked against CLAUDE.md, with numbers worked out by hand.
// Runs on sql.js, not on the phone. A test marked it.failing documents a known bug: it must become a plain `it`
// when the developer fixes it (and the assertion stays as written).
import { PHRASE_RESTORE, requiredPhrase } from '@/domain/backup';
import { commitRestore, discardRestore, prepareRestore } from './backup';
import { createRepositories, type Repositories } from './index';
import { createSqlJsEnv, FakeSafetyStore } from './testing/sqlJsBridge';
import { createMigratedTestDb } from './testing/sqlJsDriver';

const TODAY = '2026-03-10';
const START = '2026-02-03';

async function setup() {
  const db = await createMigratedTestDb();
  let n = 0;
  const repos = createRepositories(db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
  return { db, repos };
}

/** Two-member period (A hosts 1, B hosts 2), run to the end. N=2: due 30.000 per member, payout 20.000 per meeting. */
async function runTwoMemberPeriod(repos: Repositories, a: string, b: string, aPays: number, bPays: number) {
  const p = await repos.periods.create({ name: 'P1', startDate: START, memberIds: [a, b] });
  await repos.weeks.assignHost(p.id, 1, a, START);
  await repos.weeks.assignHost(p.id, 2, b, '2026-02-10');
  if (aPays) await repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: aPays, account: 'tunai' });
  if (bPays) await repos.payments.record({ periodId: p.id, memberId: b, date: TODAY, amount: bPays, account: 'tunai' });
  await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
  await repos.weeks.closeOldest(p.id);
  await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai');
  await repos.weeks.closeOldest(p.id);
  await repos.periods.close(p.id, TODAY);
  return p;
}

describe('Titipan lifecycle (hand-calculated)', () => {
  it('credit 15.000 is held after close, blocks archiving, and is refunded once when the member skips the next period', async () => {
    const { repos } = await setup();
    const [a, b, c] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id, (await repos.members.create('Citra')).id];
    // A pays 45.000 (dues 30.000 + credit 15.000), B pays 30.000. Kas: 45+30-20-20 = 35.000.
    const p1 = await runTwoMemberPeriod(repos, a, b, 45_000, 30_000);
    expect((await repos.reports.getKasReport()).balances).toMatchObject({ tunai: 35_000, actual: 35_000 });
    // Real kas gained is 5.000 x N x 2 meetings = 20.000: expected = 35.000 + 0 - 15.000.
    expect((await repos.reports.getKasReport()).expected).toMatchObject({ creditHeld: 15_000, expected: 20_000 });
    expect(await repos.credits.getAvailable(p1.id, a)).toBe(15_000);
    await expect(repos.members.archive(a)).rejects.toMatchObject({ code: 'has_credit', amount: 15_000 });

    // New period without A: the credit stays refundable, nothing carried.
    await repos.periods.create({ name: 'P2', startDate: '2026-03-17', memberIds: [b, c] });
    expect((await repos.periods.previewCarryOver([b, c])).every((m) => m.plan.applied === 0)).toBe(true);
    // Refund needs the source period closed; the amount is the WHOLE credit and is not typed by the owner.
    const refund = await repos.credits.refund(p1.id, a, TODAY, 'tunai');
    expect(refund).toMatchObject({ type: 'credit_refund', direction: 'out', amount: 15_000, memberId: a, account: 'tunai' });
    expect((await repos.reports.getKasReport()).balances.tunai).toBe(20_000);
    expect(await repos.credits.getAvailable(p1.id, a)).toBe(0);
    await expect(repos.credits.refund(p1.id, a, TODAY, 'tunai')).rejects.toThrow(); // no second refund
    // The refund is not correctable and the member may now be archived (history stays).
    await expect(repos.ledger.reverseEntry(refund.id, 'oops')).rejects.toThrow();
    await repos.members.archive(a);
    expect((await repos.members.listActive()).map((m) => m.id)).not.toContain(a);
  });

  it('credit carried into the next period is used once: it settles week 1 and can no longer be refunded', async () => {
    const { repos } = await setup();
    const [a, b] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id];
    const p1 = await runTwoMemberPeriod(repos, a, b, 45_000, 30_000);
    const p2 = await repos.periods.create({ name: 'P2', startDate: '2026-03-17', memberIds: [a, b] });
    const statuses = await repos.payments.getWeekStatuses(p2.id, a);
    expect(statuses.map((s) => s.outstanding)).toEqual([0, 15_000]); // 15.000 of credit paid week 1, week 2 is still owed
    expect(await repos.credits.getAvailable(p1.id, a)).toBe(0);
    expect(await repos.credits.listRefundable()).toEqual([]);
    // Still a liability until meeting 1 of P2 is closed.
    expect((await repos.reports.getKasReport()).expected.creditHeld).toBe(15_000);
  });

  it('carry-over is not a payment: no ledger entry, kas unchanged', async () => {
    const { repos } = await setup();
    const [a, b] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id];
    await runTwoMemberPeriod(repos, a, b, 45_000, 30_000);
    const before = await repos.ledger.listKas();
    await repos.periods.create({ name: 'P2', startDate: '2026-03-17', memberIds: [a, b] });
    expect(await repos.ledger.listKas()).toEqual(before);
  });
});

describe('Pinjaman across a period close (hand-calculated)', () => {
  it('repayment and corrections with no active period follow the remaining-loan rules; Piutang = sum of remaining', async () => {
    const { repos } = await setup();
    const [a, b] = [(await repos.members.create('Ani')).id, (await repos.members.create('Budi')).id];
    const p = await repos.periods.create({ name: 'P1', startDate: START, memberIds: [a, b] });
    await repos.weeks.assignHost(p.id, 1, a, START);
    await repos.weeks.assignHost(p.id, 2, b, '2026-02-10');
    await repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: 30_000, account: 'tunai' });
    await repos.payments.record({ periodId: p.id, memberId: b, date: TODAY, amount: 30_000, account: 'tunai' });
    const loan = await repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 40_000, account: 'tunai', memberId: a });
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    await repos.weeks.closeOldest(p.id);
    await repos.ledger.settleHost(p.id, 2, TODAY, 'tunai');
    await repos.weeks.closeOldest(p.id);
    await repos.periods.close(p.id, TODAY);

    // No active period: a repayment goes to the latest period containing the member; a new loan is rejected.
    await expect(repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 1_000, account: 'tunai', memberId: b })).rejects.toThrow();
    const rep = await repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 15_000, memberId: a });
    expect(rep.periodId).toBe(p.id);
    expect((await repos.ledger.getLoanBalance(a)).remaining).toBe(25_000);
    await expect(repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 25_001, memberId: a })).rejects.toThrow();
    await expect(repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 1, memberId: b })).rejects.toThrow(); // B owes nothing
    // The loan cannot be corrected while the repayment makes the remaining go below zero.
    await expect(repos.ledger.reverseEntry(loan.id, 'salah')).rejects.toMatchObject({ code: 'reversal_below_zero' });
    // Piutang balance = sum of remaining (no unnamed opening).
    const overview = await repos.ledger.listLoanBalances();
    expect(overview.members.reduce((t, m) => t + m.remaining, 0) + overview.unnamedOpening).toBe((await repos.ledger.getKasBalances()).piutang);
    // A member with a remaining loan cannot be archived; after repaying everything it can.
    await expect(repos.members.archive(a)).rejects.toMatchObject({ code: 'has_loan', amount: 25_000 });
    await repos.ledger.recordKas({ kind: 'loan_repayment', date: TODAY, amount: 25_000, memberId: a });
    await repos.members.archive(a);
    expect((await repos.ledger.getLoanBalance(a)).remaining).toBe(0);
    // Archived member: a new loan is refused (not in an active period; no period is active anyway).
    await expect(repos.ledger.recordKas({ kind: 'loan', date: TODAY, amount: 5_000, account: 'tunai', memberId: a })).rejects.toThrow();
  });
});

describe('Restore classification blind spot (F3)', () => {
  // Backup taken after the payout of meeting 1; afterwards the owner closes the meeting, picks the next hosts and ends
  // the period. None of that writes a ledger entry or a payment, so the id-based classification sees "same".
  async function liveWithStateAfterBackup() {
    const live = await createSqlJsEnv();
    let n = 0;
    const repos = createRepositories(live.db, { newId: () => `id${(n += 1)}`, now: () => `${TODAY}T12:00:00.000Z` });
    const a = (await repos.members.create('Ani')).id;
    const p = await repos.periods.create({ name: 'Solo', startDate: START, memberIds: [a] }); // N=1: host assigned automatically
    await repos.payments.record({ periodId: p.id, memberId: a, date: TODAY, amount: 15_000, account: 'tunai' });
    await repos.ledger.settleHost(p.id, 1, TODAY, 'tunai');
    const backup = live.liveBytes();
    return { live, repos, p, backup };
  }

  it('control: a backup taken right now is "same" (nothing is lost)', async () => {
    const { live, backup } = await liveWithStateAfterBackup();
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: backup });
    expect(prepared.classification).toMatchObject({ kind: 'same', lost: 0, added: 0 });
    await commitRestore(live.bridge, live.db, prepared, new FakeSafetyStore(), () => new Date(2026, 2, 10, 10, 0, 0)); // release the memory copy
  });

  it.failing('restoring an older backup that lacks a closed meeting and an ended period must require typing PULIHKAN', async () => {
    const { live, repos, p, backup } = await liveWithStateAfterBackup();
    await repos.weeks.closeOldest(p.id); // state change without a ledger entry
    await repos.periods.close(p.id, TODAY); // state change without a ledger entry (no debt, no credit)
    const prepared = await prepareRestore(live.bridge, live.db, { kind: 'file', bytes: backup });
    try {
      // The live database has more state than the file (week closed, period ended): the owner must be warned strongly.
      expect(requiredPhrase('file', prepared.classification)).toBe(PHRASE_RESTORE);
    } finally {
      await discardRestore(prepared);
    }
  });
});
