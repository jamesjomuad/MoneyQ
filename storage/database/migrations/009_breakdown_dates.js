/**
 * Completes the breakdown data model (spec sections 3 and 12):
 *
 *   `sub_transactions` gains what a purchase actually is:
 *     `purchase_date` — the item's own local 'YYYY-MM-DD', independent of the
 *       parent's budget period and payment due date, nullable because items
 *       written by migration 008 have none.
 *     `purchase_time` — local 'HH:MM', nullable (a date-only purchase).
 *     `notes` — optional free text, never shown in list rows.
 *
 *   `transactions` gains `payment_due_date` — an optional, date-only day the
 *     commitment is due. It is deliberately NOT the budget end date and NOT
 *     the transaction date: the Calendar reads it for one all-day payment
 *     event, and clearing it removes only that event. Plain ADD COLUMN is
 *     safe here (no CHECK changes, no rebuild), so reminder links and every
 *     existing row value are untouched.
 */
export const migration = {
  version: 9,
  name: 'breakdown_dates',

  async up(db) {
    await db.execAsync(`
      ALTER TABLE sub_transactions ADD COLUMN purchase_date TEXT;
      ALTER TABLE sub_transactions ADD COLUMN purchase_time TEXT;
      ALTER TABLE sub_transactions ADD COLUMN notes TEXT;

      ALTER TABLE transactions ADD COLUMN payment_due_date TEXT;

      CREATE INDEX IF NOT EXISTS idx_sub_transactions_purchase
        ON sub_transactions (purchase_date);

      CREATE INDEX IF NOT EXISTS idx_transactions_due
        ON transactions (payment_due_date);
    `);
  },
};
