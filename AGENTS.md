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

## Conventions

- **Dates**: build and read ISO dates with local `Date` getters via `utils/dates.js` (`toIsoDate`). Never `toISOString()` — it shifts across time zones. `parseFlexibleDate` accepts `2026-10-01`, `Oct 1, 2026`, `Oct 1`, `today`.
- **Icons**: `@expo/vector-icons` is not installed. Use `components/ui/Icon.jsx` backed by `expo-symbols`. Tags are emoji from `constants/finance.js`.
- **Navigation & routing**: Expo Router, routes in `app/` (not `src/app/`) — every file is a screen, `_layout.jsx` files define navigators, non-route code stays outside `app/`. Import `Link`, `router`, `useLocalSearchParams` from `expo-router`.
- **No new dependencies** without asking; prefer built-in Expo modules. `ios/` and `android/` are generated — never hand-edit them.
- Peers that must **not** be removed from `package.json`: `expo-font`, `expo-linking`, `react-native-safe-area-context`, `react-native-reanimated`, `expo-constants`.

## Definition of done

Run and report all four:

```bash
npm run verify:db      # must be 122/122 or better
npx expo-doctor        # must be 21/21
npx expo export --platform android
npx expo export --platform web
```

Then confirm the web bundle contains no SQLite: `grep -c "wa-sqlite\|expo-sqlite" dist/_expo/static/js/web/*.js` must print `0`.

To smoke-test the browser harness end to end, run `CI=1 npx expo start --web`, fetch `http://localhost:8081`, then fetch the script `src` from that HTML and confirm the bundle resolves the memory adapter (contains sample data) and zero `expo-sqlite` references. Kill the dev server afterwards — it holds port 8081 and blocks the next start.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `npx eas-cli@latest <command>`.
Docs: https://docs.expo.dev/eas/index.md
