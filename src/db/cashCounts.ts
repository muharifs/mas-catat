// Cash count repository (Cek kas, decision 34). A count only RECORDS expected, counted and difference: it writes
// nothing to the ledger and changes no balance. The expected balances are recomputed from the ledger INSIDE the write
// transaction (the UI never supplies them), so the stored numbers always match the ledger at the moment of saving.
import {
  assertCountLine,
  assertWeekCountable,
  buildCountLines,
  countableWeekNumbers,
  defaultCountWeek,
  expectedBalances,
  type CountAccount,
  type CountLine,
  type StoredCountLine,
} from '@/domain/cash-count';
import { assertEntryDate } from '@/domain/kas';
import { DomainError } from '@/domain/money';
import type { Rupiah } from '@/domain/types';
import type { Db, Queryable } from './db';
import { defaultDeps, todayOf, type RepoDeps } from './deps';
import { RepositoryError } from './errors';
import { loadKasBalances } from './ledger';

export interface SaveCashCountInput {
  periodId: string;
  week: number;
  /** Date of the count; defaults to today (phone clock). */
  date?: string;
  tunai: Rupiah;
  /** null = Debit skipped (no movement). */
  debit: Rupiah | null;
  note?: string;
}

export interface CashCountForm {
  expected: Record<CountAccount, Rupiah>;
  countableWeeks: number[];
  defaultWeek: number | null;
  memberCount: number;
}

interface CountRow {
  seq: number;
  batch_id: string;
  period_id: string;
  week: number;
  account: CountAccount;
  count_date: string;
  expected: number;
  counted: number;
  difference: number;
  note: string;
  created_at: string;
}

const toLine = (r: CountRow): StoredCountLine => ({
  seq: r.seq,
  batchId: r.batch_id,
  periodId: r.period_id,
  week: r.week,
  account: r.account,
  date: r.count_date,
  expected: r.expected,
  counted: r.counted,
  difference: r.difference,
  note: r.note,
  createdAt: r.created_at,
});

const COLUMNS = 'seq, batch_id, period_id, week, account, count_date, expected, counted, difference, note, created_at';

async function loadPeriodWeeks(db: Queryable, periodId: string) {
  const period = await db.getFirst<{ status: 'active' | 'closed'; member_count: number }>(
    'SELECT status, member_count FROM periods WHERE id = ?',
    [periodId],
  );
  if (!period) throw new RepositoryError(`period ${periodId} not found`);
  const rows = await db.getAll<{ number: number; status: 'open' | 'closed'; skipped: number }>(
    `SELECT number, status,
            EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = weeks.period_id AND k.week = weeks.number) AS skipped
       FROM weeks WHERE period_id = ? ORDER BY number`,
    [periodId],
  );
  return {
    active: period.status === 'active',
    memberCount: period.member_count,
    weeks: rows.map((r) => ({ number: r.number, status: r.skipped === 1 ? ('skipped' as const) : r.status })),
  };
}

export function createCashCountsRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    /** What the count form needs: expected balances from the ledger and the meetings a count may be attached to. */
    async form(periodId: string): Promise<CashCountForm> {
      const p = await loadPeriodWeeks(db, periodId);
      const expected = expectedBalances(await loadKasBalances(db));
      const countable = p.active ? countableWeekNumbers(p.weeks) : [];
      return { expected, countableWeeks: countable, defaultWeek: p.active ? defaultCountWeek(p.weeks) : null, memberCount: p.memberCount };
    },

    /**
     * Saves one count: a Tunai line and, when `debit` is not null, a Debit line, in ONE transaction, sharing a batch id.
     * Never touches ledger_entries. Returns the stored lines.
     */
    async save(input: SaveCashCountInput): Promise<StoredCountLine[]> {
      const date = input.date ?? todayOf(deps);
      assertEntryDate(date, todayOf(deps)); // real calendar date, not in the future (same rule as kas entries)
      const note = (input.note ?? '').trim();
      return db.transaction(async (tx) => {
        const p = await loadPeriodWeeks(tx, input.periodId);
        assertWeekCountable(p.weeks, input.week, p.active);
        const expected = expectedBalances(await loadKasBalances(tx));
        const lines: CountLine[] = buildCountLines({ tunai: input.tunai, debit: input.debit }, expected);
        const batchId = deps.newId();
        const createdAt = deps.now();
        const seqs: number[] = [];
        for (const line of lines) {
          assertCountLine(line, date, input.week);
          await tx.run(
            `INSERT INTO cash_counts (id, batch_id, period_id, week, account, count_date, expected, counted, difference, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [deps.newId(), batchId, input.periodId, input.week, line.account, date, line.expected, line.counted, line.difference, note, createdAt],
          );
          const row = await tx.getFirst<{ seq: number }>('SELECT last_insert_rowid() AS seq');
          if (!row) throw new DomainError('cash count was not stored');
          seqs.push(row.seq);
        }
        const saved = await tx.getAll<CountRow>(`SELECT ${COLUMNS} FROM cash_counts WHERE seq IN (${seqs.map(() => '?').join(',')}) ORDER BY seq`, seqs);
        return saved.map(toLine);
      });
    },

    /** EVERY saved line of the period (history included), oldest first. The domain picks the effective ones. */
    async listAll(periodId: string): Promise<StoredCountLine[]> {
      const rows = await db.getAll<CountRow>(`SELECT ${COLUMNS} FROM cash_counts WHERE period_id = ? ORDER BY seq`, [periodId]);
      return rows.map(toLine);
    },

    /** Only the effective (latest per meeting and pos) lines of the period, from the view latest_cash_counts. */
    async listEffective(periodId: string): Promise<StoredCountLine[]> {
      const rows = await db.getAll<CountRow>(
        `SELECT ${COLUMNS} FROM latest_cash_counts WHERE period_id = ? ORDER BY week, account DESC`,
        [periodId],
      );
      return rows.map(toLine);
    },

    /** True when the meeting has any count: "Tutup pertemuan" warns (never blocks) when it has none. */
    async hasCount(periodId: string, week: number): Promise<boolean> {
      const row = await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM cash_counts WHERE period_id = ? AND week = ?', [periodId, week]);
      return (row?.n ?? 0) > 0;
    },
  };
}

export type CashCountsRepo = ReturnType<typeof createCashCountsRepo>;
