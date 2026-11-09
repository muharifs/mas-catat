# Mas Catat design system spec (v1, light theme)

Date: 2026-11-09. Author: ui-ux-designer. Status: proposal, needs owner approval before any code.
Method taken from Asphalt Aloha (token structure, 4dp grid, linear type scale, two elevations, component states, never color-only). Identity is NOT taken: no Gojek green, no Maison Neue, no pill-everything look, no logo/art/icons/names.
I read code only. I have not seen any of this on a device. All contrast numbers are calculated from the hex values (WCAG 2.x relative luminance), not measured on a screen.

---

## 1. Survey of the current UI

Key finding: a token file already exists and is used almost everywhere. This is an evolution of `src/ui/theme.ts`, not a new system.

`src/ui/theme.ts` today: `colors` (primary #1f6f50 green, primarySoft, surface #f2f6f3, surfaceAlt, text, textMuted, danger, dangerSoft, warn, warnSoft, border #bbbbbb, placeholder, onPrimary, background), `type` (display 28, title 22, heading 18, body 16, label 14, caption 13), `spacing` (xs4 sm8 md12 lg16 xl24), `radius` (row 8, card 12), `MIN_TOUCH` 48.

Usage (rough counts):
- `from '../theme'` / `'@/ui/theme'`: 44 files (all 17 components in `src/ui/components` that style anything, plus 27 screens).
- `colors.*` references: 203 in 43 files. Heaviest: periods/[id]/close.tsx 11, periods/[id]/members/[memberId].tsx 10, components/OptionRow 9, payments.tsx 9, reports members 9, Button 7, TextField 7, Notice 6, (tabs)/index 7, payout 7.
- Hard-coded hex or rgba in .tsx: 0. Good.
- Hard-coded numbers that bypass tokens (all of them, about 20 lines):
  - fontSize: Button label 16, HistoryRow sub 14, Money large 20, OptionRow tick 16.
  - gap 2: ListRow (2), HistoryRow, ReportLine, close.tsx, restore.tsx. Off the 4dp grid.
  - TextField: minHeight 48 (should be MIN_TOUCH), paddingVertical 10, multiline minHeight 80.
  - radius: OptionRow 6/12, kas/[entryId] warn box 6, members/index 8, menu dot 5 (10dp dot).
  - Tab bar: height 64, paddingVertical 6, icon 24 constants in (tabs)/_layout.
  - Font weights are scattered as literals ('600','700') in styles.
- Variants in screens: `tone=`/`variant=` props appear 118 times in 25 screens, so the component API (Button/Card/ListRow/Notice tones) must stay backward compatible or this is a big edit.
- Problem that matters: `colors.primary` (green) is used for TWO meanings: brand/active (Button, Chip, tab tint, OptionRow, Loading, SwipeRow, links) AND "money in / ok / paid" (`Money` positive, `RowText ok`, several `ok:` styles in payout, payments, member screens, reports). Changing the brand color without splitting these would turn "paid" and "+" blue. This split is the one real migration job.
- Shared components that exist: Button, Card, Chip, ListRow (+RowText), HistoryRow, Money, TextField, AmountField, DateField, OptionRow (radio/checkbox row), Notice, EmptyState, ErrorState, Loading, ReportLine, SwipeRow, CorrectionForm. Missing: Badge/dot (menu.tsx draws its own 10dp dot), SectionHeader (screens use ad-hoc Text), Toast is `ToastAndroid` (system), no Divider, no Screen wrapper.
- Current look: green-tinted grey surfaces (#f2f6f3) and green brand. Cards are flat tinted boxes, no elevation. Disabled = opacity 0.4 (fails contrast and gives no reason).
- App icon/splash: `app.json` still points at assets with adaptive background #E6F4FE (likely Expo defaults). Not in scope here; icon work belongs with M7b.

---

## 2. Color tokens

Same role structure as Aloha (active, error, supplementary, background, mute, inactive), with our own values. Names are semantic so a dark theme later only changes values.

Identity: "Biru Tinta" (ink blue) on "Kertas" (warm paper). Reads as a notebook: blue ink on cream paper, white cards like pages. Green is demoted to ONE job: money coming in. That keeps the existing meaning (green + / red -) and keeps the app clearly unlike Gojek.

| Token | Hex | Role |
|---|---|---|
| brand | #2B4C9B | Active/primary: buttons, active tab, links, selected |
| brandPressed | #1F3A7D | Pressed state of primary |
| brandTint | #E8EDF8 | Active secondary: selected row, tertiary button, icon circle, info notice |
| onBrand | #FFFFFF | Text/icon on brand and on error |
| error | #B3261E | Error, money out, destructive (same value as today's danger, continuity) |
| errorPressed | #8C1D18 | Pressed destructive |
| errorTint | #FDECEA | Error background |
| moneyIn | #1B7A43 | Money in (+), "lunas", success |
| moneyInTint | #E6F4EA | Success background |
| moneyOut | = error | Money out (-) uses the error value but is a separate name (so it can diverge) |
| warn | #8A4B00 | Warning text/icon (backup reminder, no-pos warning) |
| warnTint | #FFF4E0 | Warning background |
| neutral | = text | Amounts of transfers, loans, repayments, write-off: ink color, no + or -, label in words |
| neutralTint | #EEF0F5 | Icon circle for neutral types |
| bgPage | #F7F5EF | Screen background (Kertas), background tier 1 |
| bgCard | #FFFFFF | Card/row/input/sheet, tier 2 |
| bgMute | #EEF0F5 | Mute primary: chips idle, skeleton, disabled fill is bgDisabled below |
| bgDisabled | #E4E7EE | Inactive fill |
| text | #1B1F2A | Text primary |
| textSecondary | #4A5162 | Text secondary |
| textTertiary | #636A7B | Placeholder, hints, inactive tab icon/label |
| borderStrong | #7B8294 | Input and checkbox/radio outline (needs 3:1) |
| divider | #E1E4EB | Hairline between rows (decorative, no text) |
| scrim | rgba(27,31,42,0.4) | Behind dialogs |

### Contrast check (WCAG AA: text 4.5:1, large/bold >=18.66px bold or 24px 3:1, UI components 3:1)

| Foreground on background | Ratio | Result |
|---|---|---|
| text on bgCard | 16.4 | AAA |
| text on bgPage | 15.2 | AAA |
| textSecondary on bgCard | 7.9 | AAA |
| textSecondary on bgPage | 7.3 | AAA |
| textTertiary on bgCard | 5.4 | AA |
| textTertiary on bgPage | 5.0 | AA |
| brand on bgCard | 8.0 | AAA |
| brand on bgPage | 7.4 | AAA |
| brand on brandTint | 6.9 | AA |
| onBrand on brand | 8.0 | AAA |
| onBrand on brandPressed | 10.7 | AAA |
| error on bgCard | 6.5 | AA |
| error on bgPage | 6.0 | AA |
| error on errorTint | 5.7 | AA |
| onBrand on error | 6.5 | AA |
| moneyIn on bgCard | 5.4 | AA |
| moneyIn on bgPage | 4.9 | AA (close to the limit; keep amounts >=16sp bold) |
| moneyIn on moneyInTint | 4.7 | AA (close; do not lighten) |
| warn on warnTint | 6.2 | AA |
| warn on bgCard | 6.8 | AA |
| borderStrong vs bgCard | 3.8 | AA for UI (>=3) |
| borderStrong vs bgPage | 3.5 | AA for UI |
| textTertiary on bgDisabled (disabled button label) | 4.4 | Exempt (disabled), but the reason line next to it uses textSecondary 6.4 |

Hand-computed; the developer must re-verify with a checker (for example WebAIM) when pasting the hex, in particular moneyIn on moneyInTint and moneyIn on bgPage, the tightest pairs.

Rules:
- Color is never the only signal. Money direction: sign (+/-) AND color. Transfer/loan/write-off: no sign, words ("Dipindah: Tunai -> Piutang"), neutral ink. Corrected: strike-through + word "Dikoreksi" + errorTint + border. Selected: tint + check mark + bold. Error field: red border + message text. Disabled: see button.
- Brand is blue so a blue "+" can never be confused with money in. Never use `brand` for an amount.

### Migration mapping from old keys
| Old | New |
|---|---|
| primary (brand uses) | brand |
| primary (money-in / ok uses) | moneyIn |
| primarySoft | brandTint (selected/tertiary) or moneyInTint (paid) |
| surface | bgCard (cards) or bgPage (screen) |
| surfaceAlt | bgCard with divider, or bgMute |
| danger / dangerSoft | error / errorTint |
| warn / warnSoft | warn / warnTint |
| textMuted | textSecondary |
| placeholder | textTertiary |
| border | borderStrong (inputs), divider (hairlines) |
| background | bgCard |
| onPrimary | onBrand |

Dark mode: NOT now. Cost is moderate, not cheap: every screen needs checking, `useColorScheme` plumbing, status bar, and tint recheck. The token names are already semantic so it stays possible later. Recommend: set `userInterfaceStyle: "light"` in app.json (a config line, check it is not already set) so a phone in dark mode does not give a half-dark native header.

---

## 3. Type scale

System font only (Roboto on Android). No download: fewer bytes, no loading flash, and Indonesian text is rendered well. Maison Neue is not used anyway.

Aloha scale is 12/13/14/16/18/21/24/28. Mas Catat drops 12 and 13 (too small for this owner's phone and for the M7.2 minimum of 14 for secondary text) and adds nothing between. Result, 7 steps:

| Token | Size / line | Weight | Use |
|---|---|---|---|
| display | 28 / 36 | 700 | Total kas on Beranda |
| titleL | 22 / 28 | 700 | Screen title inside content, big section |
| amountL | 20 / 28 | 700 | Tunai / Debit amounts (today `Money large`) |
| titleM | 18 / 24 | 700 | Section header, row amount (18sp rule), card title |
| body | 16 / 22 | 400 | Normal text, input text, button label |
| bodyStrong | 16 / 22 | 700 | Row title, button label |
| label | 14 / 20 | 700 | Tab label (14sp rule), chip, field label, link |
| secondary | 14 / 20 | 400 | Second line, hints, error message (replaces caption 13) |

Rules:
- Old `caption` (13) is removed; its users move to `secondary` (14). Effect: a few rows grow 1sp. This is intended and consistent with M7.2.
- Weights: only 400 and 700. RN on Android maps '600' to either medium or bold depending on the font; today the code uses '600' in several places. Check on the device whether '600' looks different from '700'; if not, folding into '700' is simpler. Owner check needed.
- Amounts use `fontVariant: ['tabular-nums']` so digit columns line up and amounts compare at a glance. Cheap and supported by RN.
- Amount sizes by context: display 28 (total), amountL 20 (Tunai/Debit), titleM 18 (rows, lists), body 16 bold (inline).
- Font scaling: leave allowFontScaling on (accessibility). Set `maxFontSizeMultiplier={1.3}` on tab labels, chips and row amounts so a large system font does not wrap the tab bar. Use `minHeight`, never fixed `height`, for text containers.

---

## 4. Spacing, radius, elevation

Spacing, 4dp base (Aloha rule: proximity = relation, more space = more importance). Names kept, so existing code compiles:

| Token | dp | Typical use |
|---|---|---|
| xs | 4 | gap between title and its second line (replaces gap 2), icon-to-text in a chip |
| sm | 8 | gap inside a card, between chips |
| md | 12 | row padding, field to label to input |
| lg | 16 | screen side padding, card padding |
| xl | 24 | between sections |
| xxl | 32 | top of empty state, space around a dialog |

Off-scale values (2, 6, 10) are replaced: 2 -> xs; 6 -> sm; 10 -> md. Allowed exceptions in the component, not tokens: icon box 40, status dot 10, check mark 24.

Radius:
| Token | dp | Use |
|---|---|---|
| sm | 8 | Text input, notice, small badge background |
| md | 12 | Button, list row, selection row |
| lg | 16 | Card, dialog, bottom sheet top corners |
| pill | 999 | Chip, icon circle, status dot |

Buttons are rounded rectangles (md), not pills: first, the same shape as cards and fields; second, it is the cheapest visual difference from Aloha. Chips are pills so they read as filters, not actions.

Elevation, two levels as in Aloha. React Native needs both Android `elevation` and iOS shadow props (iOS is only for tests; the app targets Android):

```
elevation.low  = { elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.12, shadowRadius: 4 }
elevation.high = { elevation: 8, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.15, shadowRadius: 10 }
```
- low: Card on bgPage, sticky action bar. high: tab bar top edge (on top of lists), dialog/sheet, floating toast. Nothing else casts shadows.
- RN differences from CSS: Android draws elevation only if the view has an opaque backgroundColor; `overflow: 'hidden'` on the same view can clip the shadow on iOS; shadows are not CSS `box-shadow` (no spread, no color alpha control on Android < 9). Do not put `elevation` on every row of a long list (cost). In Riwayat, rows stay flat on white with a divider; only containers get low elevation.
- Pressed state: do not use `opacity: 0.75` for everything. Use a darker fill token (brandPressed, errorPressed) or bgMute for flat rows. Android ripple (`android_ripple`) on rows is acceptable and is the platform pattern.

---

## 5. Component specs

All tappable things: min height/width 48dp (`MIN_TOUCH`), min 8dp between neighbours. Labels in Indonesian, short, verb first.

### Button
- Sizes: regular (min height 48, paddingH 16, label `bodyStrong`), compact (same 48 height, paddingH 12), full-width by default in forms.
- Variants (Aloha primary/secondary/tertiary):
  - primary: fill brand, label onBrand, pressed brandPressed. One per screen/card.
  - secondary: fill bgCard, 1.5dp border brand, label brand, pressed brandTint.
  - tertiary: fill brandTint, label brand, no border, pressed slightly darker (#D9E1F3 is fine). For low-priority actions.
  - destructive: `danger` = fill error, label onBrand (final, irreversible: "Akhiri periode", "Pulihkan data"); `dangerOutline` = border error, label error; (new) tertiary danger = errorTint fill, error label. The button label must say the consequence ("Hapus semua data"), and the screen text above must explain it (existing rule).
- Disabled: fill bgDisabled, label textTertiary, no border, no opacity trick. A disabled button must have the reason directly below it, in `secondary` style textSecondary, for example "Isi jumlah dulu". Add optional `disabledReason?: string` prop that renders this line and sets `accessibilityHint`. (Matches the M7.2 rule "disabled ones stay visible with a reason".)
- Loading: label replaced by a 20dp spinner in onBrand/brand plus the label "Menyimpan..." kept as accessibility label; button disabled while loading, same size (no layout jump). Optional `loading?: boolean`. Do not add it to buttons that do not save.
- Keep existing props (`variant`, `selected`, `compact`, `disabled`) so 118 call sites do not change.

### Card
- Fill bgCard, radius lg, padding lg, gap sm, elevation.low, no border.
- Tones: default (white + low), info (brandTint, no shadow), warn (warnTint + 1dp warn border), danger (errorTint + 1dp error border), highlight "alt" = bgMute no shadow. Tones that signal a problem always contain a word (title) as well, not only a tint.
- Existing tones `default | alt | danger` stay valid.

### List row (ListRow and HistoryRow)
- Min height 56 for two-line rows (48 minimum for one line), padding md vertical / lg horizontal, left icon circle 40 (pill, neutralTint/brandTint/moneyInTint/errorTint by type), gap md, title `bodyStrong`, second line `secondary` textSecondary, amount at the right `titleM` tabular-nums, aligned right and top-aligned to the title.
- Rows inside a section card are separated by `divider` 1dp inset to the text start; no shadow per row.
- HistoryRow type -> circle/amount: member_payment, shared_goal in/out follow the sign; transfer, loan, loan_repayment, debt_writeoff, opening_balance (Tunai/Debit) use neutralTint and ink amount. Icons stay Ionicons (already installed, `@expo/vector-icons`); an icon is never alone, the title says the type.
- Corrected row: title strike-through, word "Dikoreksi" in error, errorTint background, 1dp error border (existing behaviour, new tokens).
- Pressed: ripple or bgMute. A tappable row has a chevron only when it opens a detail screen (optional, `chevron-forward` 20dp, textTertiary).

### Chips (Chip, filter chips in Riwayat)
- Pill, min height 48 touch (visual height 36, hit slop to 48 via `minHeight` on the Pressable and padding on the wrapper; or keep 48 if hit slop is awkward), paddingH md, `label` text.
- Idle: bgCard fill, 1dp borderStrong, label text. Selected: brandTint fill, 1.5dp brand border, label brand, check icon 16 before the label (so selection is not color only). Existing look (filled brand when selected) is replaced; accessibilityState selected stays.
- Horizontal scroll row: gap sm, side padding lg, first chip is "Semua".

### TextField
- Label above (`label`, text), input minHeight 48, radius sm, 1dp borderStrong, fill bgCard, text `body`, placeholder textTertiary, paddingH md.
- Focus: 2dp brand border (use `onFocus` state). Error: 2dp error border + message below in `secondary` error color, preceded by a small "!" icon or the word style "Perlu diperbaiki: ..." is not needed; the message text itself says how to fix it (existing rule). Helper text: `secondary` textSecondary below the input, replaced by the error when present.
- Disabled/read-only: bgMute fill, text textSecondary.
- Multiline: minHeight 96, text top-aligned (existing).
- Fix `minHeight: 48` -> `MIN_TOUCH`, paddingVertical 10 -> md-ish (12).

### Amount input (AmountField)
- Same field, but: numeric keyboard, text `amountL` (20) tabular-nums right-aligned, prefix "Rp" in textSecondary, live formatted value with thousands dots (display only; storage stays integer), quick-amount chips below ("+Rp15.000" etc. as today). Read-only summary lines (`read:`) use brand today -> use text or moneyIn only if they mean "paid"; plain information is never brand-coloured amount.
- The credit/"Titipan" warning before saving stays a warn Notice above the save button.

### Tab bar
- Height 64, bgCard, top divider 1dp + elevation.high on iOS only is not needed; Android: elevation 8. Safe-area bottom inset is added by the navigator; confirm on the device with gesture navigation (not verified).
- Item: icon 24 + label `label` 14 bold. Active: brand icon (filled variant), brand label, and a 56x28 pill behind the icon in brandTint (a shape cue, not just color). Inactive: textTertiary outline icon, textTertiary label (5.4:1).
- `tabBarHideOnKeyboard: true` stays. `tabBarLabelStyle` uses the `label` token, `maxFontSizeMultiplier` 1.3 via `tabBarAllowFontScaling` (check in the Expo Router/React Navigation version in use).
- Menu warning dot (backup late): 10dp pill, error fill, 2dp bgCard ring, placed on the Menu icon; the Menu row "Cadangan dan ekspor" also shows the text "Terlambat" so the dot is never the only signal.

### Section header
- Text `titleM` (18/24 bold), text color, margin top xl, bottom sm. In Riwayat date headers ("Hari ini") use `label` textSecondary on bgPage, sticky, paddingV sm, paddingH lg. Optional right action `label` brand, 48dp touch ("Lihat semua").

### Badge / dot
- Dot: 10dp pill. Count badge: min 20dp pill, `label` 14 is too big; use 12 bold only inside badge is NOT allowed by our 14 minimum, so count badges are not used in v1; use a word status badge instead.
- Status badge (Tercatat, Dikoreksi, Koreksi, Lunas, Belum lunas): pill, paddingH sm, paddingV xs, `label` 14, tint fill + matching dark text, always a word. Pairs: Tercatat = neutralTint + text; Dikoreksi = errorTint + error; Koreksi = warnTint + warn; Lunas = moneyInTint + moneyIn; Belum lunas = errorTint + error.

### Toast
- Keep `ToastAndroid` (system component, accessible, nothing to build). Use only for success after save ("Pembayaran tersimpan"), max one short line. Errors and anything the user must act on are NOT toasts: show a danger Notice on the screen (stays until fixed). No custom snackbar in v1 (a custom one would need elevation.high, bottom offset above the keyboard and tab bar, 4s timer: skip).

### Empty state
- Centered column on bgPage, top padding xxl: icon 48 in brandTint circle 72 (decoration), title `titleM` text, one explanation line `body` textSecondary saying why it is empty and what to do, ONE primary button with a verb ("Tambah anggota"). No illustration (portfolio-safe, nothing to license). Variants: empty list, no result for filter ("Tidak ada catatan untuk filter ini" + button "Hapus filter"), error (ErrorState: title, how to fix, "Coba lagi"), loading (spinner brand + text "Memuat...", skeleton not needed).

### Notice (existing)
- info = brandTint + text; warn = warnTint + warn text + 1dp warn border; danger = errorTint + error text + 1dp border + `accessibilityRole="alert"` (kept). Title in `label`, text `body`. A small leading icon (information-circle / warning / alert-circle, 20dp) is added so the type is not color only.

### OptionRow (radio/checkbox row)
- Row min 56, radius md, 1dp borderStrong; selected: brandTint fill + 2dp brand border + filled mark with check/dot. Mark 24dp, border 2dp borderStrong, radius: radio pill, checkbox 6 -> 8 (sm, off-scale 6 removed).

### Screen frame
- Background bgPage, horizontal padding lg, gap between sections xl, bottom padding xxl (or more when a sticky action bar exists). Primary action: at the bottom of the form, full width, above the keyboard (use `KeyboardAvoidingView` / ScrollView `keyboardShouldPersistTaps="handled"`, already in use? developer to confirm per screen).

---

## 6. Token file layout

Keep ONE file: `src/ui/theme.ts` (it exists; splitting adds import churn across 44 files). Exports, same names where possible:

```
export const colors = { brand, brandPressed, brandTint, onBrand, error, errorPressed, errorTint, moneyIn, moneyInTint, moneyOut, warn, warnTint, neutralTint, bgPage, bgCard, bgMute, bgDisabled, text, textSecondary, textTertiary, borderStrong, divider, scrim } as const;
export const type = { display, titleL, amountL, titleM, body, bodyStrong, label, secondary } as const;   // each {fontSize, lineHeight, fontWeight}
export const spacing = { xs:4, sm:8, md:12, lg:16, xl:24, xxl:32 } as const;
export const radius = { sm:8, md:12, lg:16, pill:999 } as const;
export const elevation = { low:{...}, high:{...} } as const;
export const MIN_TOUCH = 48;
export const ICON = { sm:20, md:24, lg:48 } as const;
```
- Transition aliases, kept for ONE step then deleted: `primary, primarySoft, surface, surfaceAlt, danger, dangerSoft, warnSoft, textMuted, placeholder, border, background, onPrimary` pointing to new values, plus `type.title/heading/caption`, `radius.row/card`. Remove aliases once the sweep (step D) is done; a lint grep `colors\.(primary|surface)` should return 0.
- Add one tiny unit test (`theme.test.ts`) that computes contrast ratios of the table in section 2 from the hex values and fails below the thresholds. Cheap, keeps the claim honest, and no dependency (about 20 lines of pure TS).
- Add `src/ui/components/Screen.tsx` (page background + padding + scroll) only if the developer sees the same wrapper repeated; optional.

---

## 7. Migration plan (small steps, fits M7.2)

Recommendation: tokens + base components FIRST, then build the detail screen and new Beranda on them. Reason: both remaining M7.2 steps are mostly new layout (cards, rows, section headers, status badge, Kas card with big amounts). Building them on old tokens and restyling later means doing them twice and two phone checks of the same screens. Restyling the old screens is a separate, later pass.

Step 0 (decision): owner approves palette (blue ink / paper / green only for money in). If the owner dislikes blue, only the hex values of brand, brandPressed, brandTint change; structure and contrast method stay.

Step A: tokens + split semantics (invisible-ish; one phone check)
- Rewrite `theme.ts` with new tokens plus aliases. Aliases map old keys to NEW values, so every screen changes color at once (green -> blue, grey-green surfaces -> white/paper). Hence step A already is a visible global re-theme; that is deliberate, because a half-green half-blue app is worse.
- Split the meanings: `Money` positive -> moneyIn; `RowText ok` and every `ok:` style (payout, payments, members/[memberId], reports members, (tabs)/index, ListRow) -> moneyIn; "paid today" -> moneyIn. All other `colors.primary` uses -> brand. This is about 10 style lines.
- Add `theme.test.ts` (contrast).
- Done when: tests, lint, tsc pass; owner opens Beranda, Riwayat, Menu, one form and one report on the phone.

Step B: base components (one phone check, together with A if the owner prefers)
- Update: Button (new fills, disabledReason, loading), Card (white + elevation low), Chip, TextField/AmountField/DateField, Notice (+icon), OptionRow, ListRow/HistoryRow, EmptyState/ErrorState/Loading, tab bar in (tabs)/_layout, menu dot.
- New: `Badge.tsx` (status badge + dot), `SectionHeader.tsx`.
- No screen file changes except where a prop is now required (none expected). Prop APIs stay compatible.

Step C = M7.2 step 3: `kas/[entryId].tsx` built with Card, SectionHeader, Badge, ListRow, Money.
Step D = M7.2 step 4: new Beranda built on the same; this also replaces the ad-hoc `ok`/`link` styles in `(tabs)/index.tsx`.

Step E (after M7.2 phone checks; can wait until before M7b): sweep of the remaining screens: delete aliases, replace gap 2, radius 6, ad-hoc `warn` box in kas/[entryId], `sub` fontSize 14, hard-coded numbers; apply SectionHeader to periods/*, loans/*, credits, members, backup, reports/*, kas/new, kas/index. Order by usage frequency: periods/[id]/index, payments, pay, kas/new, loans, members, then backup/restore, reports. Each batch = one commit + short phone check.

Restyled NOW (steps A and B, automatic through tokens/components): everything, by color and component shape. Hand-edited NOW: only theme.ts, the ~10 `ok:` styles, 17 components, tab layout, menu dot. Hand-edited LATER (step E): layout/spacing of the other screens.

---

## 8. Files

Create:
- `src/ui/components/Badge.tsx`, `src/ui/components/SectionHeader.tsx`, `src/ui/theme.test.ts` (contrast test).
- optional `src/ui/components/Screen.tsx`.

Change (step A/B):
- `src/ui/theme.ts` (rewrite).
- Components: Button, Card, Chip, TextField, AmountField, DateField, Notice, OptionRow, ListRow, HistoryRow, Money, EmptyState, ErrorState, Loading, ReportLine, SwipeRow (its `colors.primary` background = swipe reveal: brand or moneyIn? it reveals "pay", i.e. a money-in action: use moneyIn with white label, check contrast 5.4 ok).
- Screens (semantic split only): `src/app/(tabs)/index.tsx`, `src/app/(tabs)/menu.tsx`, `src/app/(tabs)/_layout.tsx`, `src/app/periods/[id]/payout.tsx`, `payments.tsx`, `periods/[id]/members/[memberId].tsx`, `src/app/reports/period/[id]/members/[memberId].tsx`, `src/app/periods/[id]/index.tsx` (`open:`), `src/app/kas/index.tsx` (`link:`).
- `app.json`: `"userInterfaceStyle": "light"` (verify current value first).
- Docs after approval: PROJECT.md decision entry "Design system v1" (PM/main session writes it, not me); CLAUDE.md untouched.

Not touched: `src/domain`, `src/db`, any money logic, migrations, routes, texts (except the new `disabledReason` strings and Notice icons).

---

## 9. Risks and things the owner must check on the device

1. Brand change green -> blue is global and immediate. Screens not rechecked (periods/*, reports/*, backup/*, credits, members) will change color without a layout review. Mitigation: aliases, then one quick walk through every screen in step A.
2. Semantic split can be missed: a leftover `colors.primary` meaning "paid" would show blue. Mitigation: grep `colors\.primary` after step A and review each of the ~28 hits; the contrast test does not catch this.
3. Caption 13 -> 14 and line heights 22 can wrap text in tight rows (tab labels, chips, SwipeRow, report lines). Check at the system font size the owner really uses, and at "large" font.
4. Font weight '600' vs '700' rendering on Android: not verified.
5. Elevation/shadow look and the white-card-on-paper contrast: visual judgement on the real screen, not from code. Warm paper may look yellowish on the owner's panel; fallback is bgPage #F5F6F9 (cool grey), contrast ratios stay above AA (text secondary 7.35).
6. moneyIn pairs are close to 4.5; a cheap panel or low brightness outdoors reduces legibility; amounts are 18sp bold with a "+" sign so it still reads, but check outdoors.
7. Tab bar bottom inset with gesture navigation vs 3-button navigation: not verified.
8. Dark mode: phone in dark mode with `userInterfaceStyle` unset can give mixed native elements (keyboard, dialogs). Lock to light.
9. Performance: elevation on many Cards on Beranda is fine; do NOT add it to Riwayat rows.
10. A second pass on the app icon/splash (Expo default, #E6F4FE) is needed so the icon "small book" matches the ink-blue brand; belongs to M7b.

## 10. Conflicts and decisions for the owner / PM

- No conflict with CLAUDE.md domain rules: no money, ledger, or business rule changes; sign and color semantics preserved (money in green +, out red -, transfer/loan/write-off neutral). "Titipan" / "Pinjaman" wording untouched.
- PROJECT.md M7.2 spec: consistent with "no GoPay name, logo, brand colours or artwork", with tab bar 64dp / icon 24 / label 14sp, 18sp amounts, 16sp body, 14sp secondary, 48dp touch. One adjustment: M7.2 says "row: title 16sp, second line 14sp, amount 18sp" - kept. The 13sp `caption` token currently in code contradicts the 14sp minimum for secondary text; this spec removes it.
- PROJECT.md M7.2 step order "(3) detail, (4) Beranda" is kept; the design system is inserted as steps A and B before step 3, so the M7.2 estimate (3-5 days) grows by roughly 1 day (my estimate; PM to confirm). This is a plan change needing owner approval.
- Decision for the owner: the brand color (blue ink proposed) and the warm paper background; one-line answer is enough. Alternative palettes: deep teal (#0F5C6E, close to green), plum (#6A3A7C). Blue is proposed because it separates clearly from money-in green and from the error red.
- The CLAUDE.md line "Tested ... via Expo Go" is unaffected.
