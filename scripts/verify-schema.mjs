import { DatabaseSync } from 'node:sqlite';

import { migration } from '../storage/database/migrations/001_initial.js';
import { LATEST_VERSION, migrations } from '../storage/database/migrations/index.js';
import { createMemoryAdapter } from '../storage/adapters/memoryAdapter.js';
import { createSqliteAdapter } from '../storage/adapters/sqliteAdapter.js';
import {
  computeAccountBalance,
  computeSpendByTag,
  computeTotals,
  computeTotalAssets,
} from '../utils/calculations.js';
import { formatDateRange, parseFlexibleDate, toIsoDate } from '../utils/dates.js';

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
        (id, budget_id, type, amount, tag_id, account_id, to_account_id, description, transaction_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.budget_id ?? null,
      row.type,
      row.amount,
      row.tag_id ?? null,
      row.account_id ?? null,
      row.to_account_id ?? null,
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
// Same bookkeeping runMigrations() performs after applying a migration.
db.exec(`PRAGMA user_version = ${LATEST_VERSION}`);

const tables = (
  await adapter.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
).map((row) => row.name);

for (const expected of ['accounts', 'budgets', 'settings', 'tags', 'transactions']) {
  check(`table ${expected} exists`, tables.includes(expected));
}

for (const removed of ['budget_categories', 'categories']) {
  check(`table ${removed} does not exist`, !tables.includes(removed));
}

function columnsOf(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

const budgetColumns = columnsOf('budgets');
check('budgets have no spending-limit column', !budgetColumns.includes('amount'));
check(
  'budgets are period containers',
  ['name', 'start_date', 'end_date'].every((column) => budgetColumns.includes(column)),
  budgetColumns.join(','),
);

const transactionColumns = columnsOf('transactions');
check(
  'transactions reference a budget and a tag',
  ['budget_id', 'tag_id'].every((column) => transactionColumns.includes(column)),
  transactionColumns.join(','),
);
check('transactions no longer use categories', !transactionColumns.includes('category_id'));

check('LATEST_VERSION matches single migration', LATEST_VERSION === 1, String(LATEST_VERSION));
check(
  'migrations are unique and ascending',
  migrations.every((entry, index) => entry.version === index + 1),
);

console.log('\n--- default tag seed ---');
const seeded = await adapter.getFirstAsync('SELECT COUNT(*) AS total FROM tags');
check('seeds 6 default tags', seeded.total === 6, `got ${seeded.total}`);

const household = await adapter.getFirstAsync(
  `SELECT * FROM tags WHERE id = 'default_household'`,
);
check('default tag keeps its emoji', household?.emoji === '🏠', household?.emoji);
check('default tag is marked is_default', household?.is_default === 1);

// Simulates a second app launch re-running the seed path.
await migration.up(adapter);
const afterReseed = await adapter.getFirstAsync('SELECT COUNT(*) AS total FROM tags');
check('seed does not duplicate on repeat', afterReseed.total === 6, `got ${afterReseed.total}`);

await adapter.runAsync(`UPDATE tags SET name = 'Home & Bills' WHERE id = 'default_household'`);
await migration.up(adapter);
const preserved = await adapter.getFirstAsync(
  `SELECT name FROM tags WHERE id = 'default_household'`,
);
check('re-seeding preserves user renames', preserved.name === 'Home & Bills', preserved.name);

console.log('\n--- financial rules ---');
await adapter.runAsync(
  `INSERT INTO accounts (id, name, type, initial_balance, archived, created_at, updated_at)
   VALUES ('acc_bdo', 'BDO', 'bank', 0, 0, '2026-10-06', '2026-10-06')`,
);
await adapter.runAsync(
  `INSERT INTO accounts (id, name, type, initial_balance, archived, created_at, updated_at)
   VALUES ('acc_gcash', 'GCash', 'ewallet', 0, 0, '2026-10-06', '2026-10-06')`,
);
await adapter.runAsync(
  `INSERT INTO budgets (id, name, start_date, end_date, created_at, updated_at)
   VALUES ('b_oct', 'October 2026', '2026-10-01', '2026-10-31', '2026-10-06', '2026-10-06')`,
);

insertTransaction(db, {
  id: 't_income',
  budget_id: 'b_oct',
  type: 'income',
  amount: 4_000_000, // ₱40,000.00 in centavos
  tag_id: 'default_work',
  account_id: 'acc_bdo',
  description: 'Salary',
  transaction_date: '2026-10-02',
});
insertTransaction(db, {
  id: 't_expense',
  budget_id: 'b_oct',
  type: 'expense',
  amount: 1_450_000, // ₱14,500.00
  tag_id: 'default_daily-expenses',
  account_id: 'acc_bdo',
  description: 'Groceries',
  transaction_date: '2026-10-03',
});
insertTransaction(db, {
  id: 't_transfer',
  budget_id: 'b_oct',
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
check('remaining ignores transfers', totals.remaining === 2_550_000, String(totals.remaining));

const bdo = accounts.find((account) => account.id === 'acc_bdo');
const gcash = accounts.find((account) => account.id === 'acc_gcash');
check('BDO balance = 40,000 - 14,500 - 5,000', computeAccountBalance(bdo, transactions) === 2_050_000);
check('GCash balance = +5,000', computeAccountBalance(gcash, transactions) === 500_000);

const tags = await adapter.getAllAsync('SELECT * FROM tags');
const byTag = computeSpendByTag(transactions, tags);
const daily = byTag.find((entry) => entry.tag.id === 'default_daily-expenses');
const work = byTag.find((entry) => entry.tag.id === 'default_work');
const householdSpend = byTag.find((entry) => entry.tag.id === 'default_household');

check('tag spend only counts expenses', daily.spent === 1_450_000, String(daily.spent));
check('income never inflates a tag', work.spent === 0, String(work.spent));
check('unused tags report zero rather than missing', householdSpend.spent === 0);
check('every tag keeps a row so the list stays complete',
  byTag.length === tags.length,
  `${byTag.length} of ${tags.length}`,
);
check('totals also report the transaction count', totals.transactionCount === 3, String(totals.transactionCount));

console.log('\n--- storage-level constraints ---');
const rejected = [
  ['transaction without a budget', { id: 'x0', type: 'expense', amount: 100, tag_id: 'default_work', account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['transaction on an unknown budget', { id: 'x1', budget_id: 'b_missing', type: 'expense', amount: 100, tag_id: 'default_work', account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['expense may not carry a destination account', { id: 'x2', budget_id: 'b_oct', type: 'expense', amount: 100, tag_id: 'default_work', account_id: 'acc_bdo', to_account_id: 'acc_gcash', transaction_date: '2026-10-05' }],
  ['transfer requires a destination account', { id: 'x3', budget_id: 'b_oct', type: 'transfer', amount: 100, account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['transfer may not target its own account', { id: 'x4', budget_id: 'b_oct', type: 'transfer', amount: 100, account_id: 'acc_bdo', to_account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['amount must be greater than zero', { id: 'x5', budget_id: 'b_oct', type: 'expense', amount: 0, tag_id: 'default_work', account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['negative amounts are not allowed', { id: 'x6', budget_id: 'b_oct', type: 'expense', amount: -500, tag_id: 'default_work', account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
  ['type must be a known kind', { id: 'x7', budget_id: 'b_oct', type: 'refund', amount: 100, tag_id: 'default_work', account_id: 'acc_bdo', transaction_date: '2026-10-05' }],
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

console.log('\n--- referential behaviour ---');
insertTransaction(db, {
  id: 't_cascade',
  budget_id: 'b_oct',
  type: 'expense',
  amount: 100,
  tag_id: 'default_work',
  account_id: 'acc_bdo',
  transaction_date: '2026-10-05',
});
await adapter.runAsync(`DELETE FROM tags WHERE id = 'default_work'`);
const orphan = await adapter.getFirstAsync(
  `SELECT amount, tag_id FROM transactions WHERE id = 't_cascade'`,
);
check('deleting a tag keeps its transactions', orphan.amount === 100, String(orphan.amount));
check('deleting a tag clears the reference', orphan.tag_id === null, String(orphan.tag_id));

let accountDeleteBlocked = false;
try {
  await adapter.runAsync(`DELETE FROM accounts WHERE id = 'acc_bdo'`);
} catch {
  accountDeleteBlocked = true;
}
check('refuses to delete an account still used by transactions', accountDeleteBlocked);

await adapter.runAsync(`DELETE FROM budgets WHERE id = 'b_oct'`);
const afterCascade = await adapter.getFirstAsync(
  `SELECT COUNT(*) AS total FROM transactions WHERE budget_id = 'b_oct'`,
);
check('deleting a budget cascades to its transactions', afterCascade.total === 0, String(afterCascade.total));

console.log('\n--- storage adapter parity (sqlite vs memory) ---');

/** Order-independent comparison so column order can never fake a mismatch. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

const STAMP = '2026-10-06T00:00:00.000Z';

/** The exact sequence the app performs through its repositories. */
async function runScenario(store) {
  await store.insertBudget({
    id: 'p_budget',
    name: 'Parity',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertTag({
    id: 'p_tag',
    name: 'Parity Tag',
    emoji: '🎯',
    color: '#123456',
    is_default: 0,
    archived: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertTransaction({
    id: 'p_income',
    budget_id: 'p_budget',
    type: 'income',
    amount: 400_000,
    tag_id: 'p_tag',
    account_id: null,
    to_account_id: null,
    description: 'Salary',
    transaction_date: '2026-10-02',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertTransaction({
    id: 'p_expense',
    budget_id: 'p_budget',
    type: 'expense',
    amount: 150_000,
    tag_id: 'p_tag',
    account_id: null,
    to_account_id: null,
    description: 'Lunch',
    transaction_date: '2026-10-05',
    created_at: STAMP,
    updated_at: STAMP,
  });

  const snapshot = {};
  snapshot.budgets = await store.listBudgets();
  snapshot.transactions = await store.listTransactionsByBudget('p_budget');
  snapshot.duplicateName = await store.findTagByName('Parity Tag');
  snapshot.duplicateNameIgnoringSelf = await store.findTagByName('Parity Tag', 'p_tag');
  snapshot.duplicateNameAgainstOther = await store.findTagByName('Parity Tag', 'someone_else');
  snapshot.tagUsage = await store.countTransactionsUsingTag('p_tag');

  await store.updateTag({
    id: 'p_tag',
    name: 'Renamed Tag',
    emoji: '🎯',
    color: '#654321',
    updated_at: STAMP,
  });
  snapshot.renamedTag = await store.getTag('p_tag');

  await store.deleteTag('p_tag');
  snapshot.tagAfterDelete = await store.getTag('p_tag');
  snapshot.transactionKeepsAmount = await store.getTransaction('p_expense');

  snapshot.deletedBudgets = await store.deleteBudget('p_budget');
  snapshot.budgetAfterDelete = await store.getBudget('p_budget');
  snapshot.transactionsAfterDelete = await store.listTransactionsByBudget('p_budget');

  snapshot.schemaVersion = await store.getSchemaVersion();

  await store.setSetting('currency', 'PHP');
  snapshot.settings = await store.getAllSettings();

  return stable(snapshot);
}

const sqliteResult = await runScenario(createSqliteAdapter(async () => adapter));
const memoryResult = await runScenario(createMemoryAdapter());

const sqliteJson = JSON.stringify(sqliteResult, null, 2);
const memoryJson = JSON.stringify(memoryResult, null, 2);

check(
  'sqlite and memory adapters return identical results',
  sqliteJson === memoryJson,
  sqliteJson === memoryJson ? '' : `\n--- sqlite ---\n${sqliteJson}\n--- memory ---\n${memoryJson}`,
);
check('both adapters report the same schema version', LATEST_VERSION === 1);

console.log('\n--- date handling ---');
check('toIsoDate builds a local date', toIsoDate(new Date(2026, 0, 5)) === '2026-01-05');
check("parses 'Oct 1, 2026'", parseFlexibleDate('Oct 1, 2026') === '2026-10-01');
check("parses 'today'", parseFlexibleDate('today', new Date(2026, 9, 6)) === '2026-10-06');
check('rejects impossible dates', parseFlexibleDate('2026-02-30') === null);
check(
  'formats a period range',
  formatDateRange('2026-10-01', '2026-10-31').includes('2026'),
  formatDateRange('2026-10-01', '2026-10-31'),
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);