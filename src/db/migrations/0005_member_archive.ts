// Migration 5: archive a member instead of deleting one that has history. NEVER edit this file after it ships.
//
// - members.archived_at: NULL = active, a non-empty text (ISO timestamp) = archived. ADD COLUMN only: no table
//   rebuild, no RENAME/DROP COLUMN (they would upset the schema fingerprint, see backup.ts), no index (a few dozen rows).
// - members_archive_not_in_active_period: a member of the active period cannot be archived (second line of defence
//   behind the domain and repository checks).
// - period_members_no_archived: an archived member cannot be put into a new period.
// Existing rows get archived_at NULL, so nothing in the existing data changes.
export const sql = `
ALTER TABLE members ADD COLUMN archived_at TEXT CHECK (archived_at IS NULL OR length(trim(archived_at)) > 0);

CREATE TRIGGER members_archive_not_in_active_period BEFORE UPDATE OF archived_at ON members
WHEN NEW.archived_at IS NOT NULL
 AND EXISTS (SELECT 1 FROM period_members pm JOIN periods p ON p.id = pm.period_id
              WHERE pm.member_id = OLD.id AND p.status = 'active')
BEGIN
  SELECT RAISE(ABORT, 'a member of the active period cannot be archived');
END;

CREATE TRIGGER period_members_no_archived BEFORE INSERT ON period_members
WHEN EXISTS (SELECT 1 FROM members m WHERE m.id = NEW.member_id AND m.archived_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'an archived member cannot join a period');
END;
`;
