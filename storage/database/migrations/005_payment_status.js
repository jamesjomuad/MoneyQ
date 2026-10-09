/**
 * Adds a payment status to expense transactions:
 *
 *   `transactions.payment_status` — 'paid' or 'unpaid' for expenses, NULL for
 *   income and transfers (they have no payment state). New expenses start
 *   'unpaid' at the repository layer; this migration backfills every expense
 *   that already existed to 'paid' so historical entries keep behaving
 *   exactly as before — the column is purely descriptive and no total,
 *   balance, or report reads it.
 */
export const migration = {
  version: 5,
  name: 'payment_status',

  async up(db) {
    await db.execAsync(`
      ALTER TABLE transactions ADD COLUMN payment_status TEXT;

      UPDATE transactions
         SET payment_status = 'paid'
       WHERE type = 'expense';
    `);
  },
};
