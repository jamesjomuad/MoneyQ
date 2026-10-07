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
import {
  addDaysIso,
  DATE_SHORTCUTS,
  daysInclusive,
  formatDateRange,
  friendlyDate,
  isRelativeLabel,
  monthGrid,
  monthWeeks,
  parseFlexibleDate,
  toIsoDate,
} from '../utils/dates.js';

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
for (const entry of migrations) {
  await entry.up(adapter);
}
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

check('LATEST_VERSION matches the migration list', LATEST_VERSION === 2, String(LATEST_VERSION));
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

  snapshot.transactionUpdateChanges = await store.updateTransaction({
    id: 'p_expense',
    type: 'expense',
    amount: 175_000,
    tag_id: 'p_tag',
    description: 'Lunch and a drink',
    transaction_date: '2026-10-05',
    updated_at: STAMP,
  });
  snapshot.updatedTransaction = await store.getTransaction('p_expense');
  snapshot.transactionUpdateMissing = await store.updateTransaction({
    id: 'p_missing',
    type: 'expense',
    amount: 1,
    tag_id: null,
    description: null,
    transaction_date: '2026-10-05',
    updated_at: STAMP,
  });
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
check('both adapters report the same schema version', LATEST_VERSION === 2);

console.log('\n--- legacy milestone-1 upgrade ---');

/** The schema milestone 1 shipped under the same user_version = 1. */
const legacyDb = new DatabaseSync(':memory:');
const legacyAdapter = createAdapter(legacyDb);
legacyAdapter.execAsync(`
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'cash',
    initial_balance INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, color TEXT, icon TEXT,
    is_default INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE budgets (
    id TEXT PRIMARY KEY NOT NULL, period TEXT NOT NULL DEFAULT 'monthly',
    month_key TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount >= 0),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (period, month_key));
  CREATE TABLE budget_categories (
    id TEXT PRIMARY KEY NOT NULL, budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE, amount INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (budget_id, category_id));
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0), account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id), category_id TEXT REFERENCES categories(id),
    description TEXT, transaction_date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  PRAGMA user_version = 1;
`);
await legacyAdapter.runAsync(
  `INSERT INTO budgets (id, period, month_key, amount, created_at, updated_at)
   VALUES ('old_budget', 'monthly', '2026-10', 500000, '2026-10-01', '2026-10-01')`,
);

// Exactly what runMigrations() does: apply only what is newer than user_version.
const fromVersion = legacyDb.prepare('PRAGMA user_version').get().user_version;
const pending = migrations.filter((entry) => entry.version > fromVersion);
check('legacy database has one pending migration', pending.length === 1, String(pending.length));
for (const entry of pending) {
  await entry.up(legacyAdapter);
}
legacyDb.exec(`PRAGMA user_version = ${LATEST_VERSION}`);

const legacyTables = legacyDb
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
  .all()
  .map((row) => row.name);
for (const removed of ['budget_categories', 'categories']) {
  check(`legacy table ${removed} was dropped`, !legacyTables.includes(removed));
}
for (const expected of ['accounts', 'budgets', 'settings', 'tags', 'transactions']) {
  check(`rebuilt table ${expected} exists`, legacyTables.includes(expected));
}

const legacyBudgetColumns = legacyDb.prepare('PRAGMA table_info(budgets)').all().map((c) => c.name);
check(
  'rebuilt budgets are period containers',
  ['name', 'start_date', 'end_date'].every((column) => legacyBudgetColumns.includes(column)),
  legacyBudgetColumns.join(','),
);
const legacyBudgets = await legacyAdapter.getAllAsync('SELECT * FROM budgets');
check('legacy budget rows were wiped', legacyBudgets.length === 0, String(legacyBudgets.length));
const legacyTags = await legacyAdapter.getFirstAsync('SELECT COUNT(*) AS total FROM tags');
check('rebuilt schema seeds default tags', legacyTags.total === 6, `got ${legacyTags.total}`);
check(
  'user_version advanced to the latest migration',
  legacyDb.prepare('PRAGMA user_version').get().user_version === LATEST_VERSION,
);

// The exact statement that failed on device: creating a budget.
let legacyInsertWorked = true;
try {
  await legacyAdapter.runAsync(
    `INSERT INTO budgets (id, name, start_date, end_date, created_at, updated_at)
     VALUES ('b_new', 'November 2026', '2026-11-01', '2026-11-30', '2026-10-07', '2026-10-07')`,
  );
} catch {
  legacyInsertWorked = false;
}
check('create budget works on a rebuilt legacy database', legacyInsertWorked);

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
check(
  'friendlyDate labels today',
  friendlyDate('2026-10-07', new Date(2026, 9, 7)) === 'Today',
  friendlyDate('2026-10-07', new Date(2026, 9, 7)),
);
check(
  'friendlyDate labels tomorrow',
  friendlyDate('2026-10-08', new Date(2026, 9, 7)) === 'Tomorrow',
  friendlyDate('2026-10-08', new Date(2026, 9, 7)),
);
check(
  'friendlyDate falls back to a long date',
  friendlyDate('2026-10-07', new Date(2026, 9, 9)) === 'October 7, 2026',
  friendlyDate('2026-10-07', new Date(2026, 9, 9)),
);
check('relative labels are recognised', isRelativeLabel('Today') && !isRelativeLabel('Oct 7, 2026'));
check('addDaysIso crosses a month boundary', addDaysIso('2026-10-31', 1) === '2026-11-01');
check('addDaysIso goes backwards across a year', addDaysIso('2026-01-01', -1) === '2025-12-31');
check('daysInclusive counts both ends', daysInclusive('2026-10-01', '2026-10-31') === 31);
check('daysInclusive of one day is 1', daysInclusive('2026-10-07', '2026-10-07') === 1);

const shortcutOffset = (label) => DATE_SHORTCUTS.find((shortcut) => shortcut.label === label)?.offset;
check(
  'shortcut offsets point the right way',
  addDaysIso('2026-10-07', shortcutOffset('Yesterday')) === '2026-10-06' &&
    addDaysIso('2026-10-07', shortcutOffset('Tomorrow')) === '2026-10-08' &&
    addDaysIso('2026-10-07', shortcutOffset('Today')) === '2026-10-07',
  DATE_SHORTCUTS.map((s) => `${s.label}:${s.offset}`).join(' '),
);

const octoberGrid = monthGrid('2026-10');
check('month grid covers every day', octoberGrid.includes('2026-10-01') && octoberGrid.includes('2026-10-31'));
check('month grid is whole weeks', octoberGrid.length % 7 === 0, String(octoberGrid.length));
check(
  'month grid starts on the right weekday',
  octoberGrid.findIndex(Boolean) === new Date(2026, 9, 1).getDay(),
  String(octoberGrid.findIndex(Boolean)),
);
check(
  'month grid cells stay date-only strings',
  octoberGrid.filter(Boolean).every((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell)),
);

const octoberWeeks = monthWeeks('2026-10');
check(
  'calendar weeks are exactly seven cells',
  octoberWeeks.every((week) => week.length === 7),
  octoberWeeks.map((week) => week.length).join(','),
);
check(
  'calendar weeks cover the same cells as the grid',
  octoberWeeks.flat().join('|') === octoberGrid.join('|'),
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);