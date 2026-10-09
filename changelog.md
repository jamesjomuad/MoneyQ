# Changelog

All notable changes to MoneyQ. Dates are local calendar days; newest first.

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
