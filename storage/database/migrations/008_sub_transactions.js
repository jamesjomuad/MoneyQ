/**
 * Adds optional transaction breakdowns (sub-transactions):
 *
 *   `sub_transactions` — one row per breakdown item. Signed integer amount in
 *     minor units (negative items are discounts/adjustments), a persisted
 *     `position` for manual ordering, and a NOT NULL parent reference with
 *     `ON DELETE CASCADE` so deleting a transaction can never orphan items.
 *     A (transaction_id, position) index serves ordered reads, and a plain
 *     description index backs the parent-side search lookup.
 *
 *   `transactions` is rebuilt (SQLite cannot alter a CHECK in place) for two
 *     changes: `has_breakdown` marks transactions whose amount is calculated
 *     from items — activation with zero items must be representable — and the
 *     amount CHECK relaxes from `> 0` to `>= 0`, because a breakdown's
 *     calculated total may legitimately be zero. Every other row value and
 *     constraint is copied verbatim; non-breakdown rows keep their positive
 *     amounts and the repository still refuses zero for them.
 *
 *   `reminders.transaction_id` survives the rebuild. Foreign keys are ON for
 *     the whole migration (it runs inside the app's exclusive transaction, so
 *     the pragma cannot be toggled), which means dropping the old
 *     transactions table fires its ON DELETE SET NULL action against every
 *     linked reminder. The links are therefore stashed in a helper table
 *     first and restored after the rename, exactly as they were.
 */
export const migration = {
  version: 8,
  name: 'sub_transactions',

  async up(db) {
    await db.execAsync(`
      CREATE TABLE reminder_links_v8 (
        id             TEXT PRIMARY KEY NOT NULL,
        transaction_id TEXT NOT NULL
      );

      INSERT INTO reminder_links_v8 (id, transaction_id)
        SELECT id, transaction_id FROM reminders WHERE transaction_id IS NOT NULL;

      CREATE TABLE transactions_v8 (
        id                TEXT PRIMARY KEY NOT NULL,
        budget_id         TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
        type              TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
        amount            INTEGER NOT NULL CHECK (amount >= 0),
        tag_id            TEXT REFERENCES tags(id) ON DELETE SET NULL,
        account_id        TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
        to_account_id     TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
        description       TEXT,
        transaction_date  TEXT NOT NULL,
        payment_status    TEXT,
        has_breakdown     INTEGER NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        CHECK (
          (type = 'transfer'
            AND account_id IS NOT NULL
            AND to_account_id IS NOT NULL
            AND to_account_id <> account_id)
          OR
          (type <> 'transfer' AND to_account_id IS NULL)
        )
      );

      INSERT INTO transactions_v8
        (id, budget_id, type, amount, tag_id, account_id, to_account_id,
         description, transaction_date, payment_status, has_breakdown,
         created_at, updated_at)
      SELECT id, budget_id, type, amount, tag_id, account_id, to_account_id,
             description, transaction_date, payment_status, 0,
             created_at, updated_at
        FROM transactions;

      DROP TABLE transactions;

      ALTER TABLE transactions_v8 RENAME TO transactions;

      CREATE INDEX IF NOT EXISTS idx_transactions_budget  ON transactions (budget_id, transaction_date DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_tag     ON transactions (tag_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);

      UPDATE reminders
         SET transaction_id = (
           SELECT link.transaction_id FROM reminder_links_v8 link
            WHERE link.id = reminders.id
         );

      DROP TABLE reminder_links_v8;

      CREATE TABLE sub_transactions (
        id             TEXT PRIMARY KEY NOT NULL,
        transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        description    TEXT NOT NULL,
        amount         INTEGER NOT NULL,
        position       INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sub_transactions_parent
        ON sub_transactions (transaction_id, position);

      CREATE INDEX IF NOT EXISTS idx_sub_transactions_description
        ON sub_transactions (description);
    `);
  },
};
