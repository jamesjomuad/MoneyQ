This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Project facts

- **JavaScript + ESM only.** No TypeScript anywhere: JSX screens are `.jsx`, pure logic is `.js`. Do not add `tsconfig`, do not run `tsc`, do not write `.tsx`.
- **npm project** (`package-lock.json` present) → use `npx`, not `bunx`.
- **No backend.** No API, auth, cloud database or sync. Everything is local to the device.
- **Linting.** `npm run lint` runs ESLint (`eslint-config-expo`); clean on last check. `npx expo lint` also works.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/` (append `.md` for markdown).
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Priority Rule

When instructions conflict, prioritize:

1. The user's current request.
2. These project rules.
3. Existing project architecture and conventions.

Do not interpret "Definition of Done" as requiring full-project verification for every task. Verification must be proportional to the scope and risk of the change.

## Commands

```bash
npx expo install <package>          # ALWAYS instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npm start                           # npx expo start
npm run android                     # npx expo start --android (Android Expo Go — the primary target)
npm run web                         # npx expo start --web (browser harness for UI/UX work)
npm run verify:db                   # schema + financial rules + storage adapter parity
npx expo-doctor                     # dependency and config issues
npx expo install --fix              # fix incompatible package versions
npx expo export --platform android  # production bundle — use to prove native still builds
npx expo export --platform web      # web bundle — use to prove web still builds
npx expo lint                       # runs ESLint; clean
```

## Architecture

Navigation and data flow are strictly one-directional:

```
UI (app/, components/) → Zustand stores → repositories → storage adapter → SQLite | memory
```

- **Only stores import repositories.** Never import a repository (or a storage adapter) from a component or a screen.
- **Zustand is a cache**, not a source of truth. It holds transient view state and re-reads from repositories on focus. No `persist` middleware — nothing survives a reload except SQLite.
- **Repositories own the rules**: validation, uniqueness, defaults. Adapters only translate them to their engine. Never put a business rule in an adapter, a component, or a store.
- `app/_layout.jsx` mounts a `DatabaseGate` that awaits `initStorage()` before rendering anything, so no screen sees a half-initialised store.

## Storage

Everything storage-related lives under `storage/`:

```
storage/
  adapters/       adapter.js (native, SQLite)   adapter.web.js (web, memory)
                  sqliteAdapter.js              memoryAdapter.js
  database/       database.js (opens expo-sqlite, runs migrations)  migrations/
  repositories/   budget, tag, transaction, settings
```

- **Platform resolution is the whole trick.** Import `../storage/adapters/adapter` with no extension; Metro picks `adapter.web.js` in the browser and `adapter.js` on device. This keeps `expo-sqlite` (whose web support is alpha and needs a wasm worker) out of the web bundle entirely.
- **All SQL lives in `sqliteAdapter.js`. All table state lives in `memoryAdapter.js`.** Both implement the same async operations interface; the web build is a pure-JS in-memory harness that seeds sample budgets and transactions, native starts empty.
- Never import `storage/database/database.js` (or `expo-sqlite`) outside `storage/adapters/adapter.js` — it will break `expo start --web`.
- New table or column → edit `storage/database/migrations/` with a **new** numbered migration. Never edit a shipped migration. If the schema changes, extend `sqliteAdapter.js`, `memoryAdapter.js` and the parity scenario together.

## Domain model

- A **Budget** is a period container: `name`, `start_date`, `end_date`. There is no spending limit and no over-budget state; every "spent"/"remaining" figure is derived from its transactions.
- **Tags** are one global library reused by every budget. Six are seeded with ids `default_<key>`.
- **Transactions** belong to a budget (`budget_id NOT NULL`). Type is `income` | `expense` | `transfer`.
- Money is stored as **integer minor units** (centavos) end to end. Format with `utils/currency.js`; never hard-code a currency symbol.
- Transfers move value between accounts: they never count as income or expense and leave total assets unchanged, even though the UI has no transfer form yet.

### Folders and Budgets — official terminology

**Folder** — an optional organizational category that groups Budgets (`storage/repositories/folderRepository.js`).

- Users name folders however they want: by year (`2025`, `2026`), purpose (`Travel`, `Business`), or any other category. Folder names must never be restricted to years or predefined categories.
- Folders are not financial entities, budgets, transactions, or archive statuses. They own no income, expenses, balances, or financial calculations of their own.
- Folders have customizable `name` and `color`. Folder colors are independent of Budget colors (nullable `color` = theme default).
- A Folder contains Budgets only. Nested folders and subfolders are not supported unless explicitly introduced in a future feature.

**Budget** — an independent financial entity that holds its own financial data and associated records (transactions, breakdown items, tags, reminders, color, amounts).

- A Budget may belong to one Folder or remain ungrouped at the root level (`budgets.folder_id`, nullable); each Budget belongs to at most one Folder at a time.
- A Budget retains its own identity, color, amounts, transactions, breakdown items, tags, reminders, and other associated data regardless of Folder assignment.
- Moving a Budget between Folders, or between a Folder and the root level, must not recreate, duplicate, reset, or delete its data (`setBudgetFolder` touches only the assignment).

**Hierarchy**: `Folder → Budget → Transactions / Breakdown Items`. The Folder organizes Budgets; the Budget owns its financial records. Folder membership must never change the ownership or meaning of those records.

**Folder operation rules**

- Creating or renaming a Folder must not affect existing Budgets.
- Moving a Budget changes only its Folder assignment.
- Deleting a Folder must not delete its Budgets or associated records — they return to the root level (`ON DELETE SET NULL` on `budgets.folder_id`, mirrored by `memoryAdapter.js`).
- Empty Folders are allowed. Ungrouped Budgets remain fully supported.

**Financial and reporting rules**

- Folders are organizational only. Folder operations must leave Budget and transaction calculations, reports, calendar entries, reminders, and historical financial data unchanged.
- Do not introduce Folder-level financial totals or calculations unless explicitly requested.
- Never interpret a Folder named `2025` as an automatic date filter, an archive operation, or a signal that its Budgets are inactive.

## Conventions

- **Dates**: build and read ISO dates with local `Date` getters via `utils/dates.js` (`toIsoDate`). Never `toISOString()` — it shifts across time zones. `parseFlexibleDate` accepts `2026-10-01`, `Oct 1, 2026`, `Oct 1`, `today`.
- **Icons**: `@expo/vector-icons` is not installed. Use `components/ui/Icon.jsx` backed by `expo-symbols`. Tags are emoji from `constants/finance.js`.
- **Navigation & routing**: Expo Router, routes in `app/` (not `src/app/`) — every file is a screen, `_layout.jsx` files define navigators, non-route code stays outside `app/`. Import `Link`, `router`, `useLocalSearchParams` from `expo-router`.
- **No new dependencies** without asking; prefer built-in Expo modules. `ios/` and `android/` are generated — never hand-edit them.
- Peers that must **not** be removed from `package.json`: `expo-font`, `expo-linking`, `react-native-safe-area-context`, `react-native-reanimated`, `expo-constants`.

## Changelog and Releases

Budgetarian follows two standards:

- **Keep a Changelog 1.1.0** — https://keepachangelog.com/en/1.1.0/
- **Semantic Versioning (SemVer) 2.0.0** — https://semver.org/spec/v2.0.0.html

The changelog is the root-level `CHANGELOG.md` with this structure:

```markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

## [Unreleased]

### Added
- ...

### Changed
- ...

### Deprecated
- ...

### Removed
- ...

### Fixed
- ...

### Security
- ...

## [1.0.0] - YYYY-MM-DD

### Added
- ...
```

**Changelog requirements**

- Use only applicable categories; omit empty sections.
- Keep entries concise, user-understandable, and grouped by change type.
- Add new unreleased changes under `[Unreleased]`.
- Never invent completed features, bug fixes, release dates, or historical entries.
- Preserve existing release history when updating the changelog. The legacy date-headed sections (pre-standardization) stay untouched as history; do not backfill them into version sections.
- Do not create a versioned release entry until a release is actually being prepared.
- When preparing a release, move applicable unreleased entries into a versioned section and use the actual release date in `YYYY-MM-DD` format.

### Versioning rules (SemVer)

`MAJOR.MINOR.PATCH`:

- **MAJOR:** incompatible changes to the app's documented behavior or data compatibility.
- **MINOR:** new backward-compatible functionality.
- **PATCH:** backward-compatible bug fixes.

Additional rules:

- Do not arbitrarily bump the app version for every code change.
- Keep the user-facing Expo app version (`app.json` → `expo.version`) consistent with the project's release process.
- Treat the `package.json` version, the Expo app version, and the Android build number (`versionCode`) as distinct metadata unless the repository explicitly standardizes them.
- Never infer the installed app version from the newest changelog entry.
- Do not label unreleased changes as published or shipped.

### Agent workflow rules

1. Inspect the existing `CHANGELOG.md` before implementing changes.
2. After completing a requested change, update `[Unreleased]` when the change is meaningful to users or maintainers.
3. Document relevant additions, behavior changes, removals, fixes, and security changes.
4. Avoid logging trivial internal edits that have no meaningful project impact.
5. Never claim a change is complete or tested unless the work and verification support that claim.
6. Keep changelog edits scoped to the work performed; do not rewrite unrelated entries.
7. Update `AGENTS.md` only when the project-wide rules themselves need to change, not for every feature.

## Task Scope and Agent Behavior

### Follow the user's requested scope

- The user's current request is the source of truth.
- Implement only what is explicitly requested.
- Do not add related features, improvements, refactors, redesigns, or "nice to have" functionality unless requested.
- If you identify an unrelated improvement, do not implement it. Mention it only if it blocks the requested task.

### Small changes should stay small

For small UI changes, styling changes, navigation changes, or isolated feature changes:

- Inspect only the files directly relevant to the request.
- Do not perform a project-wide audit.
- Do not explore unrelated architecture unless required to implement the change.
- Reuse existing components, stores, repositories, utilities, and patterns.
- Do not create new abstractions when an existing pattern is sufficient.
- Do not install new dependencies unless absolutely required.
- Do not run Playwright, browser automation, Android/device automation, or other expensive tooling unless explicitly requested or necessary to diagnose a problem.
- Do not run a production build for a small change unless the change affects build configuration or native functionality.

### Match verification to the change

Do not automatically run the complete Definition of Done for every task.

Use proportional verification:

**Small UI-only change**

- Check the modified code for obvious errors.
- Run `npx expo lint` when appropriate.
- Stop when the requested change is complete.

**Small feature change**

- Run the relevant lint/check.
- Run the relevant existing test or verification if one directly covers the changed functionality.
- Stop when the requested feature works.

**Database/schema/storage change**

- Run `npm run verify:db`.
- Run the relevant platform checks.

**Expo/native/configuration change**

- Run the relevant Expo validation or export required to verify the change.

**Large or cross-cutting change**

- Run the full Definition of Done.

Do not run expensive verification commands merely because they are listed in the Definition of Done.

### Do not over-investigate

Do not spend excessive time planning a straightforward change.

For a small request:

1. Identify the relevant files.
2. Read only the necessary code.
3. Make the smallest implementation.
4. Perform proportional verification.
5. Stop.

### Tool and dependency discipline

Do not install or configure tools just to test a small change.

In particular, do not automatically:

- install Playwright;
- install testing frameworks;
- install browser automation tools;
- install additional Expo packages;
- create development infrastructure;
- modify build configuration;
- modify native projects.

Only do these things when the current task requires them.

### Completion behavior

Once the requested change is implemented and appropriately verified:

- Stop working.
- Do not search for additional improvements.
- Do not refactor unrelated code.
- Do not continue testing beyond what is appropriate for the task.

Report:

1. Files changed.
2. What was changed.
3. What verification was performed.

## Definition of done

Run and report all four:

```bash
npm run verify:db      # must be 114/114 or better
npx expo-doctor        # must be 21/21
npx expo export --platform android
npx expo export --platform web
```

Then confirm the web bundle contains no SQLite: `grep -c "wa-sqlite\|expo-sqlite" dist/_expo/static/js/web/*.js` must print `0`.

To smoke-test the browser harness end to end, run `CI=1 npx expo start --web`, fetch `http://localhost:8081`, then fetch the script `src` from that HTML and confirm the bundle resolves the memory adapter (contains sample data) and zero `expo-sqlite` references. Kill the dev server afterwards — it holds port 8081 and blocks the next start.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `npx eas-cli@latest <command>`.
Docs: https://docs.expo.dev/eas/index.md
