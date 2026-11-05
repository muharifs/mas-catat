// Migration 4: period close and member credit. NEVER edit this file after it ships.
//
// - credit_applications: where member credit was used. Append-only, written once, never recomputed.
//     kind 'settle_debt': at period close, credit settles the member's own arrears (from period = to period).
//     kind 'carry_over':  when a new period is created, credit of an earlier closed period settles weeks 1..N of it.
//   Neither writes a ledger entry: the money entered Tunai/Debit when it was received.
//   The available credit of a source period is derived: payments - allocations - applications - refunds.
// - ux_ledger_writeoff: at most one debt_writeoff entry per (period, member), so a double write-off is impossible.
// - Two insert triggers check the shape of the new ledger types (there is no CHECK on type, see migration 0001):
//     debt_writeoff: direction out, no pos (it never changes a balance), no week, a member.
//     credit_refund: direction out, pos Tunai or Debit, no week, a member.
// - No back-fill: nothing before this migration used these structures.
export const sql = `
CREATE TABLE credit_applications (
  kind           TEXT NOT NULL CHECK (kind IN ('settle_debt', 'carry_over')),
  from_period_id TEXT NOT NULL REFERENCES periods (id),
  member_id      TEXT NOT NULL,
  to_period_id   TEXT NOT NULL REFERENCES periods (id),
  week           INTEGER NOT NULL CHECK (typeof(week) = 'integer' AND week > 0),
  amount         INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0),
  created_at     TEXT NOT NULL,
  FOREIGN KEY (from_period_id, member_id) REFERENCES period_members (period_id, member_id),
  FOREIGN KEY (to_period_id, member_id) REFERENCES period_members (period_id, member_id),
  FOREIGN KEY (to_period_id, week) REFERENCES weeks (period_id, number),
  CHECK (kind <> 'settle_debt' OR from_period_id = to_period_id),
  CHECK (kind <> 'carry_over' OR from_period_id <> to_period_id)
);
CREATE INDEX ix_credit_applications_to ON credit_applications (to_period_id, member_id, week);
CREATE INDEX ix_credit_applications_from ON credit_applications (from_period_id, member_id);

CREATE TRIGGER credit_applications_no_update BEFORE UPDATE ON credit_applications
BEGIN
  SELECT RAISE(ABORT, 'credit_applications are append-only');
END;

CREATE TRIGGER credit_applications_no_delete BEFORE DELETE ON credit_applications
BEGIN
  SELECT RAISE(ABORT, 'credit_applications are append-only');
END;

CREATE UNIQUE INDEX ux_ledger_writeoff ON ledger_entries (period_id, member_id) WHERE type = 'debt_writeoff';

CREATE TRIGGER ledger_writeoff_shape BEFORE INSERT ON ledger_entries
WHEN NEW.type = 'debt_writeoff'
 AND (NEW.direction <> 'out' OR NEW.account IS NOT NULL OR NEW.to_account IS NOT NULL
      OR NEW.week IS NOT NULL OR NEW.member_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a debt_writeoff is an out entry of a member without pos and week');
END;

CREATE TRIGGER ledger_refund_shape BEFORE INSERT ON ledger_entries
WHEN NEW.type = 'credit_refund'
 AND (NEW.direction <> 'out' OR NEW.account IS NULL OR NEW.account NOT IN ('tunai', 'debit')
      OR NEW.to_account IS NOT NULL OR NEW.week IS NOT NULL OR NEW.member_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a credit_refund is an out entry of a member from tunai or debit without week');
END;
`;
