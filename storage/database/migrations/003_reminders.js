/**
 * Adds the transaction reminder feature:
 *
 *   `reminders` — one optional row per transaction holding the exact local
 *   date/time a notification should fire and the OS notification id, so the
 *   exact notification can be cancelled or rescheduled later. The UNIQUE
 *   index on transaction_id enforces the v1 rule of one reminder per
 *   transaction and is what a future multiple-reminders migration would
 *   drop. ON DELETE CASCADE keeps the table aligned with transactions.
 *
 * Reminder times are stored as an ISO 8601 string that keeps the local
 * UTC offset (`2026-10-15T09:00:00+08:00`), never as a bare UTC timestamp,
 * so a 9:00 AM reminder in Asia/Manila can never drift by eight hours.
 */
export const migration = {
  version: 3,
  name: 'reminders',

  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS reminders (
        id              TEXT PRIMARY KEY NOT NULL,
        transaction_id  TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        enabled         INTEGER NOT NULL DEFAULT 1,
        remind_date     TEXT NOT NULL,
        remind_time     TEXT NOT NULL,
        remind_at       TEXT NOT NULL,
        notification_id TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_transaction
        ON reminders (transaction_id);
    `);
  },
};
