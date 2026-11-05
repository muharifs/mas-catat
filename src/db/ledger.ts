// Ledger repository: append-only cash in/out entries. There is no update or delete here, and the
// database itself rejects both (triggers in migration 0001). A correction is a NEW reversal entry that points at
// the original (reverses_entry_id); the original row is never touched.
import { unpaidWeeksThrough } from '@/domain/dues';
import {
  assertEntryDate,
  computeKasBalances,
  previewKasEntry,
  type KasBalances,
  type KasEntryInput,
  type KasEntryPreview,
} from '@/domain/kas';
import { assertIsoDate } from '@/domain/money';
import { previewHostPayout, type PayoutPreview } from '@/domain/payout';
import { buildReversal, DIRECTLY_REVERSIBLE_TYPES, requireReason } from '@/domain/reversal';
import type { Account, LedgerEntry, LedgerEntryType } from '@/domain/types';
import type { Db, Queryable } from './db';
import { defaultDeps, todayOf, type RepoDeps } from './deps';
import { RepositoryError } from './errors';
import { loadWeekStatuses } from './weeks';

/** Types the app knows today. No SQL CHECK on type on purpose (see migration 0001); this list is the guard. */
const KNOWN_TYPES: readonly LedgerEntryType[] = [
  'member_payment',
  'host_payout',
  'host_offset',
  'opening_balance',
  'transfer',
  'loan',
  'loan_repayment',
  'shared_goal',
  'reversal',
];

export interface StoredLedgerEntry extends LedgerEntry {
  id: string;
  periodId: string;
  createdAt: string;
  /** Set on a reversal entry: the entry it cancels. */
  reversesEntryId: string | null;
  correctionReason: string | null;
  /** Kas pos; null for entries written before migration 0002 (they never change a balance). */
  account: Account | null;
  /** Destination pos of a move entry; null otherwise. */
  toAccount: Account | null;
}

/** A stored entry plus the id of the reversal that cancelled it (null if it is still in force). */
export interface LedgerListItem extends StoredLedgerEntry {
  reversedById: string | null;
}

export interface AppendEntryInput extends LedgerEntry {
  periodId: string;
  reversesEntryId?: string | null;
  correctionReason?: string | null;
}

interface LedgerRow {
  id: string;
  period_id: string;
  date: string;
  amount: number;
  direction: 'in' | 'out';
  type: LedgerEntryType;
  member_id: string | null;
  week: number | null;
  note: string;
  created_at: string;
  reverses_entry_id: string | null;
  correction_reason: string | null;
  account: Account | null;
  to_account: Account | null;
  reversed_by_id?: string | null;
}

const COLUMN_NAMES = [
  'id',
  'period_id',
  'date',
  'amount',
  'direction',
  'type',
  'member_id',
  'week',
  'note',
  'created_at',
  'reverses_entry_id',
  'correction_reason',
  'account',
  'to_account',
];
const COLUMNS = COLUMN_NAMES.join(', ');
// Same columns for the join below; "r" is the reversal (if any) of entry "e".
const ITEM_SELECT = `SELECT ${COLUMN_NAMES.map((c) => `e.${c}`).join(', ')}, r.id AS reversed_by_id
  FROM ledger_entries e LEFT JOIN ledger_entries r ON r.reverses_entry_id = e.id`;

const toEntry = (r: LedgerRow): StoredLedgerEntry => ({
  id: r.id,
  periodId: r.period_id,
  date: r.date,
  amount: r.amount,
  direction: r.direction,
  type: r.type,
  memberId: r.member_id,
  week: r.week,
  note: r.note,
  createdAt: r.created_at,
  reversesEntryId: r.reverses_entry_id,
  correctionReason: r.correction_reason,
  account: r.account,
  toAccount: r.to_account,
});

const toItem = (r: LedgerRow): LedgerListItem => ({ ...toEntry(r), reversedById: r.reversed_by_id ?? null });

/** Inserts one entry using the given handle (a transaction handle when called from a multi-step write). */
export async function insertEntry(db: Queryable, deps: RepoDeps, input: AppendEntryInput): Promise<StoredLedgerEntry> {
  if (!KNOWN_TYPES.includes(input.type)) throw new RepositoryError(`unknown ledger entry type: ${String(input.type)}`);
  assertIsoDate(input.date, 'ledger date');
  const entry: StoredLedgerEntry = {
    id: deps.newId(),
    periodId: input.periodId,
    date: input.date,
    amount: input.amount,
    direction: input.direction,
    type: input.type,
    memberId: input.memberId,
    week: input.week,
    note: input.note,
    createdAt: deps.now(),
    reversesEntryId: input.reversesEntryId ?? null,
    correctionReason: input.correctionReason ?? null,
    account: input.account ?? null,
    toAccount: input.toAccount ?? null,
  };
  if (entry.toAccount !== null && entry.toAccount === entry.account) {
    throw new RepositoryError('a move entry needs two different pos');
  }
  // amount > 0, integer, direction and foreign keys are enforced by the database constraints.
  await db.run(`INSERT INTO ledger_entries (${COLUMNS}) VALUES (${COLUMN_NAMES.map(() => '?').join(', ')})`, [
    entry.id,
    entry.periodId,
    entry.date,
    entry.amount,
    entry.direction,
    entry.type,
    entry.memberId,
    entry.week,
    entry.note,
    entry.createdAt,
    entry.reversesEntryId,
    entry.correctionReason,
    entry.account,
    entry.toAccount,
  ]);
  return entry;
}

/** One entry with the id of its reversal (if any), or null. */
export async function loadEntry(db: Queryable, id: string): Promise<LedgerListItem | null> {
  const row = await db.getFirst<LedgerRow>(`${ITEM_SELECT} WHERE e.id = ?`, [id]);
  return row ? toItem(row) : null;
}

/**
 * Balances of Tunai, Debit and Piutang from ALL entries of ALL periods. The only place that loads entries for
 * balances; the arithmetic itself is the pure computeKasBalances (src/domain/kas.ts).
 */
export async function loadKasBalances(db: Queryable): Promise<KasBalances> {
  const rows = await db.getAll<{
    direction: 'in' | 'out';
    amount: number;
    account: Account | null;
    to_account: Account | null;
  }>('SELECT direction, amount, account, to_account FROM ledger_entries');
  return computeKasBalances(
    rows.map((r) => ({ direction: r.direction, amount: r.amount, account: r.account, toAccount: r.to_account })),
  );
}

export async function requireActivePeriod(db: Queryable, periodId: string, what: string): Promise<{ member_count: number }> {
  const period = await db.getFirst<{ status: string; member_count: number }>(
    'SELECT status, member_count FROM periods WHERE id = ?',
    [periodId],
  );
  if (!period) throw new RepositoryError(`period ${periodId} not found`);
  if (period.status !== 'active') throw new RepositoryError(`period ${periodId} has ended; ${what} is not allowed`);
  return period;
}

export interface SettledHost {
  /** Stored entries: [payout] or [payout, offset]. */
  entries: StoredLedgerEntry[];
  settlement: PayoutPreview;
}

/** The payout of a week that is in force (not corrected) and its offset, if the host had debt. */
export interface WeekPayout {
  payout: LedgerListItem;
  offset: LedgerListItem | null;
}

async function loadWeekPayout(db: Queryable, periodId: string, week: number): Promise<WeekPayout | null> {
  const rows = await db.getAll<LedgerRow>(
    `${ITEM_SELECT} WHERE e.period_id = ? AND e.week = ? AND e.type IN ('host_payout', 'host_offset') AND r.id IS NULL ORDER BY e.rowid`,
    [periodId, week],
  );
  const items = rows.map(toItem);
  const payout = items.find((i) => i.type === 'host_payout');
  if (!payout) return null;
  return { payout, offset: items.find((i) => i.type === 'host_offset') ?? null };
}

/**
 * Shared by previewHostPayout and settleHost, so both reject exactly the same things and show/save the same
 * numbers. Rules: active period; pos tunai/debit; date real and not in the future; the week exists and has a host;
 * the week is the current one (oldest open) or already closed, never a future one; one payout per week (a
 * corrected payout does not count). The offset uses the host's arrears AT THIS MOMENT (statuses already include
 * later payments and earlier offsets).
 */
async function preparePayout(
  db: Queryable,
  deps: RepoDeps,
  periodId: string,
  week: number,
  date: string,
  account: Account,
): Promise<{ preview: PayoutPreview; hostMemberId: string }> {
  const period = await requireActivePeriod(db, periodId, 'a host payout');
  if (account !== 'tunai' && account !== 'debit') throw new RepositoryError('payout account must be tunai or debit');
  assertEntryDate(date, todayOf(deps));

  const weekRow = await db.getFirst<{ host_member_id: string | null; status: 'open' | 'closed' }>(
    'SELECT host_member_id, status FROM weeks WHERE period_id = ? AND number = ?',
    [periodId, week],
  );
  if (!weekRow) throw new RepositoryError(`week ${week} not found in period ${periodId}`);
  if (!weekRow.host_member_id) throw new RepositoryError(`week ${week} has no host; pick a host first`);
  const hostMemberId = weekRow.host_member_id;

  if (weekRow.status === 'open') {
    const oldest = await db.getFirst<{ number: number }>(
      "SELECT number FROM weeks WHERE period_id = ? AND status = 'open' ORDER BY number LIMIT 1",
      [periodId],
    );
    if (oldest?.number !== week) {
      throw new RepositoryError(`week ${week} cannot be paid out yet; only the current or a closed week can be`);
    }
  }
  if (await loadWeekPayout(db, periodId, week)) throw new RepositoryError(`week ${week} already has a host payout`);

  const statuses = await loadWeekStatuses(db, periodId, hostMemberId);
  const balances = await loadKasBalances(db);
  const preview = previewHostPayout({
    memberCount: period.member_count,
    hostMemberId,
    week,
    date,
    hostUnpaidWeeks: unpaidWeeksThrough(statuses, week),
    account,
    balances,
  });
  return { preview, hostMemberId };
}

/** Shared by previewKas and recordKas: needs an active period, a real non-future date, a member of that period. */
async function prepareKas(
  db: Queryable,
  deps: RepoDeps,
  input: KasEntryInput,
): Promise<{ periodId: string; preview: KasEntryPreview }> {
  const period = await db.getFirst<{ id: string }>("SELECT id FROM periods WHERE status = 'active' LIMIT 1");
  if (!period) throw new RepositoryError('no active period; kas entries are attached to the active period');
  assertEntryDate(input.date, todayOf(deps));
  const preview = previewKasEntry(input, await loadKasBalances(db));
  if (preview.entry.memberId) {
    const member = await db.getFirst('SELECT 1 AS ok FROM period_members WHERE period_id = ? AND member_id = ?', [
      period.id,
      preview.entry.memberId,
    ]);
    if (!member) throw new RepositoryError(`member ${preview.entry.memberId} not found in period ${period.id}`);
  }
  return { periodId: period.id, preview };
}

export function createLedgerRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    async append(input: AppendEntryInput): Promise<StoredLedgerEntry> {
      return insertEntry(db, deps, input);
    },

    /** Balances of Tunai, Debit and Piutang over every entry of every period. Use this on every screen. */
    async getKasBalances(): Promise<KasBalances> {
      return loadKasBalances(db);
    },

    /** Every entry of every period, newest first, each with the id of its reversal (null if in force). */
    async listKas(): Promise<LedgerListItem[]> {
      const rows = await db.getAll<LedgerRow>(`${ITEM_SELECT} ORDER BY e.date DESC, e.rowid DESC`);
      return rows.map(toItem);
    },

    async getEntry(id: string): Promise<LedgerListItem | null> {
      return loadEntry(db, id);
    },

    /**
     * What paying out the host of `week` would do, without writing anything: payout, offset per week, net cash
     * out, remaining debt and the balance warnings. Same validation and same domain function as settleHost.
     */
    async previewHostPayout(periodId: string, week: number, date: string, account: Account = 'tunai'): Promise<PayoutPreview> {
      return (await preparePayout(db, deps, periodId, week, date, account)).preview;
    },

    /**
     * Pays out the host of `week` in ONE transaction: the payout (out) and, when the host has debt, the offset
     * (in) on the SAME pos, plus the per-week offset credits. Allowed for the current week or a closed week.
     * Low balance is only a warning in the preview; it never blocks.
     */
    async settleHost(periodId: string, week: number, date: string, account: Account = 'tunai'): Promise<SettledHost> {
      return db.transaction(async (tx) => {
        const { preview, hostMemberId } = await preparePayout(tx, deps, periodId, week, date, account);
        const entries: StoredLedgerEntry[] = [];
        for (const e of preview.entries) {
          const stored = await insertEntry(tx, deps, { ...e, periodId });
          entries.push(stored);
          if (e.type === 'host_offset') {
            for (const w of preview.offsetWeeks) {
              await tx.run(
                'INSERT INTO offset_credits (ledger_entry_id, period_id, member_id, week, amount) VALUES (?, ?, ?, ?, ?)',
                [stored.id, periodId, hostMemberId, w.week, w.amount],
              );
            }
          }
        }
        return { entries, settlement: preview };
      });
    },

    /** The payout (and offset) of a week that is in force, or null when the week is not paid out. */
    async getWeekPayout(periodId: string, week: number): Promise<WeekPayout | null> {
      return loadWeekPayout(db, periodId, week);
    },

    /**
     * Corrects a host payout: reverses the payout AND its offset together in ONE transaction. The offset credits
     * of the reversed offset stop counting, so the host's dues are unpaid again, and the week can be paid out
     * again with a new (correct) payout. Only in an active period; the reason is required.
     */
    async reverseHostPayout(periodId: string, week: number, reason: string): Promise<StoredLedgerEntry[]> {
      const cleanReason = requireReason(reason);
      return db.transaction(async (tx) => {
        await requireActivePeriod(tx, periodId, 'a correction');
        const current = await loadWeekPayout(tx, periodId, week);
        if (!current) throw new RepositoryError(`week ${week} is not paid out; there is no host payout to correct`);
        const today = todayOf(deps);
        const stored: StoredLedgerEntry[] = [];
        for (const original of [current.payout, current.offset]) {
          if (!original) continue;
          const reversal = buildReversal(original, { reason: cleanReason, date: today });
          stored.push(await insertEntry(tx, deps, { ...reversal, periodId }));
        }
        return stored;
      });
    },

    /** What a kas entry (opening balance, transfer, loan, repayment, shared goal) would do to the balances. */
    async previewKas(input: KasEntryInput): Promise<KasEntryPreview> {
      return (await prepareKas(db, deps, input)).preview;
    },

    /**
     * Saves ONE kas entry on the active period. Rejected when no period is active, the date is in the future,
     * or (loan/repayment) the member is not in the active period. Low balances are only a warning in the preview.
     */
    async recordKas(input: KasEntryInput): Promise<StoredLedgerEntry> {
      return db.transaction(async (tx) => {
        const { periodId, preview } = await prepareKas(tx, deps, input);
        return insertEntry(tx, deps, { ...preview.entry, periodId });
      });
    },

    /**
     * Corrects one kas entry by appending its reversal (the original stays). Only for entries made on the kas
     * screens; payments and host payouts have their own correction (they also undo allocations and offsets).
     * Only in an active period, only once, reason required.
     */
    async reverseEntry(entryId: string, reason: string): Promise<StoredLedgerEntry> {
      const cleanReason = requireReason(reason);
      return db.transaction(async (tx) => {
        const entry = await loadEntry(tx, entryId);
        if (!entry) throw new RepositoryError(`ledger entry ${entryId} not found`);
        if (!DIRECTLY_REVERSIBLE_TYPES.includes(entry.type)) {
          throw new RepositoryError(`entry type ${entry.type} cannot be corrected here`);
        }
        if (entry.reversedById) throw new RepositoryError(`entry ${entryId} is already corrected`);
        await requireActivePeriod(tx, entry.periodId, 'a correction');
        const reversal = buildReversal(entry, { reason: cleanReason, date: todayOf(deps) });
        return insertEntry(tx, deps, { ...reversal, periodId: entry.periodId });
      });
    },

    /** All entries of a period in the order they were written. */
    async listByPeriod(periodId: string): Promise<StoredLedgerEntry[]> {
      const rows = await db.getAll<LedgerRow>(`SELECT ${COLUMNS} FROM ledger_entries WHERE period_id = ? ORDER BY rowid`, [
        periodId,
      ]);
      return rows.map(toEntry);
    },

    async listByMember(periodId: string, memberId: string): Promise<StoredLedgerEntry[]> {
      const rows = await db.getAll<LedgerRow>(
        `SELECT ${COLUMNS} FROM ledger_entries WHERE period_id = ? AND member_id = ? ORDER BY rowid`,
        [periodId, memberId],
      );
      return rows.map(toEntry);
    },

    async listByWeek(periodId: string, week: number): Promise<StoredLedgerEntry[]> {
      const rows = await db.getAll<LedgerRow>(
        `SELECT ${COLUMNS} FROM ledger_entries WHERE period_id = ? AND week = ? ORDER BY rowid`,
        [periodId, week],
      );
      return rows.map(toEntry);
    },
  };
}

export type LedgerRepo = ReturnType<typeof createLedgerRepo>;
