// Migration 1: initial schema. NEVER edit this file after it ships; add 0002_*.ts instead.
//
// Why a .ts file holding a SQL string and not a .sql file: Metro (the React Native bundler) only
// bundles JS/TS/assets, so a .sql file would need extra bundler config. A string works in Expo Go and Jest.
//
// Conventions: money = INTEGER rupiah (CHECK typeof = 'integer' rejects 1.5 / '15000' text), dates = TEXT
// 'YYYY-MM-DD', timestamps = TEXT ISO 8601. Ledger "type" has no SQL CHECK on purpose: M5 adds new types and
// SQLite cannot alter a CHECK without rebuilding an append-only table; the repository validates the type.
export const sql = `
CREATE TABLE members (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE periods (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- N: fixed for the whole period. The number of period_members rows can never exceed it (trigger below).
  member_count INTEGER NOT NULL CHECK (typeof(member_count) = 'integer' AND member_count > 0),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  start_date   TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date     TEXT CHECK (end_date IS NULL OR end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at   TEXT NOT NULL
);

CREATE TABLE period_members (
  period_id     TEXT NOT NULL REFERENCES periods (id),
  member_id     TEXT NOT NULL REFERENCES members (id),
  initial_order INTEGER NOT NULL CHECK (typeof(initial_order) = 'integer' AND initial_order > 0),
  PRIMARY KEY (period_id, member_id),
  UNIQUE (period_id, initial_order)
);

CREATE TRIGGER period_members_max_n BEFORE INSERT ON period_members
WHEN (SELECT COUNT(*) FROM period_members WHERE period_id = NEW.period_id)
     >= (SELECT member_count FROM periods WHERE id = NEW.period_id)
BEGIN
  SELECT RAISE(ABORT, 'period already has member_count members');
END;

CREATE TRIGGER period_members_no_update BEFORE UPDATE ON period_members
BEGIN
  SELECT RAISE(ABORT, 'period_members is fixed once created');
END;

CREATE TRIGGER period_members_no_delete BEFORE DELETE ON period_members
BEGIN
  SELECT RAISE(ABORT, 'period_members is fixed once created');
END;

CREATE TABLE weeks (
  period_id      TEXT NOT NULL REFERENCES periods (id),
  number         INTEGER NOT NULL CHECK (typeof(number) = 'integer' AND number > 0),
  date           TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- NULL only appears transiently inside a host swap transaction (UNIQUE is checked per statement).
  host_member_id TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at      TEXT,
  PRIMARY KEY (period_id, number),
  FOREIGN KEY (period_id, host_member_id) REFERENCES period_members (period_id, member_id)
);

-- A member hosts at most once per period.
CREATE UNIQUE INDEX ux_weeks_period_host ON weeks (period_id, host_member_id);

CREATE TRIGGER weeks_number_within_period BEFORE INSERT ON weeks
WHEN NEW.number > (SELECT member_count FROM periods WHERE id = NEW.period_id)
BEGIN
  SELECT RAISE(ABORT, 'week number exceeds the number of members');
END;

CREATE TRIGGER weeks_closed_host_locked BEFORE UPDATE OF host_member_id ON weeks
WHEN OLD.status = 'closed' AND NEW.host_member_id IS NOT OLD.host_member_id
BEGIN
  SELECT RAISE(ABORT, 'host of a closed week cannot be changed');
END;

CREATE TRIGGER weeks_no_reopen BEFORE UPDATE OF status ON weeks
WHEN OLD.status = 'closed' AND NEW.status <> 'closed'
BEGIN
  SELECT RAISE(ABORT, 'a closed week cannot be reopened');
END;

CREATE TABLE payments (
  id         TEXT PRIMARY KEY,
  period_id  TEXT NOT NULL REFERENCES periods (id),
  member_id  TEXT NOT NULL,
  date       TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- The multiple-of-15.000 rule lives in src/domain, not here.
  amount     INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (period_id, member_id) REFERENCES period_members (period_id, member_id)
);
CREATE INDEX ix_payments_member ON payments (period_id, member_id, date);

-- Stored allocation of a payment to weekly dues. Written once, never recomputed, so a back-dated payment
-- entered later cannot reshuffle what was already allocated. payment_date is the date it was actually paid.
CREATE TABLE allocations (
  payment_id   TEXT NOT NULL REFERENCES payments (id),
  period_id    TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  week         INTEGER NOT NULL,
  amount       INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0),
  payment_date TEXT NOT NULL CHECK (payment_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  FOREIGN KEY (period_id, member_id) REFERENCES period_members (period_id, member_id),
  FOREIGN KEY (period_id, week) REFERENCES weeks (period_id, number)
);
CREATE INDEX ix_allocations_member_week ON allocations (period_id, member_id, week);
CREATE INDEX ix_allocations_payment ON allocations (payment_id);

CREATE TRIGGER allocations_no_update BEFORE UPDATE ON allocations
BEGIN
  SELECT RAISE(ABORT, 'allocations are append-only');
END;

CREATE TRIGGER allocations_no_delete BEFORE DELETE ON allocations
BEGIN
  SELECT RAISE(ABORT, 'allocations are append-only');
END;

-- Append-only ledger. direction gives the sign; amount is always > 0.
-- A correction is a reversal entry (reverses_entry_id) plus a new entry; the original row is never touched.
CREATE TABLE ledger_entries (
  id                TEXT PRIMARY KEY,
  period_id         TEXT NOT NULL REFERENCES periods (id),
  date              TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount            INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0),
  direction         TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  type              TEXT NOT NULL CHECK (length(type) > 0),
  member_id         TEXT,
  week              INTEGER CHECK (week IS NULL OR (typeof(week) = 'integer' AND week > 0)),
  note              TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL,
  reverses_entry_id TEXT REFERENCES ledger_entries (id),
  correction_reason TEXT,
  FOREIGN KEY (period_id, member_id) REFERENCES period_members (period_id, member_id),
  FOREIGN KEY (period_id, week) REFERENCES weeks (period_id, number)
);
CREATE INDEX ix_ledger_period ON ledger_entries (period_id, date);
CREATE INDEX ix_ledger_member ON ledger_entries (period_id, member_id);
CREATE INDEX ix_ledger_week ON ledger_entries (period_id, week);

CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries is append-only');
END;

CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries is append-only');
END;

-- Per-week breakdown of a host_offset ledger entry (which week's due each part of the offset settled).
CREATE TABLE offset_credits (
  ledger_entry_id TEXT NOT NULL REFERENCES ledger_entries (id),
  period_id       TEXT NOT NULL,
  member_id       TEXT NOT NULL,
  week            INTEGER NOT NULL,
  amount          INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0),
  FOREIGN KEY (period_id, member_id) REFERENCES period_members (period_id, member_id),
  FOREIGN KEY (period_id, week) REFERENCES weeks (period_id, number)
);
CREATE INDEX ix_offset_credits_member ON offset_credits (period_id, member_id, week);

CREATE TRIGGER offset_credits_no_update BEFORE UPDATE ON offset_credits
BEGIN
  SELECT RAISE(ABORT, 'offset_credits are append-only');
END;

CREATE TRIGGER offset_credits_no_delete BEFORE DELETE ON offset_credits
BEGIN
  SELECT RAISE(ABORT, 'offset_credits are append-only');
END;
`;
