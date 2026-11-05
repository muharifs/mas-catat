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
- The host is picked per meeting, not at period creation: only the current (oldest open) and the next week can be given a host, each member exactly once, and a week cannot be closed without a host. The meeting date is set together with the host (default 7 days after the previous meeting); later meetings keep estimated dates 7 days apart. Breaks (e.g. Ramadan) carry no dues: the week simply stays open. In the UI a "week" is shown as "Pertemuan".
- Payments are separate records (member, date, amount), may be advance or late, and are allocated to weekly dues. Every payment MUST be a positive multiple of Rp15.000 (e.g. absent 2 weeks pays 30.000); partial payments are rejected. A payment above the remaining dues of the period is accepted and the excess is member credit, carried over to the member's next period as advance dues. The payment form warns before saving when part or all of a payment becomes credit. Credit may be a non-multiple of Rp15.000 (e.g. after a capped host offset), so carry-over can settle part of a week. If the member does not join the next period, the credit is refunded with one append-only cash-out entry.
- Lump-sum payments are allocated to the oldest unpaid week first; each payment keeps its own date/week so the UI can show when it was actually paid.
- Host payout offset covers the host's unpaid weeks so far (oldest first), capped at the payout (10.000 x N); any debt beyond the cap stays as debt. Recorded as a separate entry.
- Every meeting (week), EVERY member (including that meeting's host) owes Rp15.000.
  - Total collected = 15.000 x N.
  - Host receives 10.000 x N.
  - Group cash (kas) increases by 5.000 x N.
- If a member has not paid, the unpaid amount stays as a debt entry. When that member
  is the host, the debt is offset against the payout. Record it as TWO ledger entries
  (payout and offset), never as one silently reduced number, so reports stay auditable.
- At period close, unpaid member debt is written off and absorbed by kas: one append-only write-off entry per member (no carry-over). Reports distinguish actual kas (Tunai+Debit) from expected kas (actual + outstanding dues - member credit held). Credit money enters Tunai/Debit when received and is shown as a separate liability line ("Titipan kredit anggota").
- Kas is split into pos: Tunai (cash), Debit (bank/e-wallet), Piutang (lent to members). Cash out also covers shared goals (e.g. tour).
- Transfers between Tunai and Debit go in either direction (one transfer entry). Piutang has no interest or deadline; repayments go into Tunai. Shared-goal spending is a plain cash-out entry with a note.
- Ledger is append-only. Corrections of closed weeks are reversal + new entry with a change trail; never overwrite.
- App name: Mas Catat, icon: small book. Tested on the owner's phone via Expo Go (no APK yet).
- Ledger: cash in / cash out entries, each with date, amount, type, member, week, note.
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
- Small steps, run tests/lint after each change, report real results.
- Ask before destructive actions (deleting data, resetting the database, force push).
- Never commit secrets.
