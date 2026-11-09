# Mas Catat (codename: Kang Admin)

Android app (React Native + Expo + TypeScript) for recording weekly member dues
and cash flow of a rotating-gathering group (arisan-style). Single user (the owner),
offline-first, no backend.

Expo/React Native rules live in AGENTS.md. Read it, and the matching Expo docs, before touching Expo or RN code.

## Language rules
- UI text: Indonesian.
- Code comments, identifiers, commit messages, docs in code: English.

## Domain rules (source of truth)
- A period has N members. The gathering rotates house to house, one host per week,
  until every member has hosted once, then the period ends.
- Host of a week can be changed on member request (until the week is closed). No member leaves mid-period; N is fixed.
- Removing a member: a member with no data at all (never in a period, no ledger, payment, loan or credit record) may be hard-deleted after confirmation. A member with any history is archived instead, never deleted: hidden from the member list and from new-period selection, history and reports stay intact, and archiving can be undone. Archiving is rejected while the member is in the active period, has a remaining loan, or holds credit (repay or refund first). Checked in domain and repository.
- The host is picked per meeting, not at period creation: only the current (oldest open) and the next week can be given a host, each member exactly once, and a week cannot be closed without a host. The meeting date is set together with the host. Meetings are on Tuesdays (a constant in `src/domain/schedule.ts`): the default date is the Tuesday closest to 7 days after the previous meeting (after a Wednesday +6 days, after a Monday +8, after a Saturday +10); later meetings keep estimated dates the same way; the first meeting defaults to the nearest Tuesday on or after today; chosen dates stay editable and stored dates are never rewritten. Breaks (e.g. Ramadan) carry no dues: the week simply stays open. In the UI a "week" is shown as "Pertemuan".
- Payments are separate records (member, date, amount), may be advance or late, and are allocated to weekly dues. Member payments always go into Tunai (money reaches Debit via a Kas transfer). Every payment MUST be a positive multiple of Rp15.000 (e.g. absent 2 weeks pays 30.000); partial payments are rejected. A payment above the remaining dues of the period is accepted and the excess is member credit, carried over to the member's next period as advance dues. The payment form warns before saving when part or all of a payment becomes credit. Credit may be a non-multiple of Rp15.000 (e.g. after a capped host offset), so carry-over can settle part of a week. If the member does not join the next period, the credit is refunded with one append-only cash-out entry (type `credit_refund`, from Tunai or Debit, the whole remaining credit). In the UI, member credit is called "Titipan" (code identifiers stay credit).
- Lump-sum payments are allocated to the oldest unpaid week first; each payment keeps its own date/week so the UI can show when it was actually paid.
- Host payout offset covers the host's unpaid weeks through the current meeting (oldest open meeting, or the last when all are closed; oldest weeks first), capped at the payout (10.000 x N); any debt beyond the cap stays as debt. Recorded as a separate entry.
- Every meeting (week), EVERY member (including that meeting's host) owes Rp15.000.
  - Total collected = 15.000 x N.
  - Host receives 10.000 x N.
  - Group cash (kas) increases by 5.000 x N.
- If a member has not paid, the unpaid amount stays as a debt entry. When that member
  is the host, the debt is offset against the payout. Record it as TWO ledger entries
  (payout and offset), never as one silently reduced number, so reports stay auditable.
- At period close, unpaid member debt is written off and absorbed by kas: one append-only write-off entry per member (type `debt_writeoff`, no carry-over). Before writing off, the member's own credit settles that member's arrears (oldest first). Closing requires every meeting closed and every host paid (a corrected payout counts as unpaid). Reports distinguish actual kas (Tunai+Debit) from expected kas (actual + outstanding dues - member credit held). Credit money enters Tunai/Debit when received and is shown as a separate liability line ("Titipan anggota").
- Kas is split into pos: Tunai (cash), Debit (bank/e-wallet), Piutang (lent to members). Cash out also covers shared goals (e.g. tour).
- Transfers between Tunai and Debit go in either direction (one transfer entry). Piutang has no interest or deadline; repayments go into Tunai (not subject to the multiple-of-Rp15.000 rule). Shared-goal spending is a plain cash-out entry with a note. With no active period, kas entries go to the latest closed period (a loan repayment or a named old loan to the active period if the member is in it, otherwise the latest period containing the member; new loans only for members of the active period; with no period at all, reject).
- Loans are tied to members: remaining loan = lent - repaid over ALL periods after corrections (a reversal counts by its original's type). Only a member with remaining > 0 can repay, any positive amount up to the remaining (partial allowed), checked in domain and repository inside the write transaction (`src/domain/loans.ts`). An opening balance in Piutang MUST name the member and counts as that member's old loan; in Tunai/Debit it has no member. Reversing a loan or a named old loan is rejected when the member's remaining would go negative (correct the repayment first); reversing a repayment is always allowed. Old unnamed Piutang opening balances and old repayments above the loan are never migrated: they show in the Pinjaman list ("Saldo awal tanpa nama", "Kelebihan bayar"), cannot be repaid, and do not block backup or restore. Sum of member remaining + unnamed opening = Piutang balance. In the UI loans are "Pinjaman", screens `loans/`.
- Ledger is append-only. Corrections of closed weeks are reversal + new entry with a change trail; never overwrite. Append-only applies to normal use, not to a restore from a backup or to "Mulai dari nol": those replace ALL data on purpose (a verified safety copy is made first). One phone is active at a time (to move phones: backup, restore on the new phone, stop using the old one); data is never merged, ever.
- App name: Mas Catat, icon: small book. Tested on the owner's phone via Expo Go (no APK yet).
- Ledger: cash in / cash out entries, each with date, amount, type, member, week, note. The week is NULL on member_payment entries (one payment can span weeks; the detail lives in allocations).
- Money is stored as integer rupiah. Never use floating point.

## Technical decisions
- Expo (managed) + TypeScript strict. Navigation: expo-router.
- Local storage: expo-sqlite. Plain SQL migrations, versioned.
- Business rules (dues, payout, kas, offset) live in pure functions in `src/domain/`
  with unit tests. UI never computes money itself.
- Phase 2: export report to Google Sheets (CSV first, API later). Public read-only report.
- Do not add a backend unless the owner asks.

## Owner context
- Intermediate web developer (React, Vite, TypeScript, Django). New to React Native.
- When using React Native specifics, briefly explain how they differ from React web.

## Working rules
- Owner approval gates: before each milestone in PROJECT.md, state what will be built and which
  files will be created/changed; start only after the owner says "approved". After it, summarize
  changes and test results and make a reviewable git commit.
- PROJECT.md is the plan and progress log; update it, do not create copies.
- Coordination (owner decision 2026-11-09): every task for project-manager, fullstack-developer, ui-ux-designer, database-engineer and qa-tester goes through the `asisten-utama` agent. The main session does not brief those agents directly.
- Small steps, run tests/lint after each change, report real results.
- Ask before destructive actions (deleting data, resetting the database, force push).
- Never commit secrets.
