/**
 * Adds optional free-text notes to reminders:
 *
 *   `reminders.notes` — what the reminder is for. NOT NULL with an empty
 *   string default so every existing row simply reads '' (no backfill, no
 *   reset), and no reader ever has to branch on NULL.
 */
export const migration = {
  version: 6,
  name: 'reminder_notes',

  async up(db) {
    await db.execAsync(`
      ALTER TABLE reminders ADD COLUMN notes TEXT NOT NULL DEFAULT '';
    `);
  },
};
