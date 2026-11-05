// Public entry of the persistence layer. UI code (later milestones) imports from "@/db".
// openDatabase is NOT re-exported here on purpose: it loads the native expo-sqlite module, so tests import
// repositories from this file without touching native code. Import it from "@/db/openDatabase" in the app.
import type { Db } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { createCreditsRepo } from './credits';
import { createExportsRepo } from './exports';
import { createLedgerRepo } from './ledger';
import { createMembersRepo } from './members';
import { createPaymentsRepo } from './payments';
import { createPeriodsRepo } from './periods';
import { createReportsRepo } from './reports';
import { createWeeksRepo } from './weeks';

export type { Db } from './db';
export { RepositoryError, MigrationError } from './errors';
export type { RepoDeps } from './deps';
export type { Member } from './members';
export type { Period, PeriodMember, CreatePeriodInput } from './periods';
export type { Week } from './weeks';
export type { RecordPaymentInput, RecordedPayment } from './payments';
export type { StoredLedgerEntry, AppendEntryInput, SettledHost } from './ledger';
export type { RefundableCredit, MemberCarryOver } from './credits';
export type { KasReport, PeriodReport } from './reports';
export type { LedgerExportRow, PaymentExportRow, MeetingDueExportRow, PeriodExportRow } from './exports';

export function createRepositories(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    members: createMembersRepo(db, deps),
    periods: createPeriodsRepo(db, deps),
    weeks: createWeeksRepo(db, deps),
    payments: createPaymentsRepo(db, deps),
    ledger: createLedgerRepo(db, deps),
    credits: createCreditsRepo(db, deps),
    reports: createReportsRepo(db, deps),
    exports: createExportsRepo(db, deps),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
