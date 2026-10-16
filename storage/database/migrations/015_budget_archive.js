/**
 * Soft-delete flag for budgets. `NULL` means the budget is active; an ISO
 * timestamp means the user archived (removed) it. Archiving never touches the
 * budget's transactions, sub-transactions, attachments, reminders, tags, color
 * or folder assignment — only this column — so restoring is lossless.
 *
 * Nullable and unbackfilled: every existing row is active by definition.
 */
export const migration = {
  version: 15,
  name: 'budget_archive',
  async up(db) {
    await db.execAsync(`ALTER TABLE budgets ADD COLUMN deleted_at TEXT;`);
  },
};
