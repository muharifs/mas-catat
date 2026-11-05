// Migration 3: kas moves (to_account), corrections (reversals) and payment <-> ledger link.
// NEVER edit this file after it ships.
//
// - ledger_entries.to_account: destination pos of a move entry (transfer, loan, repayment). One entry, two pos.
// - ux_ledger_reverses: an entry can be reversed at most once (partial unique index, NULLs are ignored).
// - Triggers: a reversal needs a correction_reason.
// - payments.ledger_entry_id: which member_payment ledger entry belongs to a payment, so a wrong payment can
//   be reversed together with its ledger entry. Existing rows are back-filled below.
// - payment_reversals: a payment that was corrected. Its allocations stay in the table (append-only) but are
//   ignored by every calculation; its stored credit is ignored too. Append-only like the other tables.
// - Reversed host offsets need no new table: offset_credits of an offset entry that has a reversal are ignored.
//
// ALTER TABLE ... ADD COLUMN does not fire the append-only triggers (they only watch UPDATE and DELETE).
export const sql = `
ALTER TABLE ledger_entries ADD COLUMN to_account TEXT
  CHECK (to_account IS NULL OR to_account IN ('tunai', 'debit', 'piutang'));

CREATE UNIQUE INDEX ux_ledger_reverses ON ledger_entries (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

CREATE TRIGGER ledger_reversal_needs_reason BEFORE INSERT ON ledger_entries
WHEN NEW.reverses_entry_id IS NOT NULL AND (NEW.correction_reason IS NULL OR length(trim(NEW.correction_reason)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'a reversal needs a correction reason');
END;

ALTER TABLE payments ADD COLUMN ledger_entry_id TEXT REFERENCES ledger_entries (id);

-- Back-fill for payments saved before this migration. M4 wrote the payment and its member_payment entry in the
-- SAME transaction, in order, with the same period, member, date and amount. So within one group of identical
-- (period, member, date, amount) the n-th payment (by rowid) belongs to the n-th member_payment entry (by rowid).
-- Entries without a payment (for example written directly by tests) simply stay unpaired.
UPDATE payments SET ledger_entry_id = (
  SELECT e.id FROM ledger_entries e
   WHERE e.type = 'member_payment' AND e.reverses_entry_id IS NULL
     AND e.period_id = payments.period_id AND e.member_id = payments.member_id
     AND e.date = payments.date AND e.amount = payments.amount
     AND (SELECT COUNT(*) FROM ledger_entries e2
           WHERE e2.type = 'member_payment' AND e2.reverses_entry_id IS NULL
             AND e2.period_id = e.period_id AND e2.member_id = e.member_id
             AND e2.date = e.date AND e2.amount = e.amount AND e2.rowid <= e.rowid)
       = (SELECT COUNT(*) FROM payments p2
           WHERE p2.period_id = payments.period_id AND p2.member_id = payments.member_id
             AND p2.date = payments.date AND p2.amount = payments.amount AND p2.rowid <= payments.rowid)
);

CREATE UNIQUE INDEX ux_payments_ledger_entry ON payments (ledger_entry_id) WHERE ledger_entry_id IS NOT NULL;

-- Once linked, the link never changes.
CREATE TRIGGER payments_ledger_link_locked BEFORE UPDATE OF ledger_entry_id ON payments
WHEN OLD.ledger_entry_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'the ledger link of a payment cannot change');
END;

CREATE TABLE payment_reversals (
  payment_id        TEXT NOT NULL UNIQUE REFERENCES payments (id),
  reversal_entry_id TEXT NOT NULL REFERENCES ledger_entries (id),
  reason            TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at        TEXT NOT NULL
);

CREATE TRIGGER payment_reversals_no_update BEFORE UPDATE ON payment_reversals
BEGIN
  SELECT RAISE(ABORT, 'payment_reversals are append-only');
END;

CREATE TRIGGER payment_reversals_no_delete BEFORE DELETE ON payment_reversals
BEGIN
  SELECT RAISE(ABORT, 'payment_reversals are append-only');
END;
`;
