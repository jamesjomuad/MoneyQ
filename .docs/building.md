# Building MoneyQ

How to verify the app, run it locally, and produce installable Android builds.

## Prerequisites

- Node.js 20+ and npm (this is an npm project — use `npx`, not `bunx`)
- An [Expo account](https://expo.dev/signup) and `eas-cli` (installed on demand through `npx`, no global install needed)
- For local/native builds only: JDK 17 and the Android SDK (Android Studio)

Everything else runs in the cloud; no Android toolchain is required for the recommended path.

## 1. Verify before every build

Run the four gates from `AGENTS.md` and fix anything that fails:

```bash
npm run verify:db              # schema + financial rules + adapter parity (must be 92/92 or better)
npx expo-doctor                # dependency/config issues (must be 21/21)
npx expo export --platform android   # proves the native bundle builds
npx expo export --platform web       # proves the web bundle builds
```

Confirm the web bundle contains no SQLite (the web build must resolve the memory adapter):

```bash
grep -c "wa-sqlite\|expo-sqlite" dist/_expo/static/js/web/*.js   # must print 0
```

Also run `npm run lint` (ESLint is configured; keep it clean).

## 2. Run the app locally

```bash
npm start          # npx expo start
npm run android    # Android Expo Go — the primary target
npm run web        # browser harness with seeded sample data
```

Notes:

- The web preview uses the in-memory adapter (sample data, nothing persists); device builds start empty with SQLite.
- If edits don't appear, Metro's file watcher can stall — restart the dev server instead of trusting a stale bundle.

## 3. Build an Android APK (recommended)

MoneyQ is already set up for EAS Build:

- `eas.json` defines the build profiles below.
- `app.json` has `android.package` (`com.moneyq.app`) and the linked EAS project (`@jamesjomuad/MoneyQ`).

```bash
npx eas-cli@latest login    # once per machine
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile produces an **APK** you can sideload onto any phone. First build takes ~15–20 minutes (queue + native compile); later builds are much faster thanks to caching.

When it finishes, the build page shows an **Application Archive URL** — that's the APK download:

https://expo.dev/accounts/jamesjomuad/projects/MoneyQ/builds

To get a link without waiting in the terminal, add `--no-wait` and open the printed build page.

### Build profiles

| Profile | Output | Use |
| --- | --- | --- |
| `preview` | APK, `distribution: internal` | Sideloading, testers, QA on real devices |
| `development` | Dev client APK | Running a Metro dev server on-device (`npx expo start`) |
| `production` | AAB (`autoIncrement: true`) | Google Play submission |

```bash
npx eas-cli@latest build --platform android --profile preview      # APK
npx eas-cli@latest build --platform android --profile production   # Play Store .aab
```

Version codes are managed remotely (`appVersionSource: "remote"` in `eas.json`), and `production` increments them automatically.

## 4. Alternatives

**Local EAS build** (keeps sources on your machine; needs JDK 17 + Android SDK):

```bash
npx eas-cli@latest build --platform android --profile preview --local
```

**Debug APK via Gradle** (generates `android/`, requires Android Studio):

```bash
npx expo run:android
# → android/app/build/outputs/apk/debug/app-debug.apk
```

`android/` and `ios/` are generated — never hand-edit them.

## 5. What forces a rebuild

Native assets and config only take effect in a **new build**, not through an OTA update:

- App icon / adaptive icon / splash image (`assets/images/*.png`)
- App display name (`expo.name` in `app.json`)
- Package name, permissions, plugins, SDK upgrades

Code-only changes to `app/`, `components/`, `stores/`, `utils/`, `storage/` are what `eas update` could ship over the air.

## 6. Changing the app icon

Overwrite the files in `assets/images/` (paths already referenced by `app.json`):

- `icon.png` — 1024×1024, main icon
- `android-icon-foreground.png` — 1024×1024, artwork inside the centre 66% (launcher masks it)
- `android-icon-background.png` — 1024×1024, same canvas as the foreground
- `android-icon-monochrome.png` — 1024×1024, single-colour silhouette for Android 13+ themed icons
- `favicon.png` — web tab icon
- `splash-icon.png` — launch screen logo

Then rebuild with the `preview` profile and reinstall the APK.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Not logged in` | `npx eas-cli@latest login` |
| Build stuck on "Computing project fingerprint" | Set `EAS_SKIP_AUTO_FINGERPRINT=1` to skip it |
| Expo Go shows a stale UI | Restart the dev server; the file watcher doesn't always rebuild |
| `expo lint` prompts to install dependencies | ESLint is already in `package.json` — run `npm install` |
| Web bundle contains `expo-sqlite` | Something imported `storage/database/*` outside `storage/adapters/adapter.js`; platform resolution is broken |
