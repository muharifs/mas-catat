// Migration 6: skip the last meeting of a period. NEVER edit this file after it ships.
//
// - week_skips: one row per skip (append-only, with a required reason). week_skip_undos: one row per undo, at most one
//   per skip (UNIQUE skip_id). A skip is "in force" while it has no undo (VIEW skipped_weeks); a meeting can be
//   skipped again after an undo (a new row).
// - A skipped meeting stays status 'open' in `weeks` until the period closes (periods.close then closes it, after the
//   period itself is closed); "skipped" is derived from the VIEW, so the invariant "a closed period has no open
//   meeting" is not loosened.
// - Guard triggers (second line of defence behind the domain and repository checks): active period only, last
//   meeting only (week = member_count), meeting open, every earlier meeting closed, one skip in force, no host payout
//   in force; undo only while the period is active and the meeting open; a skipped meeting takes no allocations,
//   offset credits, credit applications, host payout or host offset; its host and date are locked.
// - No back-fill and no change to existing tables: nothing before this migration used these structures.
export const sql = `
CREATE TABLE week_skips (
  id         TEXT PRIMARY KEY,
  period_id  TEXT NOT NULL,
  week       INTEGER NOT NULL CHECK (typeof(week) = 'integer' AND week > 0),
  reason     TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (period_id, week) REFERENCES weeks (period_id, number)
);
CREATE INDEX ix_week_skips_week ON week_skips (period_id, week);

CREATE TABLE week_skip_undos (
  skip_id    TEXT NOT NULL UNIQUE REFERENCES week_skips (id),
  reason     TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TEXT NOT NULL
);

CREATE VIEW skipped_weeks AS
SELECT s.period_id, s.week, s.id AS skip_id, s.reason, s.created_at
  FROM week_skips s
 WHERE NOT EXISTS (SELECT 1 FROM week_skip_undos u WHERE u.skip_id = s.id);

CREATE TRIGGER week_skips_no_update BEFORE UPDATE ON week_skips
BEGIN SELECT RAISE(ABORT, 'week_skips are append-only'); END;
CREATE TRIGGER week_skips_no_delete BEFORE DELETE ON week_skips
BEGIN SELECT RAISE(ABORT, 'week_skips are append-only'); END;
CREATE TRIGGER week_skip_undos_no_update BEFORE UPDATE ON week_skip_undos
BEGIN SELECT RAISE(ABORT, 'week_skip_undos are append-only'); END;
CREATE TRIGGER week_skip_undos_no_delete BEFORE DELETE ON week_skip_undos
BEGIN SELECT RAISE(ABORT, 'week_skip_undos are append-only'); END;

CREATE TRIGGER week_skips_period_active BEFORE INSERT ON week_skips
WHEN (SELECT status FROM periods WHERE id = NEW.period_id) IS NOT 'active'
BEGIN SELECT RAISE(ABORT, 'only a meeting of the active period can be skipped'); END;

CREATE TRIGGER week_skips_last_only BEFORE INSERT ON week_skips
WHEN NEW.week IS NOT (SELECT member_count FROM periods WHERE id = NEW.period_id)
BEGIN SELECT RAISE(ABORT, 'only the last meeting can be skipped'); END;

CREATE TRIGGER week_skips_week_open BEFORE INSERT ON week_skips
WHEN (SELECT status FROM weeks WHERE period_id = NEW.period_id AND number = NEW.week) IS NOT 'open'
BEGIN SELECT RAISE(ABORT, 'a closed meeting cannot be skipped'); END;

CREATE TRIGGER week_skips_earlier_closed BEFORE INSERT ON week_skips
WHEN EXISTS (SELECT 1 FROM weeks w WHERE w.period_id = NEW.period_id AND w.number < NEW.week AND w.status <> 'closed')
BEGIN SELECT RAISE(ABORT, 'every earlier meeting must be closed before the last one is skipped'); END;

CREATE TRIGGER week_skips_one_in_force BEFORE INSERT ON week_skips
WHEN EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = NEW.period_id AND k.week = NEW.week)
BEGIN SELECT RAISE(ABORT, 'this meeting is already skipped'); END;

CREATE TRIGGER week_skips_no_standing_payout BEFORE INSERT ON week_skips
WHEN EXISTS (SELECT 1 FROM ledger_entries e
              WHERE e.period_id = NEW.period_id AND e.week = NEW.week AND e.type = 'host_payout'
                AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id))
BEGIN SELECT RAISE(ABORT, 'a meeting with a host payout in force cannot be skipped'); END;

CREATE TRIGGER week_skip_undos_period_active BEFORE INSERT ON week_skip_undos
WHEN (SELECT p.status FROM week_skips s JOIN periods p ON p.id = s.period_id WHERE s.id = NEW.skip_id) IS NOT 'active'
BEGIN SELECT RAISE(ABORT, 'a skip can only be undone while the period is active'); END;

CREATE TRIGGER week_skip_undos_week_open BEFORE INSERT ON week_skip_undos
WHEN (SELECT w.status FROM week_skips s JOIN weeks w ON w.period_id = s.period_id AND w.number = s.week WHERE s.id = NEW.skip_id) IS NOT 'open'
BEGIN SELECT RAISE(ABORT, 'a skip of a closed meeting cannot be undone'); END;

CREATE TRIGGER allocations_not_skipped BEFORE INSERT ON allocations
WHEN EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = NEW.period_id AND k.week = NEW.week)
BEGIN SELECT RAISE(ABORT, 'a skipped meeting has no dues to pay'); END;

CREATE TRIGGER offset_credits_not_skipped BEFORE INSERT ON offset_credits
WHEN EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = NEW.period_id AND k.week = NEW.week)
BEGIN SELECT RAISE(ABORT, 'a skipped meeting has no dues to offset'); END;

CREATE TRIGGER credit_applications_not_skipped BEFORE INSERT ON credit_applications
WHEN EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = NEW.to_period_id AND k.week = NEW.week)
BEGIN SELECT RAISE(ABORT, 'a skipped meeting has no dues for member credit'); END;

CREATE TRIGGER ledger_payout_not_skipped BEFORE INSERT ON ledger_entries
WHEN NEW.type IN ('host_payout', 'host_offset') AND NEW.week IS NOT NULL
 AND EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = NEW.period_id AND k.week = NEW.week)
BEGIN SELECT RAISE(ABORT, 'a skipped meeting has no host payout'); END;

CREATE TRIGGER weeks_skipped_locked BEFORE UPDATE OF host_member_id, date ON weeks
WHEN (NEW.host_member_id IS NOT OLD.host_member_id OR NEW.date IS NOT OLD.date)
 AND EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = OLD.period_id AND k.week = OLD.number)
BEGIN SELECT RAISE(ABORT, 'host and date of a skipped meeting cannot change; undo the skip first'); END;

CREATE TRIGGER weeks_skipped_close_with_period BEFORE UPDATE OF status ON weeks
WHEN NEW.status = 'closed' AND OLD.status = 'open'
 AND (SELECT status FROM periods WHERE id = OLD.period_id) = 'active'
 AND EXISTS (SELECT 1 FROM skipped_weeks k WHERE k.period_id = OLD.period_id AND k.week = OLD.number)
BEGIN SELECT RAISE(ABORT, 'a skipped meeting is closed together with its period'); END;
`;
