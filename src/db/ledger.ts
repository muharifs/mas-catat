// Ledger repository: append-only cash in/out entries. There is no update or delete here, and the
// database itself rejects both (triggers in migration 0001).
import { unpaidWeeksThrough } from '@/domain/dues';
import { assertIsoDate } from '@/domain/money';
import { buildHostSettlement, type HostSettlement } from '@/domain/payout';
import type { LedgerEntry, LedgerEntryType } from '@/domain/types';
import type { Db } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError } from './errors';
import { loadWeekStatuses } from './payments';

/** Types the app knows today. M5 extends this list (and the domain union) without a table change. */
const KNOWN_TYPES: readonly LedgerEntryType[] = ['member_payment', 'host_payout', 'host_offset'];

export interface StoredLedgerEntry extends LedgerEntry {
  id: string;
  periodId: string;
  createdAt: string;
  /** Set on a reversal entry: the entry it cancels. Used by corrections in M5. */
  reversesEntryId: string | null;
  correctionReason: string | null;
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
}

const COLUMNS =
  'id, period_id, date, amount, direction, type, member_id, week, note, created_at, reverses_entry_id, correction_reason';

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
});

/** Inserts one entry using the given handle (a transaction handle when called from a multi-step write). */
async function insertEntry(db: Db, deps: RepoDeps, input: AppendEntryInput): Promise<StoredLedgerEntry> {
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
  };
  // amount > 0, integer, direction and foreign keys are enforced by the database constraints.
  await db.run(`INSERT INTO ledger_entries (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
  ]);
  return entry;
}

export interface SettledHost {
  /** Stored entries: [payout] or [payout, offset]. */
  entries: StoredLedgerEntry[];
  settlement: HostSettlement;
}

export function createLedgerRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    async append(input: AppendEntryInput): Promise<StoredLedgerEntry> {
      return insertEntry(db, deps, input);
    },

    /**
     * Pays out the host of `week`: asks the domain (buildHostSettlement) for the entries, then writes the
     * payout, the offset (only when the host has debt) and the per-week offset credits in ONE transaction.
     * A week can be settled only once.
     */
    async settleHost(periodId: string, week: number, date: string): Promise<SettledHost> {
      return db.transaction(async (tx) => {
        const weekRow = await tx.getFirst<{ host_member_id: string | null }>(
          'SELECT host_member_id FROM weeks WHERE period_id = ? AND number = ?',
          [periodId, week],
        );
        if (!weekRow?.host_member_id) throw new RepositoryError(`week ${week} not found in period ${periodId}`);
        const hostMemberId = weekRow.host_member_id;

        const already = await tx.getFirst(
          "SELECT 1 AS ok FROM ledger_entries WHERE period_id = ? AND week = ? AND type = 'host_payout'",
          [periodId, week],
        );
        if (already) throw new RepositoryError(`week ${week} already has a host payout`);

        const period = await tx.getFirst<{ member_count: number }>('SELECT member_count FROM periods WHERE id = ?', [
          periodId,
        ]);
        if (!period) throw new RepositoryError(`period ${periodId} not found`);

        // Statuses already include earlier offsets, so debt is never offset twice.
        const statuses = await loadWeekStatuses(tx, periodId, hostMemberId);
        const settlement = buildHostSettlement({
          memberCount: period.member_count,
          hostMemberId,
          week,
          date,
          hostUnpaidWeeks: unpaidWeeksThrough(statuses, week),
        });

        const entries: StoredLedgerEntry[] = [];
        for (const e of settlement.entries) {
          const stored = await insertEntry(tx, deps, { ...e, periodId });
          entries.push(stored);
          if (e.type === 'host_offset') {
            for (const w of settlement.offsetWeeks) {
              await tx.run(
                'INSERT INTO offset_credits (ledger_entry_id, period_id, member_id, week, amount) VALUES (?, ?, ?, ?, ?)',
                [stored.id, periodId, hostMemberId, w.week, w.amount],
              );
            }
          }
        }
        return { entries, settlement };
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
