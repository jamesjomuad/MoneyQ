import { migration as initial } from './001_initial';

/**
 * Milestone 1 shipped a different schema under the same `user_version = 1`
 * and the same `moneyq.db` file: budgets keyed by (period, month_key), plus
 * categories and budget_categories instead of tags. Databases created by that
 * build therefore report version 1, so `runMigrations` never applied the
 * rebuilt 001 and every write failed with
 * "table budgets has no column named name".
 *
 * Version 2 detects that layout and wipes it: the legacy rows (month-keyed
 * budgets, categories, transactions) cannot be expressed in the current
 * period-container model, so the database is rebuilt from 001 instead of
 * carried over. Databases already on the current schema are left untouched.
 */
export const migration = {
  version: 2,
  name: 'rebuild_legacy_schema',

  async up(db) {
    const legacy = await db.getAllAsync(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name IN ('categories', 'budget_categories')`,
    );

    if (legacy.length === 0) {
      return;
    }

    // Children first: transactions reference budgets/accounts/categories, and
    // budget_categories reference budgets/categories. Foreign keys are ON and
    // cannot be toggled inside this migration's transaction.
    const dropOrder = [
      'budget_categories',
      'transactions',
      'categories',
      'budgets',
      'accounts',
      'settings',
      'tags',
    ];
    for (const table of dropOrder) {
      await db.execAsync(`DROP TABLE IF EXISTS ${table}`);
    }

    // Anything left behind by an unknown intermediate build goes too, so the
    // rebuild always starts from an empty database.
    const leftovers = await db.getAllAsync(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    for (const row of leftovers) {
      await db.execAsync(`DROP TABLE IF EXISTS "${row.name}"`);
    }

    await initial.up(db);
  },
};
