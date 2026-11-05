// Migration 2: adds the kas pos (account) to the ledger. NEVER edit this file after it ships.
//
// account is nullable on purpose: entries written before this migration (host payouts and offsets from M2)
// have no pos, and the ledger is append-only, so they cannot be back-filled. M4 writes it on member
// payments (tunai or debit); M5 will fill it for payouts, transfers and loans.
// ALTER TABLE ... ADD COLUMN does not fire the append-only triggers (they only watch UPDATE and DELETE).
export const sql = `
ALTER TABLE ledger_entries ADD COLUMN account TEXT
  CHECK (account IS NULL OR account IN ('tunai', 'debit', 'piutang'));
`;
