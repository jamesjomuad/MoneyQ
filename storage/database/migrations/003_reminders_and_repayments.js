/**
 * Adds the two halves of the reminder feature:
 *
 *   1. `reminders` — one optional row per transaction holding the exact local
 *      date/time a notification should fire and the OS notification id, so the
 *      exact notification can be cancelled or rescheduled later. The UNIQUE
 *      index on transaction_id enforces the v1 rule of one reminder per
 *      transaction and is what a future multiple-reminders migration would
 *      drop. ON DELETE CASCADE keeps the table aligned with transactions.
 *
 *   2. repayment columns on `transactions` — whether this entry is money
 *      someone owes the user (`owed_to_me`) or money the user owes
 *      (`owed_by_me`), when it is due, and whether it has been settled.
 *      NULL direction means the transaction is not a repayment at all, so
 *      every existing row stays valid without a data backfill.
 *
 * Reminder times are stored as an ISO 8601 string that keeps the local
 * UTC offset (`2026-10-15T09:00:00+08:00`), never as a bare UTC timestamp,
 * so a 9:00 AM reminder in Asia/Manila can never drift by eight hours.
 */
export const migration = {
  version: 3,
  name: 'reminders_and_repayments',

  async up(db) {
    await db.execAsync(`
      ALTER TABLE transactions ADD COLUMN repayment_direction TEXT;
      ALTER TABLE transactions ADD COLUMN repayment_status   TEXT;
      ALTER TABLE transactions ADD COLUMN due_date           TEXT;
      ALTER TABLE transactions ADD COLUMN paid_at            TEXT;

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
