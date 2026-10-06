import { DatabaseSync } from 'node:sqlite';

import { migration } from '../database/migrations/001_initial.js';
import { LATEST_VERSION, migrations } from '../database/migrations/index.js';
import {
  computeAccountBalance,
  computeBudgetStatus,
  computeSpendByCategory,
  computeTotals,
  computeTotalAssets,
} from '../utils/calculations.js';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

/** Emulates the expo-sqlite async API surface on top of node:sqlite. */
function createAdapter(db) {
  return {
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
  };
}

function insertTransaction(db, row) {
  return db
    .prepare(
      `INSERT INTO transactions
        (id, type, amount, account_id, to_account_id, category_id, description, transaction_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.type,
      row.amount,
      row.account_id,
      row.to_account_id ?? null,
      row.category_id ?? null,
      row.description ?? null,
      row.transaction_date,
      '2026-10-06T00:00:00.000Z',
      '2026-10-06T00:00:00.000Z',
    );
}

const db = new DatabaseSync(':memory:');
const adapter = createAdapter(db);

console.log('\n--- schema ---');
await migration.up(adapter);

const tables = (
  await adapter.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
).map((row) => row.name);

for (const expected of [
  'accounts',
  'budget_categories',
  'budgets',
  'categories',
  'settings',
  'transactions',
]) {
  check(`table ${expected} exists`, tables.includes(expected));
}

check('LATEST_VERSION matches single migration', LATEST_VERSION === 1, String(LATEST_VERSION));
check(
  'migrations are unique and ascending',
  migrations.every((entry, index) => entry.version === index + 1),
);

console.log('\n--- default category seed ---');
const seeded = await adapter.getFirstAsync('SELECT COUNT(*) AS total FROM categories');
check('seeds 9 default categories', seeded.total === 9, `got ${seeded.total}`);

// Simulates a second app launch re-running the seed path.
await migration.up(adapter);
const afterReseed = await adapter.getFirstAsync('SELECT COUNT(*) AS total FROM categories');
check('seed does not duplicate on repeat', afterReseed.total === 9, `got ${afterReseed.total}`);

const renamed = await adapter.getFirstAsync(
  `SELECT name FROM categories WHERE id = 'default_food'`,
);
await adapter.runAsync(`UPDATE categories SET name = 'Eating Out' WHERE id = 'default_food'`);
await migration.up(adapter);
const preserved = await adapter.getFirstAsync(
  `SELECT name FROM categories WHERE id = 'default_food'`,
);
check('re-seeding preserves user renames', preserved.name === 'Eating Out', preserved.name);
void renamed;

console.log('\n--- financial rules ---');
await adapter.runAsync(
  `INSERT INTO accounts (id, name, type, initial_balance, archived, created_at, updated_at)
   VALUES ('acc_bdo', 'BDO', 'bank', 0, 0, '2026-10-06', '2026-10-06')`,
);
await adapter.runAsync(
  `INSERT INTO accounts (id, name, type, initial_balance, archived, created_at, updated_at)
   VALUES ('acc_gcash', 'GCash', 'ewallet', 0, 0, '2026-10-06', '2026-10-06')`,
);

insertTransaction(db, {
  id: 't_income',
  type: 'income',
  amount: 4_000_000, // ₱40,000.00 in centavos
  account_id: 'acc_bdo',
  category_id: 'default_other',
  description: 'Salary',
  transaction_date: '2026-10-02',
});
insertTransaction(db, {
  id: 't_expense',
  type: 'expense',
  amount: 1_450_000, // ₱14,500.00
  account_id: 'acc_bdo',
  category_id: 'default_food',
  description: 'Groceries',
  transaction_date: '2026-10-03',
});
insertTransaction(db, {
  id: 't_transfer',
  type: 'transfer',
  amount: 500_000, // ₱5,000.00
  account_id: 'acc_bdo',
  to_account_id: 'acc_gcash',
  description: 'BDO to GCash',
  transaction_date: '2026-10-04',
});

const accounts = await adapter.getAllAsync('SELECT * FROM accounts');
const transactions = await adapter.getAllAsync('SELECT * FROM transactions');

const assets = computeTotalAssets(accounts, transactions);
check('total assets = income - expenses, transfer is neutral', assets === 2_550_000, String(assets));

const totals = computeTotals(transactions);
check('income total is ₱40,000.00', totals.income === 4_000_000, String(totals.income));
check('expense total is ₱14,500.00', totals.expense === 1_450_000, String(totals.expense));
check('net ignores transfers', totals.net === 2_550_000, String(totals.net));

const bdo = accounts.find((account) => account.id === 'acc_bdo');
const gcash = accounts.find((account) => account.id === 'acc_gcash');
check(
  'BDO balance = 40,000 - 14,500 - 5,000',
  computeAccountBalance(bdo, transactions) === 2_050_000,
);
check(
  'GCash balance = +5,000',
  computeAccountBalance(gcash, transactions) === 500_000,
);

const categories = await adapter.getAllAsync('SELECT * FROM categories');
const byCategory = computeSpendByCategory(transactions, categories);
const food = byCategory.find((entry) => entry.category.id === 'default_food');
check('category spend only counts expenses', food.spent === 1_450_000, String(food.spent));

const budget = computeBudgetStatus({ amount: 2_000_000, spent: 1_700_000 });
check('85% spent reads as warning', budget.status === 'warning', budget.status);
check('budget remaining is correct', budget.remaining === 300_000, String(budget.remaining));
const over = computeBudgetStatus({ amount: 1_000_000, spent: 1_000_001 });
check('spending past the limit reads as over', over.status === 'over', over.status);

console.log('\n--- storage-level constraints ---');
const rejected = [
  ['expense may not carry a destination account', { id: 'x1', type: 'expense', amount: 100, account_id: 'acc_bdo', to_account_id: 'acc_gcash', transaction_date: '2026-10-05' }],
  ['transfer requires a destination account', { id: 'x2', type: 'transfer', amount: 100, account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['transfer may not target its own account', { id: 'x3', type: 'transfer', amount: 100, account_id: 'acc_bdo', to_account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['amount must be greater than zero', { id: 'x4', type: 'expense', amount: 0, account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['negative amounts are not allowed', { id: 'x5', type: 'expense', amount: -500, account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['type must be a known kind', { id: 'x6', type: 'refund', amount: 100, account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
];

for (const [label, row] of rejected) {
  let threw = false;
  try {
    insertTransaction(db, row);
  } catch {
    threw = true;
  }
  check(`rejects: ${label}`, threw);
}

let deleteBlocked = false;
try {
  await adapter.runAsync(`DELETE FROM accounts WHERE id = 'acc_bdo'`);
} catch {
  deleteBlocked = true;
}
check('refuses to delete an account with transactions', deleteBlocked);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);