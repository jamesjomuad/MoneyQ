import { DEFAULT_TAGS } from '../../../constants/finance';
import { nowIso } from '../../../utils/id';

export const migration = {
  version: 1,
  name: 'initial_schema',

  async up(db) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      -- Optional money containers. A Budget is only a period with a name; it
      -- has no spending limit of its own, so "spent" is always derived from
      -- the transactions inside it.
      CREATE TABLE IF NOT EXISTS budgets (
        id           TEXT PRIMARY KEY NOT NULL,
        name         TEXT NOT NULL,
        start_date   TEXT NOT NULL,
        end_date     TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_budgets_dates ON budgets (start_date DESC, created_at DESC);

      -- A single reusable tag library shared by every budget.
      CREATE TABLE IF NOT EXISTS tags (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL UNIQUE,
        emoji       TEXT,
        color       TEXT,
        is_default  INTEGER NOT NULL DEFAULT 0,
        archived    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      -- Kept for accounts, which are optional in the UI for now. Balances are
      -- derived; there is no stored balance column to drift out of sync.
      CREATE TABLE IF NOT EXISTS accounts (
        id               TEXT PRIMARY KEY NOT NULL,
        name             TEXT NOT NULL,
        type             TEXT NOT NULL DEFAULT 'cash',
        initial_balance  INTEGER NOT NULL DEFAULT 0,
        archived         INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );

      -- A transfer needs a distinct source and destination account and may not
      -- carry a tag; income and expense may not reference a destination. The
      -- rule is enforced here as well as in utils/calculations.js so it cannot
      -- be forgotten by a future screen.
      CREATE TABLE IF NOT EXISTS transactions (
        id                TEXT PRIMARY KEY NOT NULL,
        budget_id         TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
        type              TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
        amount            INTEGER NOT NULL CHECK (amount > 0),
        tag_id            TEXT REFERENCES tags(id) ON DELETE SET NULL,
        account_id        TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
        to_account_id     TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
        description       TEXT,
        transaction_date  TEXT NOT NULL,
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

      CREATE INDEX IF NOT EXISTS idx_transactions_budget  ON transactions (budget_id, transaction_date DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_tag     ON transactions (tag_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);

      -- App preferences live in SQLite alongside the financial data so the
      -- database remains the single source of truth for everything persisted.
      CREATE TABLE IF NOT EXISTS settings (
        key    TEXT PRIMARY KEY NOT NULL,
        value  TEXT NOT NULL
      );
    `);

    await seedDefaultTags(db);
  },
};

async function seedDefaultTags(db) {
  const timestamp = nowIso();

  // INSERT OR IGNORE keeps this idempotent: renaming or archiving a default
  // tag survives the seed running again.
  for (const tag of DEFAULT_TAGS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO tags (id, name, emoji, color, is_default, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 0, ?, ?)`,
      `default_${tag.key}`,
      tag.name,
      tag.emoji,
      tag.color,
      timestamp,
      timestamp,
    );
  }
}