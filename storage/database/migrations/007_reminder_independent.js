/**
 * Makes reminders independent records that may optionally belong to a
 * transaction:
 *
 *   `transaction_id` — nullable, with `ON DELETE SET NULL` so deleting a
 *     transaction (or a whole budget's transactions) clears the link instead
 *     of destroying the reminder; the row survives as a standalone reminder.
 *   `status`         — 'active' | 'completed'. Lifecycle state, kept separate
 *     from the `enabled` toggle (which still means "notification armed") and
 *     from any transaction payment status. Existing rows default to 'active'.
 *   The UNIQUE index on transaction_id is dropped: one transaction can own
 *     several reminders. A plain index keeps lookups fast, and a new date
 *     index serves the Calendar tab's per-day queries.
 *
 * SQLite cannot alter nullability or constraints in place, so the table is
 * rebuilt through the documented 12-step procedure. Every existing row is
 * copied with its id, schedule, notes and notification id intact — a user's
 * scheduled reminders keep working across the upgrade.
 */
export const migration = {
  version: 7,
  name: 'reminder_independent',

  async up(db) {
    await db.execAsync(`
      CREATE TABLE reminders_v7 (
        id              TEXT PRIMARY KEY NOT NULL,
        transaction_id  TEXT REFERENCES transactions(id) ON DELETE SET NULL,
        enabled         INTEGER NOT NULL DEFAULT 1,
        status          TEXT NOT NULL DEFAULT 'active',
        remind_date     TEXT NOT NULL,
        remind_time     TEXT NOT NULL,
        remind_at       TEXT NOT NULL,
        notification_id TEXT,
        notes           TEXT NOT NULL DEFAULT '',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      INSERT INTO reminders_v7
        (id, transaction_id, enabled, status, remind_date, remind_time,
         remind_at, notification_id, notes, created_at, updated_at)
      SELECT id, transaction_id, enabled, 'active', remind_date, remind_time,
             remind_at, notification_id, notes, created_at, updated_at
        FROM reminders;

      DROP TABLE reminders;

      ALTER TABLE reminders_v7 RENAME TO reminders;

      CREATE INDEX idx_reminders_transaction
        ON reminders (transaction_id);

      CREATE INDEX idx_reminders_date
        ON reminders (remind_date);
    `);
  },
};
