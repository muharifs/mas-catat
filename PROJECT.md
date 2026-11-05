# Mas Catat (codename: Kang Admin) - Project Plan

Last updated: 2026-11-06 (M2, M3, M4, M3b, M5a, M5b, M5c verified on the owner's phone; M5d and M6 implemented, not yet verified on the phone). Estimates are rough ranges, not commitments.

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
| M1 | Domain logic | Pure functions in src/domain/ (dues, payout 10.000xN, kas 5.000xN, debt, offset) with unit tests passing | 1-2 days | M0 | Done (2026-11-05) |
| M2 | Database | expo-sqlite schema + versioned migrations; repository layer; tests | 1-2 days | M1 | Done (2026-11-05); expo-sqlite adapter verified on the owner's phone (Expo Go), migrations 0001-0003 ran there |
| M3 | Members and periods | Add/edit members, create period, editable host schedule per week, start/end period | 2-3 days | M2 | Done (2026-11-05); verified on the owner's phone via Expo Go (earlier trial, then the combined checklist on 2026-11-05) |
| M4 | Dues and payments | Record payments (advance or late, always multiples of Rp15.000), allocate to weekly dues, show per-member balance and arrears, warn before saving when part of a payment becomes credit, payment money enters Tunai/Debit on receipt; "Tutup minggu"; migration 0002 (ledger account) | 2-3 days | M3 | Done (2026-11-05); verified on the owner's phone via Expo Go (combined checklist, 22 steps), migration 0002 ran there |
| M3b | Meetings and host selection | Hosts chosen per meeting within a two-meeting window instead of a fixed order set at creation; meeting date set with the host; "Minggu" renamed "Pertemuan" in the UI; no migration (decisions in section 5) | 1-2 days | M4 | Done (2026-11-05); verified on the owner's phone via Expo Go (combined checklist) |
| M5a | Payout and kas ledger | Host payout + offset as two entries (works on an already CLOSED week; offset uses arrears at payout time), kas ledger across pos (Tunai, Debit, Piutang) with opening balances, transfers, loans and repayments, shared-goal cash-out, corrections by reversal with change trail, migration 0003, strict amount parser | 1.5-2 days | M4 | Done (2026-11-05); verified on the owner's phone via Expo Go (combined checklist), migration 0003 ran there |
| M5b | Period close and credit | Write-off (one entry per member), pre-close screen, credit carry-over, credit refund entry, migration 0004, and blocking period close until every host is paid | 1-1.5 days | M5a | Done (2026-11-06); verified on the owner's phone via Expo Go (M5b checklist), migration 0004 ran there |
| M5c | UX fixes before M6 | Home with kas cards and one primary button, first-run checklist, DateField on 7 screens, payment amount chips (domain helper paymentChoices), "Kredit" wording becomes "Titipan" in the UI, toasts, loading/error states, Buat Periode defaults and redirect, Kas plus/minus colors; no migration, no money rule change | 1 day (estimate) | M5b | Done (2026-11-06); verified on the owner's phone via Expo Go (M5c checklist) |
| M5d | Revisions from real use | Alphabetical member lists, swipe-right instant Rp15.000 payment on Pembayaran, Tuesday meetings, member dues into Tunai only; no migration; domain additions sort.ts, swipe-pay.ts, MEETING_WEEKDAY | 1 day (estimate) | M5c | Implemented, not yet verified on the phone |
| M6 | Reports | Per-member history, per-meeting summary, kas balance, period summary, "Titipan anggota" line, expected kas = actual + outstanding dues - credit held. Note: carried-over credit stays in "Titipan anggota" until its meeting is closed | 2 days | M5 | Implemented, not yet verified on the phone |
| M7 | Backup and export | CSV export (share sheet), local backup/restore of the database | 1-2 days | M6 | Not started |
| M8 | Phone test | Runs on the owner's phone via Expo Go, smoke test of a full week cycle (APK deferred) | 1 day | M7 | Not started |
| P2 | Google Sheets | Export/publish read-only report | TBD | M8 | Backlog |

Total v1 estimate: about 2-3 weeks of part-time work (assumption: a few hours per day).

M5 status: M5 is split into M5a and M5b. M5a was approved by the owner ("approved M5a, ikut usul"), is implemented and was verified on the owner's phone on 2026-11-05 (together with M4 and M3b). M5b was approved by the owner ("approved m5b, ikut usul"), is implemented and was verified on the owner's phone on 2026-11-06 (migration 0004 included).

M5c status: M5c (UX fixes before M6) was approved by the owner ("approved M5c, ikut usul"), is implemented and was verified on the owner's phone on 2026-11-06, together with M5b.

M5d status: M5d (revisions from real use) was approved by the owner in the main session ("approved M5d, ikut usul") and is implemented, but NOT yet verified on the phone.

M6 status: M6 (Reports) was approved by the owner in the main session ("approved M6, ikut usul") and is implemented, but NOT yet verified on the phone. M5d is also still not verified on the phone. M7 is NOT approved and not started.

### M6 phone checklist (owner, Expo Go; not yet run)
1. Home has a "Laporan" link that opens the reports screen.
2. Tunai, Debit and total actual kas on the report equal the Kas screen.
3. Expected kas = actual kas + outstanding dues - titipan held; check the numbers by hand. "Dibayar di muka" is shown as an info row and is not part of the sum.
4. Pay more than the remaining dues: the "Titipan anggota" line appears. After carry-over into a new period, the line still shows the carried credit until that meeting is closed, then it leaves.
5. Per-meeting summary: check a fully paid meeting, a partly paid meeting, and a host meeting with offset (payout and offset shown separately; "Payout belum dibayar" is an info row).
6. Member history: order is correct, dates are the real payment dates, a corrected entry is labelled "dikoreksi" with its reason and is not counted in totals; payout, carry-in/out and settle events appear.
7. Period summary for the active period and for an ended period, including write-off, refund and a shared goal.
8. Period picker defaults to the active period, else the latest.
9. Member lists are in A-Z order.
10. The word "kredit" appears on no report screen (only "Titipan").

### M5d phone checklist (owner, Expo Go; not yet run)
1. Member lists are sorted alphabetically (case-insensitive) in all six places: Anggota, Pembayaran, Buat Periode, host choices, pre-close, Titipan.
2. Swipe right past the threshold on a Pembayaran row records Rp15.000 into Tunai and shows a toast naming the meeting.
3. A short swipe springs back and nothing is saved.
4. Vertical scrolling of the list still works.
5. Swipe is disabled for a fully paid member and for an ended period.
6. A member with arrears older than the current meeting gets the oldest meeting settled.
7. No "Bayar" button on the row; tapping the row opens the member detail.
8. "Catat pembayaran" has no pos choice and says Tunai.
9. "Bayar tuan rumah" still offers Tunai/Debit (default Tunai).
10. New period: the start date defaults to a Tuesday.
11. After a meeting is moved to a Wednesday, the default date of the next meeting is 6 days later.
12. Existing stored dates are unchanged.

### M5c phone checklist (owner, Expo Go; passed on 2026-11-06 together with M5b: "lolos semua lanjut")
1. Home: kas cards (Tunai, Debit, Piutang) show, and there is exactly one primary button for the current state.
2. First-run checklist shows on a fresh start and is hidden once an ended period or a closed meeting exists.
3. Anggota: the keyboard stays open while typing; the member count is right.
4. "Tutup pertemuan" with arrears: warning dialog only (not blocked); after closing, a toast appears.
5. Overdue-date text shows for past dates and does not show when the date is today.
6. DateField on all 7 screens: typing 20260104 becomes 2026-01-04; an invalid date shows a red error; shortcuts work; -1/+1/+7 buttons work on Pertemuan.
7. Pembayaran: "Bayar" button, amount chips, and the non-multiple arrears case (chip rounded down to a multiple of Rp15.000; the rest is settled first by the next payment).
8. Payment form warns "menjadi titipan" when part or all of a payment becomes credit.
9. Buat Periode: default name, last period's members pre-selected, "Pilih semua" and "Kosongkan" work, redirect after save (meeting 1 host screen, or Home when only 1 member).
10. Kas: plus/minus shown by color and by text sign.
11. Wording: the UI says "Titipan" and no longer shows the word "kredit".
12. Loading state and DB error screen with "Coba lagi".
13. Touch targets are 48 high; check with TalkBack.

### M5b phone checklist (owner, Expo Go; passed on 2026-11-06 together with M5c: "lolos semua lanjut")
1. App opens, migration 0004 runs, old data is intact, nothing breaks when there is no active period.
2. Period detail: "Akhiri periode" opens the new screen; with open meetings or an unpaid host the button is disabled with the reason (meeting number and host name).
3. Correct one payout: that meeting shows unpaid again; re-pay it: the button is enabled.
4. Close screen shows arrears before and after credit; an invalid end date (before start, or in the future) shows an Indonesian message and disables the button.
5. Press "Akhiri periode": two sequential dialogs; after "Ya, akhiri periode" it returns to the detail, the period is "Selesai", and Back does not reopen the close screen.
6. Kas menu: one "Penghapusan tunggakan" entry per member in arrears, no "tanpa pos" warning, balances unchanged, no Koreksi button.
7. Member with credit and arrears: credit settles arrears oldest first, per-meeting status shows "kredit".
8. Create a new period with a credit-holding member: "Kredit yang dibawa" preview; after save, meeting 1 and later are marked credit; 5.000 credit settles only part of a meeting; no new kas entry.
9. "Kredit anggota" menu from home: "Kembalikan uang" asks pos (Tunai/Debit) and date, no amount input; the confirmation shows amount, pos and date; after refund the pos balance drops, credit is 0, the entry is not correctable.
10. No active period: opening balance, transfer and shared goal can be recorded (they go to the latest period); a new loan is rejected; a loan repayment of a member outside the active period is accepted.
11. Correcting a kas entry of an ended period works; correcting a payment or payout of an ended period is still rejected.
12. Pay a host after meetings 1-2 are closed: the offset counts host arrears through the current meeting.

### M5a phone checklist (owner, Expo Go; passed on 2026-11-05 as part of the combined 22-step checklist: "lolos semua")
1. Opening the app after the update runs migration 0003 silently, with no error screen; old data is still there.
2. Kas screen: balances of Tunai, Debit and Piutang match what is expected from existing payments.
3. Opening balance per pos can be entered; amount fields show the parser hints; commas are rejected, "15.000" and "15000" are accepted.
4. Transfer Tunai to Debit and Debit to Tunai; loan to a member (Piutang); repayment goes into Tunai; shared-goal spending with a note.
5. "Koreksi" requires a reason; an entry cannot be corrected twice.
6. A payment can be corrected with "Koreksi" and then re-entered; weeks and credit shown are right afterwards.
7. "Bayar tuan rumah": the preview shows payout and offset as two lines; balance warnings appear but do not block; paying from Debit works.
8. Payout works on a CLOSED meeting, is not offered for a future meeting; after "Sudah dibayar" the payout can be corrected and paid again.
9. Old entries without a pos show "tanpa pos".
10. All user-visible texts say "Pertemuan" (no "Minggu").

### M3b phone checklist (owner, Expo Go; passed on 2026-11-05 as part of the combined 22-step checklist: "lolos semua")
1. Old period is still complete with the same hosts and dates, and texts say "Pertemuan N".
2. In an old period, "Ubah" appears only on the first two open meetings; picking a member who holds another meeting shows a swap confirmation and the result is right.
3. New period: no Naik/Turun buttons, estimated date preview is shown, all hosts are "Belum ditentukan".
4. "Tutup pertemuan" is disabled without a host; an invalid date, or a date not after the previous meeting, shows an Indonesian message.
5. Pick hosts for meetings 1 and 2; meeting 3 has no button. After closing meeting 1, meeting 3 can be set. Members who hosted a closed meeting are not offered.
6. 3-member period: the third meeting is auto-filled after two hosts are chosen.
7. Change the date of meeting 2: later meetings shift by 7 days. A payment is still possible while the host is undecided.
8. All user-visible texts use "Pertemuan" (no "Minggu" left).

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
- Offset scope: ALL of the host's unpaid weeks so far (not only that week), oldest first, capped at the payout (10.000 x N). Debt beyond the cap stays as debt.
- Lump-sum allocation: automatically to the oldest unpaid week first; each payment keeps the week/date it was actually made, so the owner can see when it was paid.

- Kas is split into pos (accounts): Tunai (cash), Debit (bank/e-wallet), and Piutang (money lent to members).
- Kas out also happens for shared goals decided together (e.g. group tour), not only host payout.
- Closed weeks CAN be corrected, with a change trail: ledger is append-only; a correction is a reversal + new entry
  (or an edit log), never a silent overwrite.
- App name: Mas Catat. Icon: small book. Testing on the owner's own phone via Expo Go; APK build is deferred.

- Transfers between pos are allowed in any direction between Tunai and Debit (one transfer entry).
- Piutang (member loans): no interest, no deadline; repayment goes into Tunai.
- Shared-goal spending (tour): a plain cash-out entry with a note, no budget or categories.

Decided (owner, 2026-11-05):
- A payment made when every week is already settled (e.g. by a host offset) is still accepted and becomes credit. The payment form warns before saving whenever part or all of a payment will become credit.
- Credit left when a member does not join the next period is refunded to the member: one append-only cash-out entry when the money is handed over.
- Credit money enters Tunai/Debit when received, so balances match the physical money. Reports show a "Titipan anggota" line, and expected kas = actual kas + outstanding dues - credit held.

Decided (owner, 2026-11-05, M3 proposal "approved, ikut usul"):
- End period in M3 only sets status='closed' and end_date, and only when every week is closed (periods.close rejects otherwise). Write-off, the pre-close screen and leftover credit wait for M5; the detail screen says so.
- Duplicate member names are rejected (exact match, case-insensitive, also on rename).
- Only one active period at a time: creating a new one while one is active is rejected.
- No delete/deactivate member in M3.
- The close-week button is built in M4, so "Akhiri periode" is not practically usable on the phone until M4.

Decided (owner, 2026-11-05, M4 proposal "approved m4 ikut usul"):
- Close week: only the oldest open week, in order, with no payout requirement. Weeks can therefore be closed before the host is paid; M5 must allow payout on a closed week, and the offset uses the host's arrears at payout time.
- Arrears are counted through the "current week" = the oldest open week (not the phone clock). Later weeks count as prepaid. When every week is closed, the last week is the current week.
- Receiving pos is chosen on the payment form: Tunai or Debit, default Tunai. (Replaced in M5d for member payments: they always go to Tunai, see the M5d decisions.)
- Payment date may be in the past or today, never in the future.
- Payments to an ended period are rejected (closes a gap in payments.record).
- Wrong payments cannot be corrected until M5; the risk is accepted, the confirmation screen is the safeguard.
- A payment above the remaining dues, even when every week is settled, is accepted as credit with a warning (decided earlier).
- Plan changes: migration 0002 (nullable `account` column on ledger_entries, CHECK tunai/debit/piutang) moved from M5 to M4; the credit carry-over migration in M5 becomes 0003. The ledger `week` is NULL on member_payment entries (one payment can span weeks; the week detail lives in `allocations`). Credit stays tied to one period in M4; carry-over stays in M5.

Decided (owner, 2026-11-05, M3b: "approved M3b, ikut usul tampilan minggu diganti pertemuan pada poin 9"):
1. Creating a period needs only name, start date and members. Host order is not set up front; all weeks start with host NULL.
2. Only the current meeting (oldest open) and the next one can be given a host. Later meetings show "Belum ditentukan". Choices are limited to members who have not had a turn.
3. A meeting cannot be closed without a host.
4. The last meeting is auto-assigned when one member and one meeting remain.
5. The two-week swap UI is replaced by re-picking the host of an open meeting within the window.
6. Existing periods keep their full schedule; stored data is unchanged. The window limit applies to changes only. Picking a member who holds another open meeting exchanges the two hosts atomically. Members who hosted a closed meeting are never selectable.
7. Dues are per meeting. No dues during a break; there is no "libur" button, the owner simply does not close the meeting. Total dues and payout are unchanged.
8. The meeting date is set together with the host, default 7 days after the previous meeting, changeable only while open and within the window. Later open meetings keep estimated dates, shifting 7 days from the last chosen date. The date must be real and later than the previous meeting. Dates of closed meetings never change. Payment dates are unrelated; payments during a break are allowed.
9. UI wording "Minggu" becomes "Pertemuan" everywhere user-visible. Code identifiers stay week/weeks.

Developer assumptions in M3b, to be reviewed by the owner:
- The window is the first two open meetings by number.
- A meeting with a host counts as having a "chosen" date (not auto-shifted, so old periods are unchanged). Only open host-less meetings after the last hosted one shift by 7 days.
- Changing a date is rejected if it reaches the date of the next hosted meeting.
- No DB column distinguishes a chosen date from an estimated one.
- Meeting 1 has no lower date bound (not compared to the period start date).
- The swap also applies in new periods; the old slot becomes unassigned if the target had no host.
- swapHosts is kept in code but unused by the UI.
- weeks.close(number) also rejects a meeting without a host.
- A period with N=1 auto-assigns its only meeting.
- Expo docs for nested dynamic routes were inferred from existing screens, not re-read.

Decided (owner, 2026-11-05, M5a: "approved M5a, ikut usul"):
- M5 is split. M5a = payout + offset, kas ledger across pos, corrections, migration 0003, strict amount parser. M5b = write-off, pre-close screen, credit carry-over, credit refund, migration 0004.
- M5b decision: closing a period is BLOCKED until every host has been paid.
- Opening balance is recorded as an `opening_balance` entry per pos (Tunai, Debit, Piutang) and is corrected by reversal like any other entry.
- Host payout is allowed only for the current meeting or a closed meeting (not a future one).
- Balance warning compares the amount with net cash out and never blocks saving.
- Corrections (reversal) are only possible in the active period.
- Loans (Piutang) are only for members of the active period.
- Transfers, loans and opening balances attach to the active period and cannot be recorded when no period is active.
- Commas are rejected in amounts. The parser accepts only plain digits or correctly grouped thousands with dots (e.g. 15000, 15.000).
- CLAUDE.md got one sentence: `week` is null on member_payment entries.

Developer assumptions in M5a, to be reviewed by the owner:
- The offset counts the host's arrears through the host's OWN meeting number, not through the current week.
- shared_goal and loan_repayment entries attach to the active period (period_id is NOT NULL); the member of a repayment must belong to the active period.
- Entries of a closed period cannot be corrected.
- Balance warnings are extended to transfers, loans, repayments and shared goals (not only payouts).
- Payments whose ledger backfill cannot find a match keep ledger_entry_id NULL and cannot be corrected.
- The reversal date is today (phone date).
- Reversal entries have their own type 'reversal'.

Decided (owner, 2026-11-05, M5b: "approved m5b, ikut usul"):
1. Payout offset counts the host's arrears through the CURRENT meeting (replaces the M5a assumption). Existing payouts are not recomputed.
2. Kas entries with no active period go to the latest closed period. A loan repayment goes to the active period if the member is in it, else to the latest period containing the member. New loans are only for members of the active period. With no period at all the entry is rejected with the Indonesian message "buat periode dulu".
3. At close, the member's credit first settles that member's own arrears; the rest of the arrears is written off; leftover credit is carried over or refunded.
4. Kas-type reversals (opening_balance, transfer, loan, loan_repayment, shared_goal) are allowed in closed periods and are recorded on the original entry's period. Payments, payouts, write-offs and refunds stay uncorrectable there (this replaces the M5a rule "entries of a closed period cannot be corrected" for kas types).
5. The limitation of an old fully scheduled period regarding breaks is left as is.
6. Period end date must not be before the start date and not in the future.
7. Carry-over uses credit from all closed periods.

Developer assumptions in M5b, to be reviewed by the owner:
- Offset uses max(paid meeting, current meeting).
- getCredit now returns net credit (after settlements, carry-over and refunds).
- Pre-close numbers are computed from closed meetings; open meetings are reported separately.
- credit_applications has created_at and no id, with CHECKs (settle_debt: same period; carry_over: cross period).
- Two extra shape triggers, for debt_writeoff and credit_refund entries.
- Close confirmation is two chained Alert.alert dialogs.
- After router.replace the nav stack may hold two period-detail screens, so Back returns to the older detail (data reloads on focus).
- The credits screen shows one row per (source period, member).
- Loan repayment on the kas screen offers all members; the repository decides the period or rejects.

Decided (owner, 2026-11-06, M5c: "approved M5c, ikut usul"):
1. Buat Periode pre-selects the members of the latest period.
2. UI wording "Kredit" becomes "Titipan". Code identifiers stay `credit`; the M6 report line was later renamed "Titipan anggota" (see the M6 decisions).
3. Closing a meeting that still has arrears only shows a warning (not a block).
4. No "libur" button.
5. No bottom tabs.
6. Amount chips for arrears that are not a multiple of Rp15.000 are rounded down through the domain helper `paymentChoices`; the remainder is settled first by the next payment (oldest-first allocation).

Decided (owner, 2026-11-06, M5d: "approved M5d, ikut usul"):
1. Member lists are displayed alphabetically, case-insensitive, in Anggota, Pembayaran, Buat Periode, host choices, pre-close and Titipan. The stored initial_order is untouched.
2. Pembayaran: swiping a row to the right records an instant Rp15.000 payment into Tunai, dated today, with a toast and no dialog. A wrong swipe is fixed through the existing correction on the member detail. Older arrears are allowed (oldest unpaid meeting first). The swipe is disabled when the member has no arrears through the current meeting or the period has ended (pure domain function `canSwipePay`). The "Bayar" button is removed; tapping the row opens the member detail.
3. Meetings are on Tuesday: constant MEETING_WEEKDAY in src/domain/schedule.ts, no setting screen. The start date of a new period defaults to the nearest Tuesday. The next default date and the estimates for later meetings are the Tuesday closest to 7 days after the previous date. Stored dates are never rewritten.
4. Member dues always go into Tunai. Debit is reached through a Kas transfer. "Bayar tuan rumah" keeps the Tunai/Debit choice, default Tunai. This replaces the M4 decision "pos chosen on the form" for member payments.
5. CLAUDE.md was updated accordingly (Tuesday rule, member payments to Tunai).

Developer assumptions in M5d, to be reviewed by the owner:
- The swipe toast is built from payments.preview just before record (not atomic; acceptable for a single user).
- Swipe is allowed when the remaining arrears is a non-multiple of Rp15.000.
- Buat Periode "Pilih semua" keeps the original data order.
- The member picker in kas/new.tsx is not sorted (out of scope).

Decided (owner, 2026-11-06, M6: "approved M6, ikut usul"):
1. Expected kas = actual kas + outstanding dues - credit held, exactly. "Dibayar di muka" is an info row outside the formula.
2. Outstanding dues count through the current meeting (oldest open), same as Home `getArrearsSummary`.
3. "Payout belum dibayar" for closed meetings is an info row outside the formula.
4. Actual and expected kas are global; summaries and histories are per period, defaulting to the active period, else the latest.
5. Corrected entries stay visible, labelled "dikoreksi" with the reason, and are excluded from totals.
6. The liability line is named "Titipan anggota" (CLAUDE.md wording already changed).
- Credit held = (a) available credit per source period + (b) carry_over credit on still-open meetings of the new period. settle_debt is not counted.

Implementation facts of M6:
- Created: src/domain/report.ts (+ report.test.ts), src/db/reports.ts (+ reports.test.ts), src/ui/reportLabels.ts (+ reportLabels.test.ts), src/ui/components/ReportLine.tsx, src/app/reports/index.tsx, src/app/reports/period/[id]/index.tsx, src/app/reports/period/[id]/meetings/[number].tsx, src/app/reports/period/[id]/members/[memberId].tsx.
- Changed: src/db/index.ts, src/app/_layout.tsx, src/app/index.tsx (one "Laporan" link), CLAUDE.md (wording only).
- No migration, dependency or app.json change.
- Repo tests run on sql.js, not the expo-sqlite adapter; the screens have not been tried on the phone.

Developer assumptions in M6, to be reviewed by the owner:
- Global outstanding dues and "Dibayar di muka" come only from the active period (ended periods already wrote off their debt).
- "Dibayar di muka" may overlap with carried-over credit (info only).
- "Payout belum dibayar" = gross 10.000 x N for closed meetings with a host and no effective payout, across all periods.
- Kas contribution per meeting is null ("Belum terealisasi") unless the meeting is fully paid.
- Net kas change = Tunai+Debit change of effective entries, without opening balance; the write-off is shown but not part of the net.
- Member Piutang loans are taken across all periods.
- Member history is extended with payout and carry-in/out/settle events.

Deferred UX (NOT done in M5c):
- Live payment preview without a dialog.
- Inline multiple errors.
- Host radio row beyond OptionRow.
- Single "Catat kas" button.
- App icon.
- Cleanup of other wording.
- Native date picker.
- Tabs.

Developer deviations and assumptions in M5c, to be reviewed by the owner:
- (a) Home without a host: the primary button is "Tentukan tuan rumah pertemuan N"; "Catat pembayaran" stays secondary (M3b allows paying before a host exists). "Bayar tuan rumah" and "Tutup pertemuan" are hidden until a host exists.
- (b) All meetings closed: the primary button is "Akhiri periode".
- (c) The row "Ubah tuan rumah / tanggal" and the link "Jadwal periode" are kept.
- (d) On the period detail, "Tutup pertemuan" and "Akhiri periode" use a secondary style with a red border; the final button on the close screen and the correction button stay solid red.
- (e) First period: no members are pre-selected.
- (f) After saving a period: go to the host screen of meeting 1, or to Home if there is only 1 member.
- (g) The first-run checklist is hidden when an ended period or a closed meeting exists. "Saldo awal terisi" means an opening_balance entry exists that has not been corrected.
- (h) Extra toasts: period saved, period ended, titipan refunded.
- (i) The overdue-date text is not shown when the date is today.
- (j) A Chip component was added outside the agreed list.
- (k) The number-pad DateField filters out non-digits.
- (l) The DB error screen title is now "Terjadi masalah".
- (m) CLAUDE.md gets one extra clause: the UI calls member credit "Titipan". (Noted here only; this PM did not edit CLAUDE.md. Check that the clause is actually in the file.)

Current state: M5c is implemented on top of M5b (npm test 413 passed in 21 suites; lint, typecheck clean; `expo export --platform android` bundles). Migration 0004 (M5b), the M5b screens and all M5c screens were then verified on the owner's phone (2026-11-06), since tests use sql.js and there are no automated UI tests. M5d and M6 were implemented afterwards (see the progress log); neither is verified on the phone.

## 6. Progress log (newest first)
- 2026-11-06: M6 (Reports) implemented by fullstack-developer after the owner approved in the main session ("approved M6, ikut usul"). Status "implemented, not yet verified on the phone"; M5d also stays "not verified on the phone". Decisions, implementation facts and developer assumptions are in section 5; the M6 phone checklist (10 items) is under the milestone table. Verified (real results): `npm test` 26 suites, 472 tests pass (was 23 suites, 435: +37 tests, no existing assertion changed); `npm run lint` clean; `npm run typecheck` clean; `npx expo export --platform android` bundles OK. No migration, dependency or app.json change. Tests run on sql.js, not the expo-sqlite adapter; the screens were not tried on the phone. Naming: "Titipan kredit anggota" became "Titipan anggota". Next: owner phone verification of M5d and M6; M7 starts only after owner approval.
- 2026-11-06: M5d implemented (owner approved in the main session: "approved M5d, ikut usul"), status "implemented, not yet verified on the phone". Scope: alphabetical member lists, swipe-right instant payment on Pembayaran, Tuesday meetings, member dues into Tunai only. Decisions and assumptions are in section 5; phone checklist (12 items) is under the milestone table. Verified (real results): `npm test` 23 suites, 435 tests pass (413 before + 22 new, none removed); `npm run lint` clean; `npm run typecheck` clean; `npx expo export --platform android` bundles OK (temp output, deleted). Files: new src/domain/sort.ts (+test), src/domain/swipe-pay.ts (+test), src/ui/components/SwipeRow.tsx; changed CLAUDE.md, src/domain/schedule.ts, src/db/periods.ts, src/ui/messages.ts, src/app/periods/[id]/payments.tsx, pay.tsx, src/app/periods/new.tsx, src/app/members/index.tsx, src/app/periods/[id]/meetings/[number].tsx, close.tsx, src/app/credits/index.tsx, and tests schedule.test.ts, repositories.test.ts, messages.test.ts. Changed assertions: fixtures moved from Sunday dates to Tuesday (Sunday+7 became +9) and date estimates shifted accordingly; the planAssignment test was split into a shift case and a no-change case. NOT verified on the phone: swipe feel and threshold, vertical scroll, toast, background label (no automated UI tests). M6 stays proposed, NOT approved. Next: owner phone check of M5d, then the M6 decision.
- 2026-11-06: Phone verification. Owner ran the Expo Go checklists for M5b (12 steps, including migration 0004 on expo-sqlite) and M5c (13 steps) and reported "lolos semua lanjut". Evidence: owner confirmation. Marked Done: M5b and M5c. HEAD at this point: 3b8c4b6, no code change. Next: the owner's small revisions are handled as a separate milestone (M5d) by the main session; M6 proposal awaits "approved M6".
- 2026-11-06: M5c implemented (owner approved: "approved M5c, ikut usul"), status "implemented, not yet verified on the phone"; M5b stays "not verified on the phone". Scope: UX fixes before M6 (Home, first-run checklist, DateField, amount chips, "Titipan" wording, toasts, loading/error states, Buat Periode, Kas colors). Decisions, deferred UX and developer deviations are in section 5; phone checklist is under the milestone table. Verified (developer's results): `npm test` 413 passed in 21 suites (was 376 in 17: +37 tests, +4 suites); `npm run lint` clean; `npm run typecheck` clean; `npx expo export --platform android` succeeded (1 Android bundle, 2.9 MB, output outside the project). No dependency, app.json, migration or money-rule change; the domain only gained `paymentChoices` and `daysBetween`. Old test whose assertions changed: only src/ui/errors.test.ts, 2 lines, the word "kredit" became "titipan". NOT verified: there are no automated UI tests, and none of the new screens has been tried on the phone. Next: owner phone check of M5b and M5c, then M6 proposal.
- 2026-11-05: M5b implemented (owner approved: "approved m5b, ikut usul"), status "implemented, not yet verified on the phone". Scope: period close screen with write-off (one entry per member), credit settling own arrears at close, carry-over to the next period, credit refund entry, migration 0004, close blocked until every host is paid, kas entries without an active period, kas-type reversals in closed periods. Decisions and developer assumptions are in section 5; phone checklist (12 items) is under the milestone table. Verified: `npm test` 376 passed in 17 suites (was 317 in 14); `npm run lint` clean; `npm run typecheck` clean; `npx expo export --platform android` bundles. NOT verified: migration 0004 on expo-sqlite and the new screens (periods/[id]/close, credits, carry-over preview in periods/new), since tests use sql.js. Note for M6: carried-over credit stays in "Titipan anggota" until its meeting is closed. M6 not started. Next: owner phone check of M5b, then M6 proposal.
- 2026-11-05: Phone verification. Owner ran the combined Expo Go checklist for M4, M3b and M5a (22 steps, including migrations 0002 and 0003 on the phone) and reported "lolos semua lanjut". Evidence: owner confirmation. Marked Done: M4, M3b, M5a; M2 and M3 phone notes resolved (the expo-sqlite adapter runs on the device). HEAD at this point: 536c825, no code change. Still open: owner answer on the payout offset range (through the host's own meeting vs through the current meeting; proposed: current meeting); M5b proposal awaits "approved M5b".
- 2026-11-05: Session checkpoint after M5a (e2d5946). Done in code: M0-M5a. NOT verified on the phone: M4, M3b, M5a, including migration 0003; owner has not sent these results yet. Open for the owner: (1) should the payout offset count arrears through the current meeting instead of through the host's own meeting (suggested: current meeting, to match "arrears at payout time"); (2) approve an M5b proposal. To cover in the M5b proposal: repaying a loan when the member is outside the active period, and recording kas entries with no active period; the order of credit versus reopened dues after a payment correction, especially at write-off; blocking period close until every host is paid. Known limit: an old fully scheduled period cannot express a break, because later meetings with hosts do not shift. Workflow: asisten-utama only coordinates, fullstack-developer writes code, project-manager updates this file, the main session reviews and commits. Next: owner phone results, then M5b proposal.
- 2026-11-05: M5a implemented (owner approved: "approved M5a, ikut usul"), status "implemented, NOT yet verified on the phone". Scope: host payout + offset, kas ledger across Tunai/Debit/Piutang, corrections by reversal, migration 0003, strict amount parser. Decisions and developer assumptions are in section 5; phone checklist is under the milestone table. Verified: `npm test` 317 passed in 14 suites (baseline 201 in 9); `npm run lint` clean; `npm run typecheck` clean; `npx expo export --platform android` bundled OK (about 2.8MB). Tests run on sql.js, so migration 0003 SQL on expo-sqlite is UNPROVEN until the phone. Existing tests whose assertions changed: migrate.test.ts (userVersion now MIGRATIONS.length), repositories.test.ts (settleHost account is now 'tunai' by default), payment-preview.test.ts (parseRupiahInput block rewritten for the strict parser). NOT verified: all M5a screens on the phone. M5b not started. M4 and M3b phone checks also remain unverified. Next: owner phone check (M3b, M4, M5a), then M5b proposal.
- 2026-11-05: M3b implemented (owner approved: "approved M3b, ikut usul tampilan minggu diganti pertemuan pada poin 9"), status "implemented, NOT yet verified on the phone". Decisions and developer assumptions are in section 5; phone checklist is under the milestone table. Files: CLAUDE.md, src/domain/schedule.ts (+test), src/db/periods.ts, weeks.ts, ledger.ts, repositories.test.ts, src/ui/errors.ts (+test), src/ui/meetingDate.ts (+test), src/app/index.tsx, _layout.tsx, periods/new.tsx, periods/[id]/index.tsx, periods/[id]/meetings/[number].tsx, pay.tsx, payments.tsx, members/[memberId].tsx. No migration, no app.json change, no dependency added. Verified: `npm test` 201 passed in 9 suites (was 156 in 8: +45 tests, +1 suite); `npm run lint` clean; `npm run typecheck` clean; `npx expo export --platform android` bundled OK (1 android bundle, about 2.7MB, output in a temp folder outside the project, removed). Test assertions changed: repositories.test.ts creation test now expects host [null x4]; three tests only had the param renamed from hostOrder to memberIds; the setup() fixture now writes a full schedule via SQL to mimic old periods; errors.test.ts four assertions "minggu" to "pertemuan" plus 10 new cases; schedule.test.ts moveItem/previewSchedule tests removed (functions removed) and replaced. NOT verified: the screens on the phone / Expo Go, and the expo-sqlite adapter for the new queries (tests use sql.js). M5 was proposed and split into M5a and M5b, still awaiting owner approval, nothing started. The owner's M4 phone check result has not been received. Next: owner phone check of M3b (and M4), then M5 approval.
- 2026-11-05: M4 implemented (owner approved: "approved m4 ikut usul"), status "implemented, NOT yet verified on the phone". Owner also reported that M3 was tried on the phone ("sudah saya coba di m3") with no problem reported on 2026-11-05, so the expo-sqlite adapter and the M3 screens count as working on a device; M4 itself and migration 0002 are not yet seen on the phone. Added: migration 0002 (ledger_entries.account), src/domain/payment-preview.ts (+ test: previewPayment, assertPaymentDate, weekState, parseRupiahInput), screens periods/[id]/payments.tsx (payment list with arrears flag), periods/[id]/members/[memberId].tsx (per-week status, payment history with real dates and settled weeks, "Catat pembayaran"), periods/[id]/pay.tsx (form: date, amount, Tunai/Debit, confirmation with settled weeks and credit warning), "Tutup minggu" on period detail and Home, Home arrears summary (members in arrears and total through the current week), src/ui/format.ts (formatRupiah). periods/[id].tsx moved to periods/[id]/index.tsx. Changed: payments.ts (record now requires `account`, rejects ended period and future/invalid date, writes the payment, allocations and ONE member_payment ledger entry for the whole amount in one transaction; new preview, listBalances, getArrearsSummary), ledger.ts (account column, insertEntry exported), weeks.ts (closeOldest, currentWeek; per-member week status loaders moved here from payments.ts to avoid a payments/ledger import cycle, payments.ts re-exports them), types.ts (Account, optional LedgerEntry.account), ui/errors.ts (+ test). Preview and record use the same domain function, and a test checks they match. Existing repository tests: `now` in the fixture clock moved to 2026-12-31 (so test payment dates are not "in the future") and record calls got `account: 'tunai'`; no assertion was changed. Verified: 156 tests in 8 suites pass (110 old + 46 new), lint and typecheck clean, `expo export --platform android` bundles (output in a temp folder). The tests use sql.js, so they do NOT prove migration 0002 or the new screens work on the phone (the expo-sqlite adapter applies the same SQL, but only the phone proves it). Not done: settleHost untouched (M5), no correction of wrong payments (M5), no credit carry-over (M5), `weeks.close(number)` still allows closing out of order (only the UI path closeOldest enforces order). Next: owner phone check of M4, then M5 proposal.
- 2026-11-05: Owner marked M3 done and will run the Expo Go checklist later. So the expo-sqlite adapter and all M3 screens are STILL UNVERIFIED on a device; only tests (sql.js), typecheck, lint and bundling passed. Any phone findings are to be fixed before or alongside M4. Next: M4 proposal, waiting for owner "approved".
- 2026-11-05: M3 implemented (owner approved), status "implemented, not yet verified on the phone". Added: src/db/provider.tsx (database opened once at startup via context, "Memuat..." and an Indonesian error screen with retry), screens src/app/index.tsx (home), members/index.tsx, periods/index.tsx, periods/new.tsx (host order with up/down buttons, schedule preview), periods/[id].tsx (schedule, host swap with confirmation text, "Akhiri periode"), src/ui/errors.ts (+ test; the single English-to-Indonesian mapper), src/ui/components/ (Button, TextField, EmptyState), src/ui/dates.ts, src/ui/useLoad.ts, src/domain/schedule.ts (+ test; moveItem, previewSchedule, addDays, isRealDate; addDays moved out of periods.ts). Changed: members.ts (duplicate names), periods.ts (one active period, getActive, close), repositories.test.ts. Verified: 110 tests in 7 suites pass (89 old + 21 new), lint and typecheck clean, `expo export --platform android` bundles. The tests use sql.js, so they do NOT prove the expo-sqlite adapter (openDatabase.ts) works: that is only proven when the app opens on the phone. Not done: no migration, no dependency or app.json change, no M4 work.
- 2026-11-05: Owner closed the three open credit questions from the entry below. (a) Credit money enters Tunai/Debit on receipt; reports show "Titipan anggota" and expected kas subtracts credit held. (b) A payment made when every week is settled stays accepted as credit, with a warning on the form. Clarified from the code: payments.record fills the oldest open week first, so money only becomes credit once all weeks of the period are settled. (c) Credit of a member who skips the next period is refunded with one cash-out entry. Also noted: credit can be a non-multiple of Rp15.000 (e.g. 5.000 after a 25.000 remaining debt is paid with 30.000; see src/domain/payout.test.ts), so carry-over must be able to settle part of a week, like an offset. Impact: M4 form warning and cash effect of payments; M5 migration 0002 for carry-over and the refund entry; M6 credit line and expected kas formula. Docs only, no code changed. Next: M3 proposal, waiting for owner "approved".
- 2026-11-05: Owner decisions after M2: (1) host change = swap of two open weeks (confirmed); (2) a payment above the period's remaining dues is accepted and the excess becomes member CREDIT instead of being rejected; (3) credit left at period close is CARRIED OVER to the member's next period as advance dues. Implemented (1)-(2): payments.record stores the full payment, allocates only open weeks, returns { payment, allocations, credit }; credit is derived as payments.amount - SUM(allocations.amount), with getCredit(periodId, memberId) and listWithCredit. Verified: 89 tests in 5 suites pass, lint and typecheck clean, no migration needed yet. NOT built yet (M4/M5): carry-over itself (needs migration 0002 to record credit usage, since the derived formula cannot hold deductions and credit is tied to period_id), and the ledger/kas effect of credit. Open for M4/M5: (a) credit money is received but not yet shown in Tunai/Debit, so kas reports must account for it as a liability to avoid mismatch; (b) a 15.000 payment from a host whose week was already settled by offset becomes credit (current rule, to confirm); (c) what happens to a leaving member's credit is moot because N is fixed, but a member who does not join the next period would hold unused credit, so decide refund vs write-off then.
- 2026-11-05: M2 implemented in src/db/ (owner approved). Verified: 85 tests in 5 suites pass (56 domain + 29 db), lint and typecheck clean, no REAL/float columns. Added expo-sqlite (prod) and sql.js + @types/sql.js (tests only); app.json got the expo-sqlite plugin. Schema v1 (PRAGMA user_version): members, periods, period_members, weeks, payments, allocations (stored, not recomputed), ledger_entries (UPDATE/DELETE blocked by triggers), offset_credits; integer CHECKs, FK on. Repositories: members, periods, weeks (swapHosts only while both weeks open), payments (record + stored allocation in one transaction), ledger (append, settleHost = payout + offset). Tests use a sql.js adapter behind the `Db` interface; only openDatabase.ts loads native expo-sqlite, and it has NOT been run on the phone yet, so verify it in M3 with the first screen. Design points to confirm: (1) a payment exceeding the period's remaining dues is rejected, (2) `record` does not write the member_payment ledger entry; M4 will, (3) host change is a swap of two open weeks (a single reassignment always collides because every member hosts once), (4) repository errors are English; the UI maps them to Indonesian. Removed src/db/.gitkeep (folder now has files).
- 2026-11-05: Owner decided period close: any member debt still unpaid is treated as settled and absorbed by kas (write-off), no carry-over collection. Consequences: (1) at close, the app writes ONE append-only write-off ledger entry per member with debt (amount, member, note), never editing old entries; (2) this resolves the open remainingDebt question: a host's leftover non-multiple debt simply gets written off at close, so no exception to the Rp15.000-multiple rule is needed; (3) reports show kas nyata (Tunai+Debit), outstanding dues, and kas seharusnya (nyata + outstanding) so fluctuation has a visible cause; (4) a warning (not a block) before host payout when Tunai+Debit is below the payout, and a pre-close screen listing members with debt and the total loss. Planned in M5 (write-off entry type, close period) and M6 (reports). Piutang stays only for money lent to members, not for unpaid dues.
- 2026-11-05: Owner decided every member payment MUST be a positive multiple of Rp15.000 (partial payments no longer allowed; advance and late still fine). Implemented in allocatePayments via assertDuesMultiple (money.ts); host offsets are not payments and may be non-multiples. Verified: 56 tests in 3 suites pass, lint and typecheck clean. OPEN QUESTION for owner: after the offset cap, a host's remainingDebt can be a non-multiple (e.g. 25.000) and cannot be paid by a normal payment. Options: (1) allow a payment exactly equal to the host's remaining debt, (2) round the offset down to a multiple of 15.000, (3) separate debt-settlement entry. Documented by a test marked "OPEN QUESTION". M4 form must also block non-multiples; UI never computes money.
- 2026-11-05: M1 CLOSED. Owner chose to CAP the host offset at the payout: offset = min(host debt so far, 10.000 x N), applied to the oldest unpaid weeks first (last week may be partial); the rest stays as debt (`remainingDebt`), netCash is never negative. Zero-amount payments stay rejected (owner did not object after explanation). Verified: 46 tests in 3 suites pass, lint and typecheck clean. Open for later: (c) store allocations in M4 instead of recomputing; how `remainingDebt` is collected later (normal payment via allocation for now); callers must compute hostUnpaidWeeks from statuses that already include earlier offsets to avoid double offset.
- 2026-11-05: M1 implemented in src/domain/ (types, money, dues, allocation, payout + tests). Verified: 41 tests pass in 3 suites, lint and typecheck clean, no float/rounding calls in domain code. smoke.test.ts replaced by real tests. Design choices to review: (a) host_offset is a cash-in entry, so netCash = payout - offset and can be negative when debt > payout; offset is not capped; (b) zero-amount payments are rejected; (c) allocation is recomputed from payments, so a back-dated payment entered later can change order; M4 should consider storing allocations. Host with no debt gets only the payout entry. member_payment entries and kas pos (Tunai/Debit/Piutang) are left to M4/M5. M1 stays open until the owner reviews (a)-(c).
- 2026-11-05: M1 approved by owner.
- 2026-11-05: M0 CLOSED. Owner confirmed the app runs in Expo Go via QR code. Evidence: lint, typecheck and tests pass (commit 3a9899c) plus owner confirmation on phone. Next: M1 (domain logic) proposal, waiting for owner "approved". Still open: .claude/settings.json deletion not confirmed, left uncommitted.
- 2026-11-05: M0 configured locally. Scaffold uses expo-router (App.tsx and index.ts removed on purpose, owner confirmed). Fixed npm ERESOLVE by pinning react-dom 19.3.0 to match react 19.3.0, installed eslint + eslint-config-expo with eslint.config.js, and moved jest/jest-expo/@types/jest to devDependencies only. Results: `npm run lint` clean, `npm run typecheck` clean (strict + noUncheckedIndexedAccess), `npm test` 1/1 passing (smoke test only). Dev server started with `expo start --lan`. NOT done yet: owner has not confirmed the app opens in Expo Go, so M0 is not marked done. Open question: .claude/settings.json is deleted in the working tree; owner has not confirmed this is intended, so it is left out of the commit.
- 2026-11-04: Owner answered the pos questions (transfers, Piutang, tour spending) and confirmed Node/npm are installed on the laptop. All v1 rules are specified. Waiting for the Expo project to exist on the laptop to start M0 configuration.
- 2026-11-04: Owner decided kas pos, shared-goal cash-out, correctable weeks with trail, app name Mas Catat, phone testing via Expo Go.
- 2026-11-04: Owner decided offset scope (all unpaid weeks) and lump-sum allocation (oldest first, payment week stays visible). M1 rules are now fully specified except closed-week corrections.
- 2026-11-04: M0 approved by owner. Blocked: npm registry returns 403 from the assistant's workspace and the laptop shell, so the Expo project cannot be generated remotely. Owner runs the scaffold command locally; assistant then reviews and configures.
- 2026-11-04: Owner answered rotation, leaving, and payment questions; plan updated.
- 2026-11-04: Plan drafted. CLAUDE.md written. Waiting for owner approval of M0 and answers to open decisions.
