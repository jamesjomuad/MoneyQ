# Task: Perform Final Pre-Build Testing for MoneyQ Before EAS Build

Prepare MoneyQ for an Android production build using Expo Application Services (EAS). Perform a thorough but controlled release-readiness check before I run `eas build`.

**Important:** This task is for testing, validation, and fixing confirmed issues only. Do not start the EAS build yet.

## 1. Follow Project Rules

- Read and follow `AGENTS.md`.
- Inspect `package.json`, `app.json` or `app.config.js`, and `eas.json`.
- Confirm the installed Expo SDK version before checking SDK compatibility.
- Follow the project's JavaScript + ESM rules. No TypeScript.
- Do not install new dependencies without my approval.
- Do not introduce unrelated features or refactor working code just for cleanup.
- Do not modify generated `android/` or `ios/` files manually.

## 2. Static Checks and Code Quality

Run the relevant existing checks:

- `npm run lint` or `npx expo lint`, depending on the scripts available.
- Check for unresolved imports, missing files, invalid exports, and obvious runtime errors.
- Check for accidental debug code, unfinished TODOs that affect release functionality, and development-only behavior.
- Review the Git diff to identify unintended changes.
- Fix confirmed issues caused by the current implementation and rerun the relevant checks.

Do not hide warnings or disable lint rules just to make checks pass.

## 3. Expo and EAS Configuration

- Verify the Expo app configuration is valid.
- Run `npx expo-doctor`.
- Check dependency compatibility with the installed Expo SDK. Run `npx expo install --check` if supported by the installed SDK and CLI; do not automatically upgrade packages.
- Inspect `eas.json` and confirm the intended Android build profile exists.
- Verify the Android package identifier, app name, version, and version code configuration.
- Check notification-related Expo configuration and config plugins if reminders are part of the release.
- Identify any required EAS environment variables or credentials without printing secrets.
- Do not change application identifiers, signing credentials, or build profiles without approval.

## 4. Database and Storage Validation

Review the storage implementation before building:

- Verify all database migrations are present and applied in the correct order.
- Check that repositories, Zustand stores, and storage adapters follow `AGENTS.md`.
- Verify SQLite and web memory-storage implementations remain consistent where applicable.
- Confirm recent changes, including transaction payment status and reminder notes, do not break existing data.
- Check that existing user data remains compatible with the latest schema.
- Run `npm run verify:db` if available.
- Do not reset the database or delete user data to make tests pass.

## 5. Validate Important User Flows

Inspect the existing implementation and test the following flows where practical:

**Budgets and transactions**

- Create, edit, and view budgets.
- Create and edit income, expense, and transfer transactions.
- Verify the Paid / Unpaid expense status and the default Paid status for new expenses.
- Verify existing budget totals, spent amounts, and balances remain correct.
- Verify editing a transaction auto-saves only when values actually change.
- Verify unchanged forms cause no update call, storage write, or success toast.
- Verify successful saves show a toast and failed saves do not show a success message.

**Reminders**

- Create and edit reminders with and without notes.
- Verify notes persist correctly.
- Verify notification permissions, scheduling, cancellation, and rescheduling are handled by the existing implementation.
- Check notification behavior on a real Android installation where practical; do not assume Expo Go testing proves standalone APK behavior.

**Navigation and UI**

- Verify all tabs and the center navigation button work.
- Verify Home search finds the expected folders and transactions.
- Verify the calendar and month/year selection work correctly.
- Verify Reports charts and date filters.
- Verify theme switching works in both light and dark modes.
- Check keyboard behavior, safe areas, and form validation on Android.

Do not claim a flow has passed unless it was actually tested. Clearly distinguish automated checks, manual tests, and tests that still require a device.

## 6. Production Bundle Validation

Run the appropriate Expo export or bundle validation commands supported by this project's installed SDK.

At minimum, consider:

- `npx expo export --platform android`
- `npx expo export --platform web` only if web is a supported target and the check is relevant.

These commands validate bundle/export behavior; they do not replace an Android native build or device testing.

If a check generates build artifacts or changes tracked files, inspect the Git diff and report the result. Do not commit changes.

## 7. Android Release Readiness

Review the Android release configuration for:

- App permissions and notification configuration.
- Required native config plugins.
- Application identifier and versioning.
- Release assets and app icon configuration.
- Secrets and environment configuration.
- Known native dependency or configuration issues that may cause EAS build failures.

Do not modify generated native projects or start `eas build` as part of this task.

## 8. Fixing Rules

- Fix only confirmed problems relevant to release readiness.
- After each fix, rerun the appropriate check.
- Avoid speculative changes and unrelated refactoring.
- Do not automatically run `npx expo install --fix`, upgrade Expo, or change major dependencies.
- If a failure requires a decision, new dependency, credentials, or destructive action, stop and explain what is needed.

## 9. Final Report

Provide a concise release-readiness report with:

1. **PASS** — checks completed successfully.
2. **FAIL** — confirmed problems that remain.
3. **NOT TESTED** — checks requiring a physical device, credentials, or external setup.
4. Files changed and fixes applied.
5. Any migration or data compatibility concerns.
6. Exact commands I should run next.

Finish with one clear recommendation:

- **READY FOR EAS BUILD** — no known blocking issues from the checks performed.
- **NOT READY FOR EAS BUILD** — list the blockers that must be resolved first.

Do not start the EAS build. Wait for my approval after reporting the results.
