import { DatabaseSync } from 'node:sqlite';

import { migration } from '../storage/database/migrations/001_initial.js';
import { LATEST_VERSION, migrations } from '../storage/database/migrations/index.js';
import { createMemoryAdapter } from '../storage/adapters/memoryAdapter.js';
import { createSqliteAdapter } from '../storage/adapters/sqliteAdapter.js';
import {
  computeAccountBalance,
  computeBudgetBalance,
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
import { sanitizeAmount, formatCurrency, toMinor } from '../utils/currency.js';
import {
  PAYMENT_STATUSES,
  defaultPaymentStatus,
  effectivePaymentStatus,
} from '../utils/paymentStatus.js';
import {
  buildRemindAt,
  buildReminderNotification,
  isRemindAtPast,
  isValidLocalDate,
  isValidReminderTime,
  remindAtDate,
  reminderValidationError,
  suggestReminderValues,
} from '../utils/reminders.js';

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
// Apply everything except the newest migration, insert rows the way a v4
// install would hold them, then run migration 5 — so the payment-status
// backfill is tested against real pre-existing data, not just declared.
const paymentMigration = migrations.find((entry) => entry.version === LATEST_VERSION);
for (const entry of migrations) {
  if (entry === paymentMigration) continue;
  await entry.up(adapter);
}
await adapter.runAsync(
  `INSERT INTO budgets (id, name, start_date, end_date, created_at, updated_at)
   VALUES ('v4_budget', 'October 2026', '2026-10-01', '2026-10-31', '2026-10-05', '2026-10-05')`,
);
insertTransaction(db, {
  id: 'v4_expense',
  budget_id: 'v4_budget',
  type: 'expense',
  amount: 500,
  transaction_date: '2026-10-05',
});
insertTransaction(db, {
  id: 'v4_income',
  budget_id: 'v4_budget',
  type: 'income',
  amount: 900,
  transaction_date: '2026-10-05',
});
await paymentMigration.up(adapter);

// Same bookkeeping runMigrations() performs after applying a migration.
db.exec(`PRAGMA user_version = ${LATEST_VERSION}`);

const tables = (
  await adapter.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
).map((row) => row.name);

for (const expected of ['accounts', 'budgets', 'reminders', 'settings', 'tags', 'transactions']) {
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
check(
  'transactions gained a payment_status column',
  transactionColumns.includes('payment_status'),
  transactionColumns.join(','),
);

const v4Rows = await adapter.getAllAsync(
  `SELECT id, payment_status FROM transactions WHERE id IN ('v4_expense', 'v4_income') ORDER BY id`,
);
check(
  'expenses that predate payment status upgrade to paid',
  v4Rows.find((row) => row.id === 'v4_expense')?.payment_status === 'paid',
  JSON.stringify(v4Rows),
);
check(
  'the upgrade leaves income without a payment status',
  v4Rows.find((row) => row.id === 'v4_income')?.payment_status === null,
);
await adapter.runAsync(`DELETE FROM transactions WHERE id IN ('v4_expense', 'v4_income')`);
await adapter.runAsync(`DELETE FROM budgets WHERE id = 'v4_budget'`);

const reminderColumns = columnsOf('reminders');
check(
  'reminders hold the schedule and the notification id',
  ['transaction_id', 'enabled', 'remind_date', 'remind_time', 'remind_at', 'notification_id'].every(
    (column) => reminderColumns.includes(column),
  ),
  reminderColumns.join(','),
);
const reminderIndexes = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'reminders'`)
  .all()
  .map((row) => row.name);
check(
  'one reminder per transaction is indexed',
  reminderIndexes.includes('idx_reminders_transaction'),
  reminderIndexes.join(','),
);

check('LATEST_VERSION matches the migration list', LATEST_VERSION === 5, String(LATEST_VERSION));
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

const sqliteBudgets = await createSqliteAdapter(async () => adapter).listBudgets();
const octoberRow = sqliteBudgets.find((budget) => budget.id === 'b_oct');
check('folder row carries income for its period', octoberRow.income === 4_000_000, String(octoberRow?.income));
check('folder row keeps the spent figure unchanged', octoberRow.spent === 1_450_000, String(octoberRow?.spent));
check(
  'folder balance = income - spent',
  computeBudgetBalance(octoberRow.income, octoberRow.spent) === 2_550_000,
  String(computeBudgetBalance(octoberRow.income, octoberRow.spent)),
);

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

// A reminder belongs to exactly one transaction — enforced by the schema.
await adapter.runAsync(
  `INSERT INTO reminders
     (id, transaction_id, enabled, remind_date, remind_time, remind_at, notification_id, created_at, updated_at)
   VALUES ('rem_one', 't_cascade', 1, '2026-10-05', '09:00', '2026-10-05T09:00:00+08:00', NULL, ?, ?)`,
  '2026-10-06T00:00:00.000Z',
  '2026-10-06T00:00:00.000Z',
);
let secondReminderRejected = false;
try {
  await adapter.runAsync(
    `INSERT INTO reminders
       (id, transaction_id, enabled, remind_date, remind_time, remind_at, notification_id, created_at, updated_at)
     VALUES ('rem_two', 't_cascade', 1, '2026-10-05', '09:00', '2026-10-05T09:00:00+08:00', NULL, ?, ?)`,
    '2026-10-06T00:00:00.000Z',
    '2026-10-06T00:00:00.000Z',
  );
} catch {
  secondReminderRejected = true;
}
check('a second reminder for one transaction is rejected', secondReminderRejected);

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
const afterReminderCascade = await adapter.getFirstAsync('SELECT COUNT(*) AS total FROM reminders');
check('deleting a budget also removes its reminders', afterReminderCascade.total === 0, String(afterReminderCascade.total));

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
  snapshot.transactionsInRange = await store.listTransactionsInRange('2026-10-01', '2026-10-31');
  snapshot.transactionsOutRange = await store.listTransactionsInRange('2026-11-01', '2026-11-30');
  snapshot.duplicateName = await store.findTagByName('Parity Tag');

  snapshot.transactionUpdateChanges = await store.updateTransaction({
    id: 'p_expense',
    type: 'expense',
    amount: 175_000,
    tag_id: 'p_tag',
    description: 'Lunch and a drink',
    transaction_date: '2026-10-05',
    payment_status: 'unpaid',
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
  // The folder color round-trips identically on both engines, and clearing
  // it falls back to NULL (theme-driven folder colors).
  await store.updateBudget({
    id: 'p_budget',
    name: 'Parity',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    color: '#FF9800',
    updated_at: STAMP,
  });
  snapshot.coloredBudget = await store.getBudget('p_budget');

  await store.updateBudget({
    id: 'p_budget',
    name: 'Parity',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    color: null,
    updated_at: STAMP,
  });
  snapshot.decoloredBudget = await store.getBudget('p_budget');

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

  // A plain expense with an armed reminder: the launch resync reads these
  // rows, so they must be identical on both engines.
  await store.insertTransaction({
    id: 'p_reminder_tx',
    budget_id: 'p_budget',
    type: 'expense',
    amount: 50_000,
    tag_id: 'p_tag',
    account_id: null,
    to_account_id: null,
    description: 'Internet bill',
    transaction_date: '2026-10-06',
    payment_status: 'paid',
    created_at: STAMP,
    updated_at: STAMP,
  });

  await store.insertReminder({
    id: 'p_reminder',
    transaction_id: 'p_reminder_tx',
    enabled: 1,
    remind_date: '2026-10-19',
    remind_time: '09:00',
    remind_at: '2026-10-19T09:00:00+08:00',
    notification_id: 'os-123',
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.reminder = await store.getReminderByTransaction('p_reminder_tx');
  snapshot.reminders = await store.listReminders();
  snapshot.reminderTransaction = await store.getTransaction('p_reminder_tx');

  // Rescheduling replaces the OS id in place — still one row per transaction.
  await store.updateReminder({
    id: 'p_reminder',
    transaction_id: 'p_reminder_tx',
    enabled: 1,
    remind_date: '2026-10-19',
    remind_time: '10:00',
    remind_at: '2026-10-19T10:00:00+08:00',
    notification_id: 'os-456',
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.rescheduledReminder = await store.getReminderByTransaction('p_reminder_tx');

  // Disabling keeps the row (and its date/time) but drops the notification id.
  await store.updateReminder({
    id: 'p_reminder',
    transaction_id: 'p_reminder_tx',
    enabled: 0,
    remind_date: '2026-10-19',
    remind_time: '10:00',
    remind_at: '2026-10-19T10:00:00+08:00',
    notification_id: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.disabledReminder = await store.getReminderByTransaction('p_reminder_tx');
  snapshot.remindersWhileDisabled = await store.listReminders();

  let duplicateReminderRejected = false;
  try {
    await store.insertReminder({
      id: 'p_reminder_2',
      transaction_id: 'p_reminder_tx',
      enabled: 1,
      remind_date: '2026-10-21',
      remind_time: '09:00',
      remind_at: '2026-10-21T09:00:00+08:00',
      notification_id: null,
      created_at: STAMP,
      updated_at: STAMP,
    });
  } catch {
    duplicateReminderRejected = true;
  }
  snapshot.duplicateReminderRejected = duplicateReminderRejected;

  // Home text search: identical rows, order, and tag columns from both
  // engines, including case-insensitive partial matches and the rule that
  // LIKE wildcards in the term are treated as literal text.
  snapshot.searchByDescription = await store.searchTransactions('SALARY', 10);
  snapshot.searchByTagName = await store.searchTransactions('renamed ta', 10);
  snapshot.searchWildcardLiteral = await store.searchTransactions('100%', 10);
  snapshot.searchMiss = await store.searchTransactions('zzz-nothing', 10);

  await store.deleteTag('p_tag');
  snapshot.tagAfterDelete = await store.getTag('p_tag');
  snapshot.transactionKeepsAmount = await store.getTransaction('p_expense');
  snapshot.searchAfterTagDelete = await store.searchTransactions('renamed', 10);

  snapshot.deletedBudgets = await store.deleteBudget('p_budget');
  snapshot.budgetAfterDelete = await store.getBudget('p_budget');
  snapshot.transactionsAfterDelete = await store.listTransactionsByBudget('p_budget');
  snapshot.remindersAfterDelete = await store.listReminders();

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
check('both adapters report the same schema version', LATEST_VERSION === 5);
const parityBudget = sqliteResult.budgets.find((budget) => budget.id === 'p_budget');
check(
  'both adapters report period income on the folder row',
  parityBudget?.income === 400_000 && memoryResult.budgets.find((budget) => budget.id === 'p_budget')?.income === 400_000,
  String(parityBudget?.income),
);

const searchByDescription = sqliteResult.searchByDescription.map((row) => row.id);
const searchByTagName = sqliteResult.searchByTagName.map((row) => row.id);
check(
  'search matches descriptions case-insensitively and carries the folder name',
  searchByDescription.length === 1 &&
    searchByDescription[0] === 'p_income' &&
    memoryResult.searchByDescription.map((row) => row.id)[0] === 'p_income' &&
    sqliteResult.searchByDescription.every((row) => row.budget_name === 'Parity') &&
    memoryResult.searchByDescription.every((row) => row.budget_name === 'Parity'),
  JSON.stringify(searchByDescription),
);
check(
  'search matches tag names and carries the tag columns',
  searchByTagName.length === 3 &&
    memoryResult.searchByTagName.length === 3 &&
    sqliteResult.searchByTagName.every((row) => row.tag_name === 'Renamed Tag'),
  JSON.stringify(searchByTagName),
);
check(
  'payment status round-trips through update on both engines',
  sqliteResult.updatedTransaction.payment_status === 'unpaid' &&
    memoryResult.updatedTransaction.payment_status === 'unpaid',
  String(sqliteResult.updatedTransaction.payment_status),
);
check(
  'search treats LIKE wildcards as literal text',
  sqliteResult.searchWildcardLiteral.length === 0 &&
    memoryResult.searchWildcardLiteral.length === 0,
);
check(
  'search after tag deletion no longer matches the removed tag',
  sqliteResult.searchAfterTagDelete.length === 0 &&
    memoryResult.searchAfterTagDelete.length === 0,
);

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
check('legacy database has four pending migrations', pending.length === 4, String(pending.length));
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
for (const expected of ['accounts', 'budgets', 'reminders', 'settings', 'tags', 'transactions']) {
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

console.log('\n--- payment status rules ---');
check('only two statuses exist', JSON.stringify(PAYMENT_STATUSES) === '["unpaid","paid"]');
check(
  'a new expense defaults to unpaid',
  defaultPaymentStatus(undefined) === 'unpaid' && defaultPaymentStatus(null) === 'unpaid',
);
check(
  'a requested status survives validation when valid',
  defaultPaymentStatus('paid') === 'paid' && defaultPaymentStatus('unpaid') === 'unpaid',
);
check(
  'a missing or invalid status on an expense reads as paid, preserving history',
  effectivePaymentStatus({ type: 'expense', payment_status: null }) === 'paid' &&
    effectivePaymentStatus({ type: 'expense', payment_status: 'banana' }) === 'paid',
);
check(
  'valid expense statuses read back unchanged',
  effectivePaymentStatus({ type: 'expense', payment_status: 'unpaid' }) === 'unpaid' &&
    effectivePaymentStatus({ type: 'expense', payment_status: 'paid' }) === 'paid',
);
check(
  'income and transfers have no payment status',
  effectivePaymentStatus({ type: 'income', payment_status: 'paid' }) === null &&
    effectivePaymentStatus({ type: 'transfer', payment_status: 'unpaid' }) === null,
);
// The status is descriptive only: both kinds of expense count the same way.
const mixedStatuses = [
  { id: 'm1', type: 'expense', amount: 1_000, payment_status: 'unpaid' },
  { id: 'm2', type: 'expense', amount: 2_000, payment_status: 'paid' },
  { id: 'm3', type: 'income', amount: 5_000, payment_status: null },
];
const statusTotals = computeTotals(mixedStatuses);
check(
  'paid and unpaid expenses contribute identically to totals',
  statusTotals.expense === 3_000 && statusTotals.income === 5_000 && statusTotals.remaining === 2_000,
  JSON.stringify(statusTotals),
);

console.log('\n--- amount entry ---');
check('strips letters from an amount', sanitizeAmount('12a3b') === '123', sanitizeAmount('12a3b'));
check('keeps a single decimal point', sanitizeAmount('1.2.3') === '1.2', sanitizeAmount('1.2.3'));
check('caps fractions at the currency precision', sanitizeAmount('1.259', 2) === '1.25', sanitizeAmount('1.259', 2));
check('allows a trailing separator while typing', sanitizeAmount('12.') === '12.', sanitizeAmount('12.'));
check('cleans a pasted amount', sanitizeAmount('₱1,250.75') === '1250.75', sanitizeAmount('₱1,250.75'));
check('whole amounts for zero-decimal currencies', sanitizeAmount('12.5', 0) === '12', sanitizeAmount('12.5', 0));
check('non-numeric text becomes empty', sanitizeAmount('abc') === '' && sanitizeAmount('') === '');
check(
  'a sanitised amount converts to minor units',
  toMinor(sanitizeAmount('₱1,450.50')) === 145_050,
  String(toMinor(sanitizeAmount('₱1,450.50'))),
);

console.log('\n--- folder balance ---');
const folderStore = createMemoryAdapter();

async function insertFolder(id, income, spent) {
  await folderStore.insertBudget({
    id,
    name: id,
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await folderStore.insertTransaction({
    id: `${id}_in`,
    budget_id: id,
    type: 'income',
    amount: income,
    tag_id: null,
    account_id: null,
    to_account_id: null,
    description: 'Salary',
    transaction_date: '2026-10-02',
    created_at: STAMP,
    updated_at: STAMP,
  });
  if (spent > 0) {
    await folderStore.insertTransaction({
      id: `${id}_out`,
      budget_id: id,
      type: 'expense',
      amount: spent,
      tag_id: null,
      account_id: null,
      to_account_id: null,
      description: 'Spending',
      transaction_date: '2026-10-05',
      created_at: STAMP,
      updated_at: STAMP,
    });
  }
}

await insertFolder('b_positive', 5_000_000, 3_250_000);
await insertFolder('b_even', 5_000_000, 5_000_000);
await insertFolder('b_negative', 5_000_000, 5_500_000);

const folderRows = await folderStore.listBudgets();
const folderRow = (id) => folderRows.find((budget) => budget.id === id);
const folderBalance = (row) => computeBudgetBalance(row.income, row.spent);

check(
  'Income ₱50,000 / Spent ₱32,500 → Balance ₱17,500',
  folderRow('b_positive').income === 5_000_000 &&
    folderRow('b_positive').spent === 3_250_000 &&
    formatCurrency(folderBalance(folderRow('b_positive'))) === '₱17,500.00',
  formatCurrency(folderBalance(folderRow('b_positive'))),
);
check(
  'Income ₱50,000 / Spent ₱50,000 → Balance ₱0.00',
  folderBalance(folderRow('b_even')) === 0 && formatCurrency(folderBalance(folderRow('b_even'))) === '₱0.00',
  formatCurrency(folderBalance(folderRow('b_even'))),
);
check(
  'Income ₱50,000 / Spent ₱55,000 → Balance -₱5,000',
  folderRow('b_negative').income === 5_000_000 &&
    folderRow('b_negative').spent === 5_500_000 &&
    formatCurrency(folderBalance(folderRow('b_negative'))) === '-₱5,000.00',
  formatCurrency(folderBalance(folderRow('b_negative'))),
);
check(
  'the folder row still reports spent unchanged',
  folderRow('b_positive').spent === 3_250_000,
  String(folderRow('b_positive').spent),
);

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

console.log('\n--- reminder rules ---');
check(
  'a real local date is accepted',
  isValidLocalDate('2026-10-15') && !isValidLocalDate('2026-10-32') && !isValidLocalDate('Oct 15'),
);
check(
  'a real 24-hour time is accepted',
  isValidReminderTime('09:00') && isValidReminderTime('23:59') && !isValidReminderTime('9:00') && !isValidReminderTime('24:00'),
);

const remindAt = buildRemindAt('2026-10-15', '09:00');
check(
  'remind_at keeps the local wall-clock time with an offset',
  remindAt.startsWith('2026-10-15T09:00:00') && !remindAt.endsWith('Z'),
  remindAt,
);
check(
  'the stored instant reads back as its own local date',
  toIsoDate(remindAtDate(remindAt)) === '2026-10-15',
  toIsoDate(remindAtDate(remindAt)),
);
check(
  'an instant already behind us is past',
  isRemindAtPast(buildRemindAt('2026-10-06', '09:00'), new Date(2026, 9, 7)) === true,
);
check(
  'an instant still ahead is not past',
  isRemindAtPast(buildRemindAt('2026-10-08', '09:00'), new Date(2026, 9, 7)) === false,
);

check(
  'a future date and time passes validation',
  reminderValidationError('2026-10-15', '09:00', new Date(2026, 9, 7)) === null,
);
check(
  'a missing date is rejected',
  reminderValidationError('', '09:00', new Date(2026, 9, 7)) === 'Pick a reminder date.',
);
check(
  'a missing time is rejected',
  reminderValidationError('2026-10-15', '', new Date(2026, 9, 7)) === 'Pick a reminder time.',
);
check(
  'an instant in the past is rejected',
  reminderValidationError('2026-10-06', '09:00', new Date(2026, 9, 7)) === 'Pick a time in the future.',
);

const freshSuggestion = suggestReminderValues({ reference: new Date(2026, 9, 7) });
check(
  'a fresh reminder defaults to today at 9:00 AM',
  freshSuggestion.date === '2026-10-07' && freshSuggestion.time === '09:00',
  JSON.stringify(freshSuggestion),
);
const lateSuggestion = suggestReminderValues({ reference: new Date(2026, 9, 7, 10, 0) });
check(
  'once 9:00 AM has passed the suggestion steps a day forward',
  reminderValidationError(lateSuggestion.date, lateSuggestion.time, new Date(2026, 9, 7, 10, 0)) === null &&
    lateSuggestion.date === '2026-10-08',
  JSON.stringify(lateSuggestion),
);

const billCopy = buildReminderNotification({
  transaction: { description: 'Internet bill', amount: 200_000 },
  currency: 'PHP',
});
check(
  'the notification names the transaction and the money',
  billCopy.body.includes('Internet bill') && billCopy.body.includes('₱2,000.00'),
  billCopy.body,
);
check('the notification is titled as a MoneyQ reminder', billCopy.title.includes('MoneyQ Reminder'), billCopy.title);
check('the notification is generic', !/owe|owed|repay|paid/i.test(billCopy.body), billCopy.body);

const unnamedCopy = buildReminderNotification({
  transaction: { description: '', amount: 150_000 },
  currency: 'PHP',
});
check(
  'a descriptionless transaction still yields readable copy',
  unnamedCopy.body.includes('MoneyQ entry') && unnamedCopy.body.includes('₱1,500.00'),
  unnamedCopy.body,
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);