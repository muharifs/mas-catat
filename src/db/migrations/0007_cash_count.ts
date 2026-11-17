// Migration 7: Cek kas, a physical cash count per meeting (decision 34). NEVER edit this file after it ships.
//
// - cash_counts: one row per counted pos (Tunai, optionally Debit) of one saved count. Append-only: a wrong count is
//   fixed by a NEW count; the latest row per (period, meeting, pos) is the effective one (VIEW latest_cash_counts),
//   older rows stay as history. `seq` (an explicit INTEGER PRIMARY KEY, stable under VACUUM) gives the order; the
//   repository never sets it. `batch_id` groups the Tunai and Debit rows of ONE saved count.
// - A count only RECORDS expected, counted and difference. It never touches ledger_entries or any balance, and no
//   trigger or view here reads or writes them. difference = counted - expected is enforced by a CHECK.
// - counted is plain non-negative rupiah (no multiple-of-15.000 rule). expected may be any integer.
// - Guard triggers (second line of defence behind the domain and repository checks): append-only, active period
//   only, no count for a skipped meeting, an id and a seq are used once (INSERT OR REPLACE would bypass the delete trigger).
// - No back-fill and no change to existing tables: nothing before this migration used these structures.
export const sql = `
CREATE TABLE cash_counts (
  seq        INTEGER PRIMARY KEY,
  id         TEXT NOT NULL UNIQUE,
  batch_id   TEXT NOT NULL,
  period_id  TEXT NOT NULL,
  week       INTEGER NOT NULL CHECK (typeof(week) = 'integer' AND week > 0),
  account    TEXT NOT NULL CHECK (account IN ('tunai', 'debit')),
  count_date TEXT NOT NULL,
  expected   INTEGER NOT NULL CHECK (typeof(expected) = 'integer'),
  counted    INTEGER NOT NULL CHECK (typeof(counted) = 'integer' AND counted >= 0),
  difference INTEGER NOT NULL CHECK (typeof(difference) = 'integer' AND difference = counted - expected),
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (period_id, week) REFERENCES weeks (period_id, number)
);
CREATE INDEX ix_cash_counts_week ON cash_counts (period_id, week, account);

CREATE VIEW latest_cash_counts AS
SELECT c.seq, c.id, c.batch_id, c.period_id, c.week, c.account, c.count_date, c.expected, c.counted, c.difference, c.note, c.created_at
  FROM cash_counts c
 WHERE c.seq = (SELECT MAX(c2.seq) FROM cash_counts c2
                 WHERE c2.period_id = c.period_id AND c2.week = c.week AND c2.account = c.account);

CREATE TRIGGER cash_counts_no_update BEFORE UPDATE ON cash_counts
BEGIN SELECT RAISE(ABORT, 'cash_counts are append-only'); END;
CREATE TRIGGER cash_counts_no_delete BEFORE DELETE ON cash_counts
BEGIN SELECT RAISE(ABORT, 'cash_counts are append-only'); END;

CREATE TRIGGER cash_counts_unique_id BEFORE INSERT ON cash_counts
WHEN EXISTS (SELECT 1 FROM cash_counts WHERE id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'a cash count id is used once'); END;

CREATE TRIGGER cash_counts_unique_seq BEFORE INSERT ON cash_counts
WHEN EXISTS (SELECT 1 FROM cash_counts WHERE seq = NEW.seq)
BEGIN SELECT RAISE(ABORT, 'a cash count seq is used once'); END;

CREATE TRIGGER cash_counts_period_active BEFORE INSERT ON cash_counts
WHEN (SELECT status FROM periods WHERE id = NEW.period_id) IS NOT 'active'
BEGIN SELECT RAISE(ABORT, 'a cash count can only be taken in the active period'); END;

CREATE TRIGGER cash_counts_not_skipped BEFORE INSERT ON cash_counts
WHEN EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = NEW.period_id AND k.week = NEW.week)
BEGIN SELECT RAISE(ABORT, 'a skipped meeting takes no cash count'); END;
`;

