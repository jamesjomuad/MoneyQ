import { getDatabase } from '../database';

/**
 * Read-only queries backing the dashboard. All aggregation of those rows into
 * meaningful figures happens in utils/calculations.js, never here, so the
 * financial rules stay in exactly one place.
 *
 * Note: balances are all-time, so this returns every transaction rather than
 * just the visible month. That is intentional for now — a personal budget on a
 * local device holds a small number of rows. If that ever changes, move the
 * per-account SUM into SQL while keeping calculations.js as the single
 * definition of the rules.
 */

export async function getAccounts() {
  const db = await getDatabase();
  return db.getAllAsync(
    'SELECT * FROM accounts WHERE archived = 0 ORDER BY created_at ASC',
  );
}

export async function getAllTransactions() {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT * FROM transactions
     ORDER BY transaction_date DESC, created_at DESC`,
  );
}

export async function getRowCounts() {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`
    SELECT
      (SELECT COUNT(*) FROM accounts)          AS accountCount,
      (SELECT COUNT(*) FROM categories)        AS categoryCount,
      (SELECT COUNT(*) FROM transactions)      AS transactionCount,
      (SELECT COUNT(*) FROM budgets)           AS budgetCount,
      (SELECT COUNT(*) FROM budget_categories) AS budgetCategoryCount
  `);

  return {
    accountCount: row?.accountCount ?? 0,
    categoryCount: row?.categoryCount ?? 0,
    transactionCount: row?.transactionCount ?? 0,
    budgetCount: row?.budgetCount ?? 0,
    budgetCategoryCount: row?.budgetCategoryCount ?? 0,
  };
}