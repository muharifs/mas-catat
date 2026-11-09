# Step M DB review (database-engineer, 2026-11-09) - condensed for the developer brief

Migration 0005 (new file src/db/migrations/0005_member_archive.ts + index.ts entry; never edit 0001-0004):
  ALTER TABLE members ADD COLUMN archived_at TEXT CHECK (archived_at IS NULL OR length(trim(archived_at)) > 0);
  Optional triggers: members_archive_not_in_active_period (BEFORE UPDATE OF archived_at, RAISE if member in an active period);
  period_members_no_archived (BEFORE INSERT ON period_members, RAISE if member archived). No index, no FK change, no table rebuild.

Backup/restore: older v4 backups are migrated forward on the in-memory copy (inspectHeader only rejects > LATEST_VERSION; reference schema from MIGRATIONS.slice). No code change needed in backup.ts; add tests:
 v4 file -> restore -> user_version 5, archived_at NULL, no schema diff; fresh v5 fingerprint == v4 migrated to v5 (L2 guard); v6 -> version_newer; v5 with archived member round-trips. Phone: restore a pre-0005 backup once on the new build before M7b.

Hard delete: "no data" == no period_members row (only direct FK; all others go through composite FK to period_members, which is append-only). Still assert none in ledger_entries, payments, allocations, offset_credits, credit_applications, weeks.host_member_id. Check + DELETE in ONE db.transaction, changes===1. FKs are ON (migrate.ts); add a test that raw DELETE of a member with period_members fails.

Archive guard (all reads via tx, same transaction as UPDATE ... WHERE archived_at IS NULL):
 in active period (period_members JOIN periods status='active'); loan remaining > 0 (ledger loadLoanBalance -> domain loans); credit > 0 (sum loadAvailableCredit over every period of the member; any value > 0 blocks, may be non-multiple of 15.000).
 Pure domain assertCanArchive({inActivePeriod, loanRemaining, creditHeld}) with fixed reason order; canHardDelete. Archive twice idempotent; unarchive = set NULL.

Queries: DO NOT filter repos.members.list() (used as name lookup in ~15 places -> blank names). Add archivedAt to Member type and a listActive().
 Filter: members/index.tsx (separate collapsed "Diarsipkan" section with "Aktifkan lagi"), periods/new.tsx selection + "Pilih semua", Beranda memberCount for firstRunChecklist; periods.create rejects archived ids inside its transaction.
 Do NOT filter: reports, period/meeting detail, payments, payout, close, riwayat, kas/[entryId], filter-riwayat, credits, loans (+ repayCandidates in kas/new), CSV export, getById, getMembers, backup summary, backupReminder member count.
healthCheck: add invariant archived_member_in_active_period. CSV: no new column.

Risks: HIGH global filter of list(); HIGH check and write not in one transaction. MEDIUM archived member regains a loan via repayment reversal (allowed; keep visible in Pinjaman). Acceptance tests 1-19 in the full report (migration, backup, repository, domain, UI).

Owner decisions: (a) archived name stays reserved; (b) archived member may regain a loan via repayment reversal; (c) triggers or column only.
