# MoneyQ — Implement Sub-Transactions / Transaction Breakdown

## Objective

Implement optional sub-transactions (also called breakdown items) in MoneyQ, an existing Expo / React Native budgeting application.

A parent transaction can optionally contain multiple purchases or adjustments. The parent transaction remains the single financial record used by the existing budget, transaction list, and financial summaries. Its amount is automatically calculated from its breakdown items.

**This is an implementation task, not a redesign or a rewrite.** Inspect the existing application, understand its current architecture and UI patterns, and implement the feature with the smallest reasonable set of changes. Preserve existing behavior wherever it is not explicitly changed below.

---

## 1. Mandatory project constraints

Follow the repository's `Agents.md` and existing project conventions.

- Use JavaScript and ESM only.
- Do not introduce TypeScript, `.tsx`, `tsconfig.json`, or TypeScript tooling.
- Use `.jsx` for screens and components, and `.js` for logic and data-access modules.
- Use npm and maintain `package-lock.json`. Use `npx`, not `bunx`.
- Keep all financial data local to the device. Do not add an API, authentication, cloud database, or synchronization service.
- Preserve Expo Router, Zustand, SQLite, and the existing storage architecture.
- Do not add dependencies without approval. Prefer existing packages and native capabilities.
- Do not use Playwright or introduce browser automation.
- Do not hand-edit generated `android/` or `ios/` projects.
- Preserve the existing theme system, including dark mode, and reuse established UI components, bottom sheets, dialogs, buttons, typography, spacing, and colors.
- Use existing money-formatting and date/time utilities. Store monetary values as integer minor units.
- Do not use `toISOString()` to derive local calendar dates.
- Do not make unrelated refactors, redesign unrelated screens, or introduce unrequested features.
- Follow the current Expo SDK's supported APIs and project dependencies.
- Preserve the existing lint configuration and `npm run lint`.

### Required workflow

1. Inspect `Agents.md`, `package.json`, the Expo SDK version, and relevant source files.
2. Trace the current transaction creation/editing flow, transaction detail view, budget views, Calendar, Reports, search, duplication, storage adapters, migrations, import/export, and reminders.
3. Identify existing conventions for transaction status, payment dates, navigation, bottom sheets, Undo feedback, drag-and-drop, and persistence.
4. Provide a brief, feature-specific implementation plan identifying the affected files and any compatibility concerns.
5. Implement the feature after inspection and planning. Do not stop after producing the plan unless a genuine blocker requires clarification.
6. Run proportionate verification, fix regressions, and report the changes and test results honestly.

If an existing implementation already satisfies a requirement, reuse it instead of duplicating it. If a requirement conflicts with the existing architecture, investigate and choose the smallest compatible solution rather than silently changing the architecture.

---

## 2. Understand the feature

Example use case:

A user records a credit-card payment commitment as a parent expense transaction. The individual purchases were made on different dates, but they belong to the same future payment commitment.

The breakdown might contain:

- Groceries — ₱1,250, purchased October 8.
- Fuel — ₱800, purchased October 9.
- Refund adjustment — ₱250, purchased October 10.

The parent transaction amount is calculated as:

₱1,250 + ₱800 − ₱250 = ₱1,800.

The parent transaction has its own optional payment due date, such as October 20. Each breakdown item has its own purchase date and time.

These are two perspectives on the same financial amounts:

- Purchase-date perspective: show each purchase when it occurred.
- Payment-budget perspective: group the purchases under the parent transaction and its budget.

**Never double-count a parent and its breakdown items.** Breakdown items are not independent financial transactions.

---

## 3. Data model and persistence

Inspect the current transaction schema and repository patterns before designing the migration.

### Parent transaction

Preserve the existing transaction model and fields. Add or adapt only the fields necessary to support the feature, including an optional date-only payment due date if an equivalent field does not already exist.

The parent remains responsible for:

- Budget association.
- Transaction type: `expense` or `income`.
- Tag.
- Description and other existing transaction fields.
- Existing payment status.
- Optional payment due date.
- Existing reminder associations and behavior.

Do not add transfer support or a separate payment-status system.

### Breakdown item

Prefer a dedicated `sub_transactions` table rather than storing the breakdown as a JSON blob in the parent transaction.

Each item should have, where consistent with the current repository conventions:

- Stable ID.
- Parent transaction ID.
- Description.
- Signed integer amount in minor currency units.
- Purchase date.
- Purchase time.
- Optional notes.
- Explicit manual ordering position.
- Creation/update timestamps, if used by existing records.

Purchase date and time must represent the item's actual purchase, independently of the parent's budget period and payment due date.

### Persistence requirements

- Add a new numbered SQLite migration. Never rewrite an already-applied migration.
- Enforce parent-child referential integrity and cascading deletion where supported by the existing database configuration.
- Update both native SQLite and in-memory/web storage adapters to maintain behavioral parity.
- Follow the existing storage architecture: UI → Zustand stores → repositories → storage adapter → SQLite or memory.
- Only stores import repositories. Do not bypass repositories by accessing the database from UI components.
- Keep business rules and validation in the appropriate existing logic/repository layer.
- Save the parent and its complete breakdown atomically where supported.
- Prevent orphaned breakdown items.
- Preserve existing transactions and their amounts during migration.
- Existing transactions must remain valid without a breakdown.

A parent with no breakdown continues to use its existing manually entered amount. When breakdown mode is active, the amount is derived from the breakdown.

---

## 4. Activating breakdown mode

The transaction creation and editing form must include a dedicated **Breakdown** section.

The section remains visible even when no breakdown exists.

### Empty state

Display:

- Breakdown heading.
- Brief optional explanation.
- Empty-state message.
- An `Add breakdown` action.

### Existing transaction activation

When an existing transaction has no breakdown and the user taps `Add breakdown`, display a confirmation dialog before changing anything.

Explain that:

- The existing amount will be replaced by the calculated breakdown total.
- The breakdown will initially be empty.
- The resulting parent amount will be zero until items are added.

Provide clear Cancel and Confirm actions.

- Cancel: leave the transaction completely unchanged.
- Confirm: activate breakdown mode, initialize an empty breakdown, and set the parent amount to zero.

The change remains unsaved until the parent transaction is saved.

### New transaction activation

For a new transaction, activating breakdown mode starts with an empty breakdown and a zero total. No destructive confirmation is necessary because no existing transaction amount is being replaced.

### Active breakdown

Once activated:

- The parent amount field becomes read-only.
- The parent amount is calculated from the items.
- Show the ordered breakdown list.
- Provide an `Add item` action below the list.
- Show the calculated breakdown total at the bottom.
- If every item is deleted, keep breakdown mode active with an empty state and a total of zero.

Do not silently switch back to manual-amount mode after the last item is deleted.

---

## 5. Item amount and calculation rules

Breakdown items support both existing transaction types: Expense and Income.

Each item has an entry type:

- **Purchase:** contributes a positive amount.
- **Adjustment:** contributes a negative amount.

The user enters a non-negative amount. The application assigns its sign based on the entry type.

For example:

| Item      | Entry type | Signed amount |
| --------- | ---------- | ------------: |
| Groceries | Purchase   |       +₱1,250 |
| Fuel      | Purchase   |         +₱800 |
| Refund    | Adjustment |         −₱250 |
| Total     |            |        ₱1,800 |

Use integer minor units for calculations. Do not use floating-point arithmetic for financial totals.

### Live total

Recalculate the parent amount immediately when a valid item is added, edited, deleted, undone, or reordered. Reordering must not change the total.

The displayed parent amount must always equal the sum of the signed breakdown item amounts.

### Negative-total validation

The final parent amount must be zero or positive.

- A zero total is valid.
- A negative total is invalid.
- An adjustment that would cause a negative total must not be applied.
- The same rule applies when editing an existing item or switching its entry type.
- If an operation would produce a negative total, preserve the previous valid item and total, keep the editor open, and show an inline validation message.
- Preserve the user's other entered values so they can correct the problem.
- Do not allow the parent transaction to be saved with an invalid breakdown state.

Switching between Purchase and Adjustment must preserve the entered amount and description. Only the sign and calculated total effect change. If switching types would create a negative total, reject the switch and explain the validation error.

Do not change the parent's transaction type when its total is zero. Preserve the existing expense/income type.

---

## 6. Breakdown editor and bottom sheet

Use the application's existing bottom-sheet or modal patterns. Do not introduce a new dependency solely for this feature.

Use one item editor that supports both Add and Edit modes.

### Item fields

- Description — required.
- Amount — required, non-negative, valid monetary input.
- Entry type — Purchase or Adjustment.
- Purchase date — editable.
- Purchase time — editable.
- Notes — optional.

### Compact Notes field

Keep the sheet compact by default.

- Show an `Add note` control when notes are hidden.
- Tapping it reveals an optional multiline notes field.
- Existing notes must be displayed automatically when editing an item that already has notes.
- Notes can be empty.
- Clearing all note text removes the notes when saved.
- Notes must not appear in the main breakdown row.

### Add mode

When the user opens `Add item`:

- Default purchase date and time to the current local date and time.
- Start with empty description and amount fields.
- Use Purchase as the sensible default entry type, unless an established app convention suggests otherwise.
- Allow the user to enter optional notes.

Provide two separate actions:

1. **Add item:** validate the input, add the item to the current unsaved breakdown, recalculate the total, and reset the form for another item. Keep the sheet open so the user can add multiple items consecutively.
2. **Done:** close the sheet and return to the breakdown section without adding any unsubmitted input.

After successfully adding an item, reset the description, amount, notes, and purchase date/time. The date/time should reset to the current local date and time.

If the form is empty, Done closes immediately.

If unsubmitted input exists, Done or closing the sheet must ask the user whether to continue editing or discard the unsubmitted input.

- Continue editing: preserve the entered values and keep the sheet open.
- Discard input: discard only the unsubmitted input and close the sheet.

Previously added items remain in the unsaved parent form.

### Edit mode

When an item is opened and the user selects Edit:

- Enter edit mode within the same bottom sheet.
- Populate all existing fields, including date, time, and notes.
- Provide a **Done** action, not a Save button.
- Done validates the edits, applies them to the current unsaved parent form, recalculates the total, and returns to the breakdown view.
- Closing the sheet with its close icon or gesture also applies valid edits and returns to the breakdown view.
- Invalid edits must remain in the sheet with inline validation. Do not apply invalid changes.
- If validation fails, preserve the user's input and keep the sheet open.

### Validation presentation

- Display errors directly beneath the relevant fields.
- Description is required.
- Amount must be valid, non-negative, and within the existing supported monetary range.
- Do not add an item or modify its original version if validation fails.
- Keep other entered values intact.
- Clear a field's error once it has been corrected.
- Focus the first invalid field when practical.

### Parent edit cancellation

All changes made to the breakdown remain part of the parent's unsaved editing session.

If the user cancels the parent transaction edit or leaves through an existing discard-changes flow, discard all unsaved changes to its items and restore the previously saved parent and breakdown.

Do not persist child edits independently while the parent is still unsaved.

---

## 7. Breakdown item details, row design, and ordering

### Compact breakdown rows

Each row displays:

- Description on a single line, truncated with an ellipsis when necessary.
- Amount prominently displayed and right-aligned.
- Purchase date and time beneath the description.
- A separate drag handle.

Use the existing app's typography, theme tokens, spacing, and color conventions.

Purchases use the appropriate positive amount styling. Adjustments use a minus sign and subtle adjustment styling or icon. Do not add a redundant `Adjustment` text label to every row.

Keep rows clean: do not place Edit/Delete buttons or overflow menus directly on the row.

### Item detail sheet

Tapping a row opens its detail sheet, displaying:

- Full description.
- Formatted amount.
- Purchase date.
- Purchase time.
- Notes, when present.
- Edit action.
- Delete action.

The detail sheet must show the full description even if the breakdown row truncates it.

Editing uses the same bottom sheet and validation rules described above.

### Manual ordering

Support manual drag-and-drop ordering using a separate drag handle.

- Dragging must not trigger the item's detail sheet.
- Tapping a row must not initiate dragging.
- Persist the selected ordering.
- Use saved manual order as the default breakdown display order, not purchase-date sorting.
- Preserve ordering through item edits, parent saves, duplication, moving budgets, backup/export/import, and restoration.
- Reordering must not affect the total.
- Provide a practical accessible alternative to drag-and-drop reordering where feasible, using existing capabilities.

Reuse an existing suitable drag-and-drop dependency if available. Do not add a dependency without approval; if no suitable solution exists, use existing platform capabilities and document any material limitation.

### Breakdown total and adding items

At the bottom of the section, show the calculated total after the list and Add item action.

When there are no items, show the empty state and the zero total.

---

## 8. Delete and Undo behavior

When the user selects Delete in the item detail sheet:

1. Close the detail sheet.
2. Remove the item immediately from the current unsaved breakdown.
3. Recalculate the parent total.
4. Display a temporary snackbar at the bottom of the screen with an `Undo` action.
5. Allow the user to continue working normally while the snackbar is visible.

Undo restores the deleted item with its original values and exact previous manual ordering position. Recalculate the parent total immediately.

If the snackbar expires, the item remains deleted from the current unsaved breakdown.

Deletion is not permanently committed until the parent transaction and its breakdown are saved.

Cancelling the parent edit must restore the previously saved breakdown, regardless of deletions or Undo actions performed in the unsaved session.

Avoid allowing multiple pending deletions to produce incorrect restoration order or duplicate IDs. If necessary, maintain an in-memory undo record for each pending deletion and handle overlapping Undo actions safely.

Use the existing snackbar or feedback component if available.

---

## 9. Transaction detail view and main transaction list

### Transaction detail view

When a parent has a breakdown, show a Breakdown section in the transaction details.

- Collapsed by default.
- The collapsed state displays the item count and calculated total.
- Expanding shows the items in saved manual order.
- Reuse the compact row design.
- Tapping a child item opens its detail sheet.
- The full item details, including notes, remain accessible.
- Tapping a child item from Calendar should also identify the relevant item when opening the parent transaction.

Transactions without breakdowns should retain their existing detail presentation without unnecessary empty sections.

### Main transaction list

Keep the main list compact. Do not display child rows or make the parent row expandable.

For a parent with a breakdown, show a subtle item count beneath its description, such as `3 items`.

Continue displaying the parent amount, description, date, status, and other existing fields according to current conventions.

Do not display a separate financial total for each child in the main transaction list.

---

## 10. Transaction behavior and financial consistency

### Reports and budget calculations

All existing budget totals, reports, pie charts, expense/income summaries, and transaction counts must continue to count the parent transaction only.

- Never count the parent amount and its children separately.
- An adjustment reduces the parent's total; it is not an independent income or expense.
- Preserve existing expense/income categorization based on the parent's transaction type.
- Use the parent tag for all existing tag-based summaries and filters.

### Parent edits

Editing the parent's description, budget, tag, status, payment due date, or other existing fields must preserve its breakdown unless the user explicitly modifies the breakdown.

The parent amount cannot be manually edited while breakdown mode is active.

### Duplication

When duplicating a transaction with a breakdown:

- Copy the complete breakdown.
- Generate new IDs for every copied item.
- Link the copied items to the new parent transaction.
- Preserve descriptions, signed amounts, notes, purchase dates, purchase times, and manual ordering.
- Recalculate the copied parent's total from its items.
- Do not reuse the original children's IDs.
- Follow existing duplication rules for other parent fields, including dates, payment status, and reminders. Do not silently change established behavior.

### Moving between budgets

When a parent transaction is moved to another budget, keep its breakdown attached to that parent.

Do not change the breakdown amounts, purchase dates, times, or manual order.

The new parent budget association determines the payment-budget grouping.

### Deleting the parent

Deleting a parent transaction must also delete its breakdown items as part of the same logical operation, leaving no orphan records.

Preserve any existing parent-deletion confirmation and Undo behavior unless a change is required for data integrity.

---

## 11. Search and filters

Extend the existing search implementation so that a search matching a breakdown item's description returns the parent transaction.

Requirements:

- Return the parent transaction, not a separate child result.
- Display the parent's calculated total and item count.
- Avoid duplicate parent results if multiple child descriptions match the query.
- Preserve existing parent-description search behavior.
- Existing tag filters operate on the parent's tag.
- Existing budget filters operate on the parent's budget.

Use the current search architecture rather than introducing a separate search subsystem.

---

## 12. Payment due date and Calendar integration

The parent transaction can have an optional payment due date independent of its budget period and child purchase dates.

Inspect existing date and payment-status fields before adding anything. Reuse equivalent existing fields and behaviors where possible.

### Payment due date

- Date-only value, without a time component.
- Editable on the parent transaction.
- Independent of the budget's start/end dates.
- Independent of the child purchase dates.
- Clearing the date removes the scheduled payment event without deleting the parent or its breakdown.
- Do not infer the due date from the budget end date.

### Calendar events

The Calendar must show both kinds of events:

1. **Purchase events:** Each breakdown item appears on its actual purchase date and time.
2. **Payment events:** The parent appears on its payment due date as an all-day event.

Use distinct visual treatments so users can distinguish purchase activity from payment commitments.

Tapping a purchase event opens its parent transaction and identifies the relevant breakdown item.

Tapping a payment event opens the parent transaction.

Do not show child purchase events as separate financial transactions in normal transaction lists or financial summaries.

### Payment status

Reuse the parent's existing Paid/unpaid status. Do not create a second payment status for the Calendar.

Keep payment events visible even after the parent is marked Paid, with a clear Paid label.

Derive the Calendar's payment lifecycle as follows:

- **Upcoming:** Due date is in the future and the parent is unpaid.
- **Due today:** Due date is today and the parent is unpaid.
- **Overdue:** Due date has passed and the parent is unpaid.
- **Paid:** The parent is marked Paid, regardless of whether payment occurred early or late.

Do not move an overdue event to the current date. Keep it on its original due date.

Preserve existing transaction-status defaults and rules, including the existing behavior where transactions are Paid by default if that remains the application's current convention.

### Date independence

- Changing the parent budget period must not move its payment event or child purchase dates.
- Changing the parent payment due date moves only the payment event.
- Changing a child's purchase date or time moves only that child's purchase event.
- Parent and child dates must use the app's existing local-date handling utilities.

### Existing Calendar behavior

Preserve existing calendar selection, navigation, event interactions, and visual conventions. Integrate the new event types without duplicating existing parent events or disrupting unrelated reminders.

---

## 13. Purchase-date reports and payment-budget views

Support the two perspectives without double-counting.

### Purchase-date perspective

When a report groups financial activity by when purchases occurred, include each breakdown item's signed amount in its purchase-date period.

Do not additionally include the full parent amount in that same purchase-date calculation.

A transaction without a breakdown continues to use its existing date and amount behavior.

### Payment-budget perspective

When viewing a budget or payment commitment, group the breakdown under the parent transaction and its associated budget.

Use the calculated parent total for budget and payment summaries.

The two perspectives represent the same financial amounts, not additional transactions.

Inspect the current Reports architecture before making changes. Integrate the feature into existing report calculations and UI rather than redesigning Reports.

If a particular report currently has a well-defined date basis, preserve it unless it must change to support the explicit purchase-date perspective. Avoid introducing ambiguous or duplicated metrics.

---

## 14. Import, export, backup, restore, and merge

Extend the existing versioned JSON import/export implementation.

Do not introduce another backup format.

### Export

Include:

- Parent transactions.
- Breakdown items.
- Stable IDs and parent relationships.
- Signed integer amounts.
- Purchase dates and times.
- Notes.
- Manual ordering positions.
- Parent payment due dates.
- All other existing backed-up budgets, tags, reminders, and settings.

Preserve the application's existing backup-versioning conventions.

### Backward compatibility

Older backup files that do not contain breakdown items must remain valid. Their transactions are imported as transactions without a breakdown, using their existing amounts and behavior.

### Full restore

Restore parent transactions and their breakdowns consistently, including payment due dates and item ordering.

Restore settings according to the existing full-restore behavior. Do not change unrelated backup semantics.

### Merge conflict policy

Treat a parent transaction and its entire breakdown as **one conflict group**.

For a conflicting parent, allow the existing merge choices:

- Keep Existing.
- Replace with Imported.
- Skip.

Never merge two conflicting child collections independently or mix existing and imported breakdown items.

- Keep Existing: preserve the existing parent and its complete breakdown.
- Replace with Imported: replace the parent and its complete breakdown with the imported versions.
- Skip: leave the existing parent and its breakdown unchanged.

Apply the existing conflict behavior for non-conflicting records.

### Validation and atomicity

Validate the import before committing changes.

Reject invalid backup data, including:

- Malformed or invalid breakdown records.
- Duplicate item IDs where prohibited by the existing format.
- Missing or invalid parent relationships.
- Invalid signed amounts or purchase date/time values.
- Parent breakdown totals that are negative.
- Invalid or inconsistent manual ordering data.

Do not partially import a backup because some breakdown records are invalid. Where the existing architecture supports transactions, commit the validated parent and child data atomically.

Maintain referential integrity throughout restore and merge operations.

### Recovery backup

Preserve the existing requirement that recovery backups use a separate file through the system file interface.

Do not introduce a custom cloud backup or an unrelated file-management system.

### Reminders and notification failures

Preserve existing reminder behavior and scheduling rules.

If a reminder scheduling operation fails after the financial database transaction commits, do not lose or roll back the saved transaction data unnecessarily. Use the existing warning and retry patterns if available.

---

## 15. UX, accessibility, and styling

- Reuse the application's existing theme provider and design tokens.
- Ensure the new components work in both light and dark themes.
- Use existing positive/negative financial color conventions.
- Use the application's existing icon abstraction backed by `expo-symbols`; do not introduce `@expo/vector-icons`.
- Keep breakdown rows visually compact.
- Keep descriptions on one line with ellipsis truncation.
- Use full descriptions in detail views.
- Keep notes out of list rows.
- Place the total at the bottom of the breakdown section.
- Use a bottom snackbar for Undo.
- Avoid unnecessary animations, confirmation dialogs, or decorative UI.
- Keep keyboard handling and sheet dismissal behavior consistent with existing forms.
- Ensure drag handles, item actions, date/time inputs, validation errors, and buttons are accessible and usable on Android.
- Do not hardcode colors in ways that break dark mode.

---

## 16. Testing and verification

Use the existing test infrastructure if present. Do not add a new testing framework without approval.

Perform focused verification covering the following.

### Data and calculations

- New transactions with and without breakdowns.
- Existing transaction activation, confirmation, and cancellation.
- Purchase and Adjustment calculations.
- Zero totals.
- Prevention of negative totals.
- Invalid edit and entry-type-switch behavior.
- Immediate total recalculation.
- Integer minor-unit calculations.
- Persistence across app restarts where applicable.
- SQLite and in-memory adapter parity.

### Editor interactions

- Add several items consecutively.
- Correct date/time defaults and reset behavior.
- Optional notes reveal, editing, and clearing.
- Edit existing items using Done.
- Closing the sheet with valid changes.
- Validation errors preserve entered values.
- Invalid changes do not alter the original item.
- Empty-form dismissal.
- Confirmation when discarding unsubmitted input.
- Parent cancellation discards all unsaved changes.

### Deletion and ordering

- Delete an item and verify the total.
- Undo restores the exact item and ordering position.
- Snackbar expiration leaves the item deleted in the current editing session.
- Repeated deletions and Undo do not duplicate IDs or corrupt ordering.
- Deleting the last item preserves breakdown mode with a zero total.
- Manual order survives saving, editing, reordering, and duplication.

### Parent transaction behavior

- Editing parent fields preserves the breakdown.
- Parent amount stays read-only while breakdown mode is active.
- Parent deletion removes all children.
- Duplication creates new child IDs and recalculates the total.
- Moving a parent between budgets preserves its children.

### Financial integration

- Budget totals do not double-count.
- Expense/income reports remain correct.
- Purchase-date reports use child amounts and dates.
- Payment-budget views use the parent total.
- Search returns the parent once when a child description matches.
- Tag and budget filters remain correct.
- Main transaction lists show only the parent with a subtle item count.

### Calendar and payments

- Child purchase events appear on the correct local dates and times.
- Parent payment events appear as all-day events.
- Purchase and payment events are visually distinguishable.
- Event navigation opens the correct parent and identifies a selected child when applicable.
- Upcoming, Due today, Overdue, and Paid labels are correct.
- Overdue dates remain unchanged.
- Editing one date does not unintentionally move other events.
- Clearing the payment due date removes only the payment event.

### Import/export and migrations

- New-format export/import round trip.
- Legacy backup without breakdown items.
- Full restore.
- Merge conflict decisions for complete parent-plus-breakdown groups.
- Invalid data rejection without partial import.
- Recovery backup behavior.
- Existing databases migrate without losing transaction data.
- Native and web/in-memory storage remain consistent.

### Final checks

Run:

- `npm run lint`
- Relevant existing tests.
- Focused additional tests using existing tools where practical.
- A development startup or build check appropriate to the current Expo setup, if feasible.

Do not claim that Android runtime, Calendar, notification, or import/export behavior has been verified unless it was actually tested.

Do not introduce Playwright or unrelated automation.

---

## 17. Completion criteria

The task is complete when:

1. Users can optionally activate a breakdown for Expense and Income transactions.
2. Parent totals are derived correctly from signed items.
3. Item creation, editing, notes, dates, validation, deletion, Undo, and manual ordering work consistently.
4. Parent and child persistence is reliable, including migration and cascading deletion.
5. Existing budget calculations and reports do not double-count.
6. Search and Calendar integrate the feature correctly.
7. Purchase-date and payment-budget perspectives remain consistent.
8. Duplication, moving budgets, export, import, restore, and merge preserve the complete breakdown.
9. Existing transactions and older backups remain compatible.
10. Light/dark themes and existing navigation patterns remain intact.
11. Relevant lint checks, tests, and feasible startup/build checks pass.
12. No unrelated dependencies, architecture rewrites, or UI changes have been introduced.

At completion, report:

- What was implemented.
- The important files and migration added or changed.
- The validation and tests performed, including any failures.
- Any genuine limitations or remaining manual Android testing.

**Implement the complete feature within the existing architecture. Do not stop at planning, do not broaden the scope, and do not claim unverified behavior as tested.**
