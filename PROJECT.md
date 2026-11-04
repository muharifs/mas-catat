# Mas Catat (codename: Kang Admin) - Project Plan

Last updated: 2026-11-04. Estimates are rough ranges, not commitments.

## 1. Goal and scope
Offline Android app to record weekly member dues and cash flow for a rotating-gathering group.
Single user. Data stays on the phone.

In scope (v1): members, periods, weekly rotation, dues recording, debt, host payout with offset,
kas (cash) ledger, reports, CSV export, APK build.
Out of scope (v1): backend, multi-user, login, online sync, public web dashboard.
Phase 2: Google Sheets export / public read-only report.

## 2. Approval gates (owner stays in control)
Before each milestone starts, the PM posts: what will be built, which files will be created or changed,
and what is NOT touched. Work starts only after the owner replies "approved".
After each milestone: summary of changes, test results, and a git commit the owner can review or revert.
No milestone is marked done without evidence (tests passing, app screenshot, or owner confirmation).
Destructive actions (reset DB, delete files, force push) always need a separate yes.

## 3. Milestones and tasks
| ID | Milestone | Deliverable / done when | Est. | Depends on | Status |
|----|-----------|--------------------------|------|-----------|--------|
| M0 | Project setup | Expo + TypeScript strict + lint + git repo, app runs on phone via Expo Go | 0.5-1 day | - | Done (2026-11-05) |
| M1 | Domain logic | Pure functions in src/domain/ (dues, payout 10.000xN, kas 5.000xN, debt, offset) with unit tests passing | 1-2 days | M0 | Not started |
| M2 | Database | expo-sqlite schema + versioned migrations; repository layer; tests | 1-2 days | M1 | Not started |
| M3 | Members and periods | Add/edit members, create period, editable host schedule per week, start/end period | 2-3 days | M2 | Not started |
| M4 | Dues and payments | Record flexible payments (advance, late, partial), allocate to weekly dues, show per-member balance and arrears | 2-3 days | M3 | Not started |
| M5 | Payout and kas ledger | Host payout, offset against debt as two entries, kas in/out across pos (Tunai, Debit, Piutang), transfers, shared-goal cash-out, corrections with change trail | 2-3 days | M4 | Not started |
| M6 | Reports | Per-member history, per-week summary, kas balance, period summary | 2 days | M5 | Not started |
| M7 | Backup and export | CSV export (share sheet), local backup/restore of the database | 1-2 days | M6 | Not started |
| M8 | Phone test | Runs on the owner's phone via Expo Go, smoke test of a full week cycle (APK deferred) | 1 day | M7 | Not started |
| P2 | Google Sheets | Export/publish read-only report | TBD | M8 | Backlog |

Total v1 estimate: about 2-3 weeks of part-time work (assumption: a few hours per day).

## 4. Risks and assumptions
- Owner is new to React Native: first milestones may run slower; agents explain RN specifics.
- Money must be integer rupiah; floating point bugs are the main correctness risk. Mitigation: M1 tests first.
- Phone-only storage: losing the phone loses data. Mitigation: M7 backup/export.
- Assumption: the host also pays Rp15.000 in their own week.
- Flexible payments (advance/late/partial) are the main modelling risk; M1 must define allocation rules with tests before any UI.
- Assumption: Expo managed workflow is enough (no custom native code).
- Expo Go is for testing only; if the app is to be used long-term, an APK build will be needed later.

## 5. Decisions
Decided (owner, 2026-11-04):
- Rotation order is NOT fixed: the host of a week can be changed on member request (until that week is closed).
- No leaving mid-period: a member must finish the period. N is fixed per period. Legacy mid-period exits are out of scope.
- Payments are per individual and flexible: a member may pay several weeks at once (advance), may pay late
  (absent that week, pays next week), and amounts may differ. So payments are separate records that are
  allocated to weekly dues, not a simple paid/unpaid flag.
- Host payout is 10.000 x N regardless of who has paid so far; the host's debt is offset as a separate entry.
- Offset scope: ALL of the host's unpaid weeks so far (not only that week).
- Lump-sum allocation: automatically to the oldest unpaid week first; each payment keeps the week/date it was actually made, so the owner can see when it was paid.

- Kas is split into pos (accounts): Tunai (cash), Debit (bank/e-wallet), and Piutang (money lent to members).
- Kas out also happens for shared goals decided together (e.g. group tour), not only host payout.
- Closed weeks CAN be corrected, with a change trail: ledger is append-only; a correction is a reversal + new entry
  (or an edit log), never a silent overwrite.
- App name: Mas Catat. Icon: small book. Testing on the owner's own phone via Expo Go; APK build is deferred.

- Transfers between pos are allowed in any direction between Tunai and Debit (one transfer entry).
- Piutang (member loans): no interest, no deadline; repayment goes into Tunai.
- Shared-goal spending (tour): a plain cash-out entry with a note, no budget or categories.

Still open: none for v1. New questions will be added here as they come up.

## 6. Progress log (newest first)
- 2026-11-05: M0 CLOSED. Owner confirmed the app runs in Expo Go via QR code. Evidence: lint, typecheck and tests pass (commit 3a9899c) plus owner confirmation on phone. Next: M1 (domain logic) proposal, waiting for owner "approved". Still open: .claude/settings.json deletion not confirmed, left uncommitted.
- 2026-11-05: M0 configured locally. Scaffold uses expo-router (App.tsx and index.ts removed on purpose, owner confirmed). Fixed npm ERESOLVE by pinning react-dom 19.3.0 to match react 19.3.0, installed eslint + eslint-config-expo with eslint.config.js, and moved jest/jest-expo/@types/jest to devDependencies only. Results: `npm run lint` clean, `npm run typecheck` clean (strict + noUncheckedIndexedAccess), `npm test` 1/1 passing (smoke test only). Dev server started with `expo start --lan`. NOT done yet: owner has not confirmed the app opens in Expo Go, so M0 is not marked done. Open question: .claude/settings.json is deleted in the working tree; owner has not confirmed this is intended, so it is left out of the commit.
- 2026-11-04: Owner answered the pos questions (transfers, Piutang, tour spending) and confirmed Node/npm are installed on the laptop. All v1 rules are specified. Waiting for the Expo project to exist on the laptop to start M0 configuration.
- 2026-11-04: Owner decided kas pos, shared-goal cash-out, correctable weeks with trail, app name Mas Catat, phone testing via Expo Go.
- 2026-11-04: Owner decided offset scope (all unpaid weeks) and lump-sum allocation (oldest first, payment week stays visible). M1 rules are now fully specified except closed-week corrections.
- 2026-11-04: M0 approved by owner. Blocked: npm registry returns 403 from the assistant's workspace and the laptop shell, so the Expo project cannot be generated remotely. Owner runs the scaffold command locally; assistant then reviews and configures.
- 2026-11-04: Owner answered rotation, leaving, and payment questions; plan updated.
- 2026-11-04: Plan drafted. CLAUDE.md written. Waiting for owner approval of M0 and answers to open decisions.
