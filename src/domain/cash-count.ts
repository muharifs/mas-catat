// Cek kas: a physical cash count per meeting (decision 34). Pure rules, no React, Expo or SQLite imports.
//
// A count compares what the owner physically holds (Tunai, optionally Debit) with what the ledger says. It is only a
// RECORD: it never changes the ledger or any kas balance. A wrong count is corrected by a new count (append-only);
// the latest count per meeting and pos is the effective one. Counted amounts are plain non-negative rupiah, NOT
// subject to the multiple-of-Rp15.000 rule. Differences are fixed through normal entries, not through this module.
import type { KasBalances } from './kas';
import { assertIsoDate, assertPositiveInt, assertRupiah, DomainError, HOST_PAYOUT_PER_MEMBER, WEEKLY_DUE } from './money';
import type { IsoDate, Rupiah } from './types';

/** Pos that can be counted. Piutang is money lent out, not in hand, so it is never counted. */
export type CountAccount = 'tunai' | 'debit';
export const COUNT_ACCOUNTS: readonly CountAccount[] = ['tunai', 'debit'];

export type CashCountErrorCode = 'no_amount' | 'tunai_required' | 'no_active_period' | 'week_not_countable' | 'week_skipped';

/** A cash count rule was broken. `code` lets the UI pick the text. */
export class CashCountError extends DomainError {
  constructor(
    public readonly code: CashCountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CashCountError';
  }
}

/** The amount the ledger says each countable pos holds right now. Same numbers as the Kas screen (computeKasBalances). */
export function expectedBalances(kas: KasBalances): Record<CountAccount, Rupiah> {
  return { tunai: kas.tunai, debit: kas.debit };
}

/** What the owner typed. `debit` null = Debit skipped (no movement). */
export interface CountInput {
  tunai: Rupiah;
  debit: Rupiah | null;
}

/** One pos of a count, as it is stored. difference = counted - expected (negative = less money than the ledger says). */
export interface CountLine {
  account: CountAccount;
  expected: Rupiah;
  counted: Rupiah;
  difference: Rupiah;
}

export function countDifference(expected: Rupiah, counted: Rupiah): Rupiah {
  return counted - expected;
}

/**
 * Turns the typed amounts and the expected balances into the lines to store. Tunai is always counted; Debit only when
 * typed. Counted amounts must be non-negative integers (no multiple-of-15.000 rule). The expected amount comes from
 * the ledger, never from the UI.
 */
export function buildCountLines(input: CountInput, expected: Record<CountAccount, Rupiah>): CountLine[] {
  if (!Number.isSafeInteger(input.tunai)) throw new CashCountError('tunai_required', 'the Tunai count is required');
  assertRupiah(input.tunai, 'counted Tunai');
  const lines: CountLine[] = [{ account: 'tunai', expected: expected.tunai, counted: input.tunai, difference: countDifference(expected.tunai, input.tunai) }];
  if (input.debit !== null) {
    assertRupiah(input.debit, 'counted Debit');
    lines.push({ account: 'debit', expected: expected.debit, counted: input.debit, difference: countDifference(expected.debit, input.debit) });
  }
  return lines;
}

/** Validates what a stored line must satisfy (used before writing and when reading a restored file). */
export function assertCountLine(line: CountLine, date: IsoDate, week: number): void {
  assertIsoDate(date, 'count date');
  assertPositiveInt(week, 'week');
  assertRupiah(line.counted, 'counted');
  if (!Number.isSafeInteger(line.expected)) throw new DomainError(`expected must be an integer, got ${String(line.expected)}`);
  if (line.difference !== line.counted - line.expected) throw new DomainError('difference must equal counted - expected');
}

// ---------------------------------------------------------------------------------------------------------------
// Which meeting a count belongs to
// ---------------------------------------------------------------------------------------------------------------

export interface CountableWeek {
  number: number;
  status: 'open' | 'closed' | 'skipped';
}

/**
 * Meetings a count may be attached to: the oldest open meeting that is not skipped (the one being closed), and the
 * latest closed meeting (the owner may count right after closing). Ascending order; the first is the default.
 * Returns the oldest open one first when it exists, otherwise the latest closed one.
 */
export function countableWeekNumbers(weeks: readonly CountableWeek[]): number[] {
  const sorted = [...weeks].sort((a, b) => a.number - b.number);
  const oldestOpen = sorted.find((w) => w.status === 'open');
  const latestClosed = [...sorted].reverse().find((w) => w.status === 'closed');
  const result: number[] = [];
  if (oldestOpen) result.push(oldestOpen.number);
  if (latestClosed) result.push(latestClosed.number);
  return result;
}

/** The meeting a count defaults to: the oldest open one, else the latest closed one, else null (nothing to count for). */
export function defaultCountWeek(weeks: readonly CountableWeek[]): number | null {
  return countableWeekNumbers(weeks)[0] ?? null;
}

/** Throws unless `week` may take a count (see countableWeekNumbers). A skipped meeting never takes one. */
export function assertWeekCountable(weeks: readonly CountableWeek[], week: number, periodActive: boolean): void {
  if (!periodActive) throw new CashCountError('no_active_period', 'a cash count can only be taken in the active period');
  const found = weeks.find((w) => w.number === week);
  if (found?.status === 'skipped') throw new CashCountError('week_skipped', `meeting ${week} is skipped; it takes no cash count`);
  if (!countableWeekNumbers(weeks).includes(week)) {
    throw new CashCountError('week_not_countable', `meeting ${week} cannot take a cash count; use the current meeting or the latest closed one`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Hints for a non-zero difference (suggestions only; the app never decides what is wrong)
// ---------------------------------------------------------------------------------------------------------------

export type CountHintCode =
  | 'member_payment' // counted is MORE by a multiple of 15.000: a member payment may not be recorded
  | 'host_payout' // counted is LESS by exactly 10.000 x N: a host payout may not be recorded
  | 'transfer' // Tunai and Debit differ by opposite amounts, or one pos alone: a transfer may not be recorded
  | 'goal_spending'; // counted is LESS: a shared-goal expense may not be recorded

/**
 * Hints for ONE pos with a non-zero difference. Order = how specific the hint is. `otherDifference` is the difference
 * of the other pos in the same count (null when it was not counted); when the two cancel out, a Tunai<->Debit
 * transfer is the likely cause and comes first.
 */
export function countHints(params: {
  difference: Rupiah;
  memberCount: number;
  otherDifference?: Rupiah | null;
}): CountHintCode[] {
  const { difference, memberCount, otherDifference = null } = params;
  if (difference === 0) return [];
  const hints: CountHintCode[] = [];
  const cancelsOut = otherDifference !== null && otherDifference !== 0 && otherDifference === -difference;
  if (cancelsOut) hints.push('transfer');
  if (difference > 0 && difference % WEEKLY_DUE === 0) hints.push('member_payment');
  if (difference < 0 && memberCount > 0 && -difference === HOST_PAYOUT_PER_MEMBER * memberCount) hints.push('host_payout');
  if (!cancelsOut) hints.push('transfer');
  if (difference < 0) hints.push('goal_spending');
  return hints;
}

// ---------------------------------------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------------------------------------

/** A stored count line. `seq` grows with every saved count: the larger seq is the later one. */
export interface StoredCountLine extends CountLine {
  seq: number;
  /** One id per saved count: the Tunai and Debit lines of one save share it. */
  batchId: string;
  periodId: string;
  week: number;
  date: IsoDate;
  note: string;
}

/** Latest line per (meeting, pos): the effective count. Older lines stay in storage as history. */
export function effectiveLines(lines: readonly StoredCountLine[]): StoredCountLine[] {
  const latest = new Map<string, StoredCountLine>();
  for (const l of lines) {
    const key = `${l.periodId}|${l.week}|${l.account}`;
    const prev = latest.get(key);
    if (!prev || l.seq > prev.seq) latest.set(key, l);
  }
  return [...latest.values()].sort((a, b) => a.week - b.week || COUNT_ACCOUNTS.indexOf(a.account) - COUNT_ACCOUNTS.indexOf(b.account));
}

/** 'first' = the first counted meeting of a run of differences, 'continued' = counted straight after a 'first'/'continued'. */
export type DifferenceFlag = 'first' | 'continued' | null;

export interface MeetingCountRow {
  week: number;
  /** Effective lines of this meeting (Tunai first). Empty for a meeting without a count. */
  lines: StoredCountLine[];
  counted: boolean;
  hasDifference: boolean;
  flag: DifferenceFlag;
}

/**
 * One row per meeting number 1..weekCount (a skipped meeting is left out), with flags for differences. Meetings
 * without a count do not break a run (nothing was checked there), but they carry no flag themselves.
 * The very first meeting with a non-zero difference gets 'first'; a later run that starts after a clean count also
 * gets 'first'; counted meetings right after it that still differ get 'continued'.
 */
export function buildCountHistory(lines: readonly StoredCountLine[], weekNumbers: readonly number[]): MeetingCountRow[] {
  const effective = effectiveLines(lines);
  let inRun = false;
  return [...weekNumbers]
    .sort((a, b) => a - b)
    .map((week) => {
      const own = effective.filter((l) => l.week === week);
      const counted = own.length > 0;
      const hasDifference = own.some((l) => l.difference !== 0);
      let flag: DifferenceFlag = null;
      if (counted) {
        if (hasDifference) {
          flag = inRun ? 'continued' : 'first';
          inRun = true;
        } else {
          inRun = false;
        }
      }
      return { week, lines: own, counted, hasDifference, flag };
    });
}

export interface CountStatus {
  /** 'none' = never counted; 'clean' = latest counted meeting matches; 'difference' = it differs. */
  state: 'none' | 'clean' | 'difference';
  week: number | null;
  /** Non-zero lines of that meeting (empty when clean). */
  differing: StoredCountLine[];
}

/** The status of the latest counted meeting (highest meeting number with an effective count). */
export function latestCountStatus(lines: readonly StoredCountLine[]): CountStatus {
  const effective = effectiveLines(lines);
  if (effective.length === 0) return { state: 'none', week: null, differing: [] };
  const week = Math.max(...effective.map((l) => l.week));
  const own = effective.filter((l) => l.week === week);
  const differing = own.filter((l) => l.difference !== 0);
  return { state: differing.length > 0 ? 'difference' : 'clean', week, differing };
}

/** True when the meeting has an effective count (any pos). "Tutup pertemuan" warns (does not block) when false. */
export function hasCountForWeek(lines: readonly StoredCountLine[], periodId: string, week: number): boolean {
  return lines.some((l) => l.periodId === periodId && l.week === week);
}

/** How many counts were saved for the meeting (a save with Tunai and Debit counts once). History keeps all of them. */
export function timesCounted(lines: readonly StoredCountLine[], periodId: string, week: number): number {
  return new Set(lines.filter((l) => l.periodId === periodId && l.week === week).map((l) => l.batchId)).size;
}
