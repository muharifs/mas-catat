# Mas Catat

Android app for the treasurer of a rotating savings group (*arisan*). It records weekly
member dues, the host payout of every meeting, and the group's cash — offline, on one
phone, with no backend and no account.

Built for one real user with real money, so the rules of the group are the spec. The UI
is Indonesian; the code, comments and commits are English.

> Status: feature-complete for the first real period, verified on the owner's phone
> through Expo Go. Not yet published as an APK.

## The domain, in short

A period has N members. The gathering rotates house to house, one host per week, until
every member has hosted once — then the period ends.

Every meeting, **every** member owes Rp15.000, the host included:

| | Amount | Note |
|---|---|---|
| Collected | 15.000 × N | every member, every meeting |
| Host receives | 10.000 × N | one host per meeting |
| Group cash grows by | 5.000 × N | the difference |

What makes this more than a sum:

- **Dues are a multiple of Rp15.000.** Partial payments are rejected; paying for two
  missed weeks at once is normal. Anything above the period's remaining dues becomes
  member credit and carries over to the next period.
- **Unpaid dues become debt.** When a member in debt is the host, the debt is offset
  against their payout — recorded as two ledger entries (payout and offset), never as
  one silently reduced number, so the report stays auditable.
- **The ledger is append-only.** A correction is a reversal entry plus a new entry with a
  change trail. Nothing is overwritten, ever.
- **Cash lives in three places:** Tunai (cash), Debit (bank/e-wallet) and Piutang (lent
  to members). Loans have no interest and no deadline, and a member can only repay up to
  what they still owe.
- **Money is integer rupiah.** No floating point anywhere.

## What it looks like

<!-- Screenshots: Beranda, Pembayaran, Riwayat, Laporan. -->
*Screenshots to follow.*

Thirty screens, grouped as four tabs — Beranda (today's work), Riwayat (the ledger),
Laporan (reports), Menu — plus the flows for payments, host payout, cash entries, loans,
member credit, period close, backup and restore.

## Design of the code

```
src/
  domain/   pure functions: dues, allocation, payout, offset, close, loans, CSV, schedule
  db/       expo-sqlite repositories + versioned SQL migrations (0001..0005)
  ui/       design system (tokens, components), Indonesian wording, display helpers
  app/      expo-router screens
```

The rule that holds this together: **the UI never computes money.** Every amount on
screen comes from a pure function in `src/domain` that has unit tests. The repositories
in `src/db` re-check the same invariants inside the write transaction, so a rule cannot
be bypassed by a screen that forgets it. Display concerns — wording, formatting, search
— stay in `src/ui`.

Correctness work beyond ordinary unit tests:

- **Randomised invariant tests** over generated scenarios: cash in minus cash out always
  equals Tunai + Debit, member remaining loan is never negative, a period cannot close
  with an unpaid host.
- **Backup and restore tests** against real migration output, including restoring a
  backup taken before a later migration existed.
- **Font and truncation QA tests** that fail if a `Text` has no explicit `fontFamily`, or
  if a label would be cut off at the system's larger font sizes.

## Stack

Expo SDK 58 (managed) · React Native 0.88 · TypeScript (strict, `noUncheckedIndexedAccess`)
· expo-router · expo-sqlite (sql.js in tests) · Jest.

## Running it

```bash
npm install
npm start          # then open in Expo Go on an Android phone
```

```bash
npm test           # 70 suites
npm run typecheck
npm run lint
```

The database is created and migrated on first launch; there is nothing to configure.

## Notes for the curious

- **Why no backend?** One treasurer, one phone, no internet needed at the gathering. One
  phone is active at a time; moving phones means backup, restore, and stop using the old
  one. Data is never merged — a merge of two divergent ledgers has no correct answer.
- **Why plain SQL migrations?** Five migrations have already run on real data. A
  versioned list of SQL statements is something I can read, test, and reason about years
  from now.
- **Why the design system?** It started as a type scale and a colour check (the brand
  teal fails AA against white, so a darker shade carries white text), and became the
  cheapest way to keep thirty screens consistent and readable at large system font
  sizes.

`CLAUDE.md` holds the domain rules as the source of truth; `PROJECT.md` is the plan and
the decision log.

## License

No license yet — all rights reserved. Ask if you would like to reuse something.
