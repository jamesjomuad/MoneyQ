/**
 * Performance indexes — additive only, no schema or data change.
 *
 *   `idx_transactions_date` backs `listTransactionsInRange`, the hot
 *     Calendar/Reports month query (`WHERE transaction_date >= ? AND
 *     transaction_date <= ? ORDER BY transaction_date DESC, created_at
 *     DESC`). The existing `idx_transactions_budget` leads with `budget_id`
 *     so it cannot serve an unscoped date filter — every month load was a
 *     full scan plus a temp sort.
 *
 *   `idx_reminders_remind_at` backs `listReminders`' `ORDER BY remind_at`,
 *     which runs on launch resync, calendar focus, and every reminder CRUD
 *     refresh. The old `idx_reminders_date` indexes `remind_date`, a
 *     different column, so the sort was never index-served.
 *
 * The memory/web adapter needs no mirror: it sorts in JS with equivalent
 * comparators, and the parity harness compares results, not plans.
 */
export const migration = {
  version: 11,
  name: 'performance_indexes',

  async up(db) {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date DESC, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders (remind_at);
    `);
  },
};
