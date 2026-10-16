# Changelog

All notable changes to Budgetarian. Dates are local calendar days; newest first.

## 2026-10-16

### Added
- Budgets can be archived instead of deleted (migration 015, mirrored in both
  storage adapters). Removing a budget from Home or a folder's selection
  toolbar — and deleting a folder outright — no longer destroys anything: the
  budgets leave the active lists while their transactions, tags, reminders and
  attachments stay intact. Multi-select asks first ("Archive 3 budgets?") and
  the toast it leaves behind carries an Undo that brings the same budgets back
  in one write, each to the folder it came from.
- A new Archive screen, opened from the Archive button on Home, lists what is
  parked there with the day it was archived. Restore returns a budget to its
  folder, or to the root list when that folder no longer exists. A permanent
  delete is still offered there, and says plainly that it cannot be undone.

### Changed
- The bottom navigation is rebuilt as one clean capsule. The bar was carrying
  three competing edges — an opaque band, a separate shadow layer behind a
  bordered capsule, and a hairline border on the active pill — around an
  oversized raised circle on a 74 px bar. Now the capsule is the only lit
  surface: one theme background, one soft shadow, no border, 68 px tall, with
  the active pill a theme-rounded soft-green shape that carries no border of
  its own. Every tab shares one baseline — a 22 px glyph, an 11 px label and
  the same icon zone — so the four tabs read as one row, and each label spans
  its own tab instead of a fixed 56 px box. The raised create button is
  smaller (56 px against 60) and sits lower, in a slot wide enough that no tab
  crowds it. Motion is down to two things: the single pill gliding between
  tabs (400 ms on a quick soft ease, following the measured icon zone) and a
  1.04 icon settle over 260 ms — the extra icon lift and the overshoot are
  gone. Destinations, the create menu and its routes, and the safe-area
  behaviour are unchanged.
- The transaction form's save bar is transparent, so the button floats on the
  page instead of sitting on a panel pinned below the list, and it casts its
  own shadow now. The headings on the Remaining and Amount cards sit a little
  closer to the figure they label.
- The Tag section's "Add or rename tags" is a plain text link on the section
  title's row rather than a pill button, the tag chips are a step roomier, and
  the Amount card's currency symbol is sized to the figure (~3/4 of the
  numeral height, was half).
- A reminder created from a transaction's Reminder section opens on that
  transaction's budget day instead of today: a transaction belongs to its
  budget and can be dated outside the budget's period. Picking a day by hand
  always wins, and a budget with no usable date leaves the suggested day in
  place.
- A breakdown item added from an existing transaction starts on that budget's
  day instead of today, for the same reason — a new item lands inside the
  period it is filed under.

### Fixed
- A tag's label in the budget screen's tags drawer stays readable however long
  its amount is. The label and its amount shared one line and the amount was
  the part that could not shrink, so a long amount took the whole 48%-wide
  card and clipped the tag's emoji and name away; the label now owns its own
  line, with the amount on the line beneath it.

## 2026-10-15

### Added
- Receipt images now survive saving: on Save the shared or picked copy is
  moved out of the app cache into persistent document storage and the
  transaction records the relative path (migration 013, mirrored in both
  storage adapters). Reopening the transaction — or restarting the device —
  still shows the preview, and the full-screen viewer works for saved
  receipts too. Removal deletes the file only once the database update
  lands, deleting a transaction cleans up its receipts, and backups
  deliberately exclude receipt images so a restore can never point at an
  absent file.
- A transaction can own several images: the single receipt column became an
  attachments table (migration 014), with legacy references folded into
  attachment rows during the rebuild and files on disk untouched. Adding
  and removing are committed immediately, like reminders — outside the
  form autosave — and deleting a transaction or budget cascades every
  attachment file away.
- The Attachments section follows the same idiom as Reminders: a plain
  header with a plus action, one card of hairline-divided rows (thumbnail,
  file type, trash), an empty state with the primary add circle, and a
  loading row while the list is fetched. An unreadable file renders a gray
  "File missing" row that can still be removed. Picking images uses
  expo-file-system's own picker — no new dependency — and tiles open the
  existing full-screen viewer.
- On-device receipt OCR: a shared or attached receipt image is scanned
  entirely on the device with ML Kit text recognition, and every
  recognized line appears verbatim as a reusable chip in a collapsible
  "Recognized Text" area inside the transaction's single Attachments
  section. Tapping a chip offers the text for Description, Amount, or Date
  through the exact same conservative money and date guards the share
  parser uses — reference numbers, balances, fees, and ambiguous dates are
  rejected inline with the field left exactly as it was — and replacing a
  filled field always asks first. Auto-prefill stays deliberately
  conservative: a confident amount and date plus a labeled or uniquely
  name-like merchant line, and only into fields the user has not touched.
  "Scan again" reruns against the currently attached image, an older
  in-flight scan can never overwrite a newer one, and removing the
  attachment clears its results and selection state. Nothing is ever saved
  by the scanner — the existing explicit Save and the staged-receipt
  lifecycle own that — and chip state is session-only with no schema
  changes. In Expo Go the area degrades to a plain "needs a development
  build" notice, and ML Kit never reaches the web bundle.
- The Tags section becomes a compact drawer parked in the pinned overlay,
  tucked behind the Remaining card with a negative top margin so it always
  reads as attached. It opens collapsed — only the handle strip, now
  carrying the Tags count beside the rotating chevron, peeks below the
  card — and tapping slides it down on a pure transform animation to the
  clear-filter strip plus exactly three live-measured tag rows at any font
  scale, with nothing ever poking above the card. Transactions still
  scroll and stay tappable under the closed band.

### Changed
- The app icon was refreshed again.

### Fixed
- The migration that introduced the attachments table could abort the
  upgrade on real installs ("UNIQUE constraint failed:
  sub_transactions.id"): orphaned child rows survived the transactions
  rebuild and collided with the restock. Child rows are now emptied
  explicitly before the swap and only rows whose parent survived are
  restocked — invisible orphans are dropped, every valid row untouched.
- Dark mode contrast: the tags drawer paints the elevated surface so it
  reads as its own plane between the Remaining card and the background,
  and unselected-tag share captions move from faint to muted — measured at
  2.93:1 before, now clearing 4.5:1 on every surface pair in all three
  themes. The same shared rows in the budget breakdown benefit too.

## 2026-10-14

### Added
- Drag-to-reorder for lists: long-press a row on Home or inside a folder to
  lift it (subtle scale, shadow and haptic), then drop it anywhere in the
  list — the rows around it slide open a gap under your finger, the scroll
  view auto-scrolls at the edges, and the release animates straight into the
  persisted order. Taps, scrolling and search are untouched: any early
  movement is never captured, so the row still opens or the list still
  scrolls exactly as before. Folders and budgets each keep their own block
  on Home, and only those two lists participate — transactions always stay
  date-ordered. Backups carry the manual order along automatically.
- Budgets now store a manual per-scope position. Until you reorder anything,
  the familiar order (newest period first) is preserved untouched; new
  budgets simply append at the end of their list.

### Changed
- The floating tab bar marks the active tab with a single rounded-square
  chip that glides between icons (300 ms, with a subtle mid-travel squash)
  instead of painting a separate background per tab. The chip centers itself
  on each icon's measured zone, so it stays aligned through font loads and
  layout changes, and the active icon scales up gently. Reduced-motion users
  get instant placement.
- Multi-select on Home now uses a Gmail-style checkbox that fades in to the
  left of each budget row while selection mode is on; the row itself is the
  toggle target and the chevron never moves. Long-press — the old way into
  selection — is now reserved entirely for starting a drag.
- The transaction tag row shows the full library in a single swipeable row
  with narrow fading edges that appear only while tags overflow past that
  side and never intercept taps — the search field is gone. The
  Add-or-rename-tags button is centered, painted with the primary theme
  color, and rounded into a pill to match the chips.
- The breakdown section dropped its redundant Total line: the sticky Amount
  card already shows the calculated sum while a breakdown is open.
- Replaced the app icon and splash images, and updated the favicon and
  notification icon to match.
- Home and the folder views now share one reusable multi-select system
  internally, keeping their toolbars and behavior identical as selection
  features grow.

### Fixed
- Unchecked selection checkboxes have a darkened border and are now
  visible, and the selection toolbar's cancel button got a border of its
  own.

## 2026-10-13

### Added
- Share e-wallet receipts into Budgetarian from any Android app: Budgetarian
  now appears in the system Sharesheet for images and plain text (expo-sharing's
  share-target config, ACTION_SEND and ACTION_SEND_MULTIPLE). A new
  Import Receipt screen previews the shared image (copied into the app's cache
  so the temporary share grant is never relied on), shows the shared text,
  and hands off to the existing transaction form with a chosen budget.
  A deterministic, offline parser prefills amount and date only when the
  receipt text states them unambiguously — labeled or currency-marked totals,
  real calendar dates with a year, and refusal of ambiguous day/month pairs —
  and every remaining line is preserved verbatim in Description. No OCR, AI,
  or network processing; nothing is saved until the user confirms, and
  cancelling leaves no trace. Receiving shares requires a development build
  or EAS APK (not Expo Go).

### Changed
- App renamed from MoneyQ to **Budgetarian**: the Expo display name, the
  branded theme label, on-device copy, backup file names
  (`Budgetarian-Backup-<date>.json`) and backup messages now say Budgetarian.
  Technical identifiers are deliberately unchanged for data and store
  compatibility: the `moneyq` deep-link scheme, `com.moneyq.app` package,
  Expo slug, backup `format: "moneyq-backup"`, and the stored `moneyq` theme
  key — existing installs, databases and backups keep working untouched.

## 2026-10-12

### Added
- Export now offers a real "Save backup file" action: Android's system folder
  picker lets you choose the destination and MoneyQ writes the JSON backup
  directly into it (via the Storage Access Framework in expo-file-system).
  The share sheet stays available as a secondary "Share" button.
- Export & Import: one JSON backup file with every budget, transaction,
  breakdown item, tag, reminder and setting, saved through the system share
  sheet or read back with the system file picker. Imports are fully validated
  and previewed (counts + repairs) before anything is written. Two modes: a
  Merge that adds new records and asks per conflict (Keep existing / Replace
  / Skip, with a breakdown transaction and its items treated as one unit),
  and a Full restore that saves a mandatory recovery backup of the current
  data first and replaces everything atomically. Available from Settings on
  Android; the browser preview reports it as unsupported.
- Transaction breakdown: optional per-item entries with calculated totals,
  purchase dates, times and notes; unpaid expenses carry an optional payment
  due date shown on the Calendar and in Reports.
- Sticky summary card on the transaction form painted from the folder's
  custom color, with dense Type/Status segmented controls and the amount,
  type, status and folder always visible above the scroll body.
- Drag-to-reorder breakdown items via the row handle, plus accessible
  Move up / Move down buttons in the item detail sheet; order is stored and
  restored with the transaction.
- Consistent icons on action buttons across the app (create, save, cancel,
  delete, edit, undo snackbar, type/status controls and more), driven by an
  optional `icon` prop on the shared Button.

### Changed
- Fields, chips and segmented controls across the forms now share one
  capsule shape; the sticky amount sits left-aligned on its folder-tinted
  card and the create/save bar is pinned to the bottom of the screen.
- The breakdown item sheet's "Add note" opens a proper top-aligned textarea,
  and the budget page's Income / Expenses / Transactions stats are split by
  centered separators that stay legible on tinted folder cards.
- Breakdown lives in a reminders-style card that is always expanded, with a
  centered circular add button; deleting the last item deactivates the
  breakdown and the undo snackbar restores it.
- The sticky summary card gained a soft floating shadow (iOS + Android
  elevation) and a larger, centered amount that reads as one composition
  with the card.

### Fixed
- Breakdown drag now measures real row heights, so a lifted row tracks the
  finger exactly and the enclosing scroll view can't steal the gesture.
- Adding a breakdown item closes the drawer first so the success toast is
  actually visible over the modal.

## 2026-10-11

### Added
- Reminders became an independent module with calendar management, and
  per-transaction reminders can be staged while creating a transaction.
- Custom Android notification icon and reminder messages built from the
  transaction note.
- The Remaining card on the folder view is tinted with the folder's custom
  color, with the date range moved inside.

### Fixed
- Transient storage read failures no longer masquerade as "Budget not found"
  (SQLite access is now serialized).
- Bottom spacing is inset-aware and content clears the floating tab bar.

## 2026-10-10

### Added
- Horizontal swipe navigation between the main tabs; refreshed main nav.
- Folder view: spend progress bar in the Remaining card, an independently
  scrollable tag grid showing only used tags with signed, right-aligned
  amounts, and tag/type-aware expense share bars.

### Fixed
- Android delivers reminders on time (`USE_EXACT_ALARM` declared).
- Stale folder-detail values after edits; rounded highlight on parent
  transaction rows; long tag labels no longer hide amounts.
- New expenses default to paid, and transaction dates default to the budget
  period correctly.

## 2026-10-09

### Added
- Custom bottom tab bar: notched primary line, raised plus button,
  icon-only tabs and headerless tab pages; plus creates a budget.
- Home search across folders and transactions, with results grouped by
  clickable folder.
- Paid/unpaid status for expenses — defaulted at creation and backfilled to
  paid on upgrade.
- Transaction edits auto-save when you navigate away, confirmed by an
  app-wide toast; saving a transaction dated outside its folder period asks
  for confirmation first.
- Optional notes on reminders, previewed in the reminders list.
- Reports: Next Month period filter and a scrollable segmented control.

### Changed
- Shorter label on the pinned folders strip.

## 2026-10-08

### Added
- Calendar tab: monthly calendar with previous/next navigation, today and
  selection markers, transaction dots per day, reminder dots, a selected-day
  summary (income, expenses, total spent), the day's transactions (tap to
  edit) and that day's reminders. Data loads one month at a time through the
  existing store/repository/adapter stack.
- Pinned folders: pin any folder from Home and jump to it from a shortcut bar
  docked at the bottom of the screen; pins survive restarts and prune deleted
  folders.
- Appearance setting with System / Light / Dark / MoneyQ themes, plus theme
  polish (elevated surfaces, disabled button color, theme-aware icons).
- Custom per-folder color with a real color picker.

### Changed
- Splash screen updated; tag names hidden in folder view; Android keyboard set
  to pan mode; new app icon.

### Fixed
- Budget form: future start dates are selectable again (the start calendar is
  no longer capped by the end date; the end date follows when needed).
- The folder color sheet stays within the viewport.
- Local notifications work in the Android APK and in Expo Go; on Expo Go for
  Android the app skips `expo-notifications` entirely, because evaluating the
  library throws there since SDK 53 (reminders stay as database rows).

## 2026-10-07

### Added
- Transaction reminders: one optional local notification per transaction, with
  permission handling, launch-time resync of OS schedules against the rows,
  and cancellation on edit/delete.
- EAS build setup and a build guide.
- Folder balance shown beside the spent figure.
- Shared mobile date picker (bottom-sheet calendar) used by every date field.
- README with screenshots, ESLint config, LICENSE copyright notice, About
  screen.

### Changed
- Folder view: foldable sections, clear system bar, transactions editable.
- Repayment-specific reminder fields stripped in favor of the generic
  transaction reminder.
- Amount fields restricted to digits.
- Expo SDK patch updates; legacy milestone-1 database rebuilt in migration 002.

### Fixed
- `expo-notifications` Expo Go push-error guard on Android (superseded on
  2026-10-08 by skipping the import in Expo Go entirely).
- Budget form period chips.

## 2026-10-06

### Added
- MoneyQ milestone 1: JavaScript/Expo foundation with local SQLite storage.
- Rebuild around budgets (folders), tags and transactions with a swappable
  storage layer (SQLite on device, in-memory harness on web).
- AGENTS.md documenting architecture, storage rules and the verification gate.
- Initial commit.
