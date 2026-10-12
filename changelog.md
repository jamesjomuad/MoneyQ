# Changelog

All notable changes to MoneyQ. Dates are local calendar days; newest first.

## 2026-10-12

### Added
- Export now offers a real "Save backup file" action: Android's system
  Save-to dialog lets you pick the folder and name, and the JSON backup is
  written straight to that location. The share sheet stays available as a
  secondary "Share" button.
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
