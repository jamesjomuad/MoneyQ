/**
 * Multi-file attachments — receipts become rows, not a column.
 *
 *   `attachments` — one row per image attached to a transaction: a unique
 *     id, the NOT NULL parent reference with `ON DELETE CASCADE` (mirrored
 *     by both adapters like sub-transactions), and the same document-
 *     relative `receipts/<name>.<ext>` file reference the old column held.
 *     A (transaction_id, id) index serves ordered reads; created_at, id
 *     ordering in the repository is stable because the backfill below
 *     copies the parent's timestamps.
 *
 *   `transactions.receipt_path` is dropped. SQLite cannot drop a column
 *     on every supported platform, so the table is rebuilt exactly as
 *     migration 008 did: every value and constraint is copied verbatim
 *     (including the later `payment_due_date` column), and both side
 *     effects of dropping the old table are handled the same way —
 *     reminder links are stashed and restored (their FK is ON DELETE SET
 *     NULL), and sub-transaction rows are stashed and re-inserted (their
 *     FK is ON DELETE CASCADE). Existing receipt files on disk are
 *     untouched; each non-NULL legacy reference becomes one attachment
 *     row, so saved receipts simply keep working.
 */
export const migration = {
  version: 14,
  name: 'attachments',

  async up(db) {
    await db.execAsync(`
      CREATE TABLE reminder_links_v14 (
        id             TEXT PRIMARY KEY NOT NULL,
        transaction_id TEXT NOT NULL
      );

      INSERT INTO reminder_links_v14 (id, transaction_id)
        SELECT id, transaction_id FROM reminders WHERE transaction_id IS NOT NULL;

      CREATE TABLE sub_transactions_v14 (
        id             TEXT PRIMARY KEY NOT NULL,
        transaction_id TEXT NOT NULL,
        description    TEXT NOT NULL,
        amount         INTEGER NOT NULL,
        position       INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        purchase_date  TEXT,
        purchase_time  TEXT,
        notes          TEXT
      );

      INSERT INTO sub_transactions_v14
        (id, transaction_id, description, amount, position,
         created_at, updated_at, purchase_date, purchase_time, notes)
      SELECT id, transaction_id, description, amount, position,
             created_at, updated_at, purchase_date, purchase_time, notes
        FROM sub_transactions;

      -- Empty the child table explicitly rather than trusting the DROP below to
      -- cascade into it: where enforcement is not active, or a child row already
      -- points at a transaction that is gone, the cascade never removes those rows
      -- and restocking them from the stash would collide ('UNIQUE constraint
      -- failed: sub_transactions.id' — seen on real installs).
      DELETE FROM sub_transactions;

      CREATE TABLE receipt_seed_v14 (
        transaction_id TEXT NOT NULL,
        path           TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      INSERT INTO receipt_seed_v14 (transaction_id, path, created_at, updated_at)
        SELECT id, receipt_path, created_at, updated_at
          FROM transactions
         WHERE receipt_path IS NOT NULL;

      CREATE TABLE transactions_v14 (
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
        payment_due_date  TEXT,
        CHECK (
          (type = 'transfer'
            AND account_id IS NOT NULL
            AND to_account_id IS NOT NULL
            AND to_account_id <> account_id)
          OR
          (type <> 'transfer' AND to_account_id IS NULL)
        )
      );

      INSERT INTO transactions_v14
        (id, budget_id, type, amount, tag_id, account_id, to_account_id,
         description, transaction_date, payment_status, has_breakdown,
         created_at, updated_at, payment_due_date)
      SELECT id, budget_id, type, amount, tag_id, account_id, to_account_id,
             description, transaction_date, payment_status, has_breakdown,
             created_at, updated_at, payment_due_date
        FROM transactions;

      DROP TABLE transactions;

      ALTER TABLE transactions_v14 RENAME TO transactions;

      CREATE INDEX IF NOT EXISTS idx_transactions_budget  ON transactions (budget_id, transaction_date DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_tag     ON transactions (tag_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_due     ON transactions (payment_due_date);
      CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions (transaction_date DESC, created_at DESC);

      INSERT INTO sub_transactions
        (id, transaction_id, description, amount, position,
         created_at, updated_at, purchase_date, purchase_time, notes)
      SELECT id, transaction_id, description, amount, position,
             created_at, updated_at, purchase_date, purchase_time, notes
        FROM sub_transactions_v14
        -- Rows whose parent transaction no longer exists (accumulated while
        -- enforcement was off somewhere in the row's history) cannot come back
        -- without violating the foreign key, and no screen ever shows them.
        -- Dropping them leaves the rebuilt table identical to what every read
        -- query already sees.
        WHERE transaction_id IN (SELECT id FROM transactions);

      DROP TABLE sub_transactions_v14;

      UPDATE reminders
         SET transaction_id = (
           SELECT link.transaction_id FROM reminder_links_v14 link
            WHERE link.id = reminders.id
         );

      DROP TABLE reminder_links_v14;

      CREATE TABLE attachments (
        id             TEXT PRIMARY KEY NOT NULL,
        transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        path           TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_transaction
        ON attachments (transaction_id, id);

      INSERT INTO attachments (id, transaction_id, path, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), transaction_id, path, created_at, updated_at
          FROM receipt_seed_v14;

      DROP TABLE receipt_seed_v14;
    `);
  },
};
