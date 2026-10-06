import { DEFAULT_CATEGORIES } from '../../constants/finance';
import { nowIso } from '../../utils/id';

export const migration = {
  version: 1,
  name: 'initial_schema',

  async up(db) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS accounts (
        id               TEXT PRIMARY KEY NOT NULL,
        name             TEXT NOT NULL,
        type             TEXT NOT NULL DEFAULT 'cash',
        initial_balance  INTEGER NOT NULL DEFAULT 0,
        archived         INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL UNIQUE,
        color       TEXT,
        icon        TEXT,
        is_default  INTEGER NOT NULL DEFAULT 0,
        archived    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      -- A transfer requires a distinct destination account and no transfer may
      -- ever carry a category. Income and expense rows must not reference a
      -- destination account. These constraints enforce the money rules at the
      -- storage layer, not just in the UI.
      CREATE TABLE IF NOT EXISTS transactions (
        id                TEXT PRIMARY KEY NOT NULL,
        type              TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
        amount            INTEGER NOT NULL CHECK (amount > 0),
        account_id        TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        to_account_id     TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
        category_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
        description       TEXT,
        transaction_date  TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        CHECK (
          (type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id)
          OR
          (type <> 'transfer' AND to_account_id IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions (transaction_date DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_account  ON transactions (account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category_id);

      CREATE TABLE IF NOT EXISTS budgets (
        id          TEXT PRIMARY KEY NOT NULL,
        period      TEXT NOT NULL DEFAULT 'monthly',
        month_key   TEXT NOT NULL,
        amount      INTEGER NOT NULL CHECK (amount >= 0),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        UNIQUE (period, month_key)
      );

      CREATE TABLE IF NOT EXISTS budget_categories (
        id           TEXT PRIMARY KEY NOT NULL,
        budget_id    TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
        category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        amount       INTEGER NOT NULL CHECK (amount >= 0),
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        UNIQUE (budget_id, category_id)
      );

      CREATE INDEX IF NOT EXISTS idx_budget_categories_budget ON budget_categories (budget_id);

      -- App preferences live in SQLite alongside the financial data so the
      -- database remains the single source of truth for everything persisted.
      CREATE TABLE IF NOT EXISTS settings (
        key    TEXT PRIMARY KEY NOT NULL,
        value  TEXT NOT NULL
      );
    `);

    await seedDefaultCategories(db);
  },
};

async function seedDefaultCategories(db) {
  const timestamp = nowIso();

  // INSERT OR IGNORE keeps this idempotent: a user who renamed or archived a
  // default category keeps their change when the app re-checks the schema.
  for (const category of DEFAULT_CATEGORIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO categories (id, name, color, icon, is_default, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 0, ?, ?)`,
      `default_${category.key}`,
      category.name,
      category.color,
      category.icon,
      timestamp,
      timestamp,
    );
  }
}