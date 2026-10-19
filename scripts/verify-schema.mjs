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
  breakdownValidationError,
  computeBreakdownTotal,
  isHhMm,
  isIsoCalendarDate,
  normalizeBreakdownItems,
  prepareBreakdownRows,
} from '../utils/breakdown.js';
import { derivePaymentEventStatus } from '../utils/paymentStatus.js';
import { toPurchaseRows } from '../utils/reports.js';
import {
  buildRemindAt,
  buildReminderNotification,
  deriveReminderStatus,
  isRemindAtPast,
  isValidLocalDate,
  isValidReminderTime,
  remindAtDate,
  reminderValidationError,
  suggestReminderValues,
} from '../utils/reminders.js';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  buildBackupFileName,
  buildMergePlan,
  compileMergeWrites,
  parseBackupText,
  projectMergeResult,
  resolveGroup,
  serializeSnapshot,
  stringifyBackup,
  validateBackup,
} from '../utils/backup.js';

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
// Apply everything except the newest migrations, insert rows the way older
// installs would hold them, then run the pending ones — so the payment-status
// backfill, the notes default and the standalone-reminder rebuild are all
// tested against real pre-existing data, not just declared.
const paymentMigration = migrations.find((entry) => entry.version === 5);
const notesMigration = migrations.find((entry) => entry.version === 6);
const standaloneMigration = migrations.find((entry) => entry.version === 7);
const subTransactionsMigration = migrations.find((entry) => entry.version === 8);
const datesMigration = migrations.find((entry) => entry.version === 9);
const foldersMigration = migrations.find((entry) => entry.version === 10);
const perfIndexesMigration = migrations.find((entry) => entry.version === 11);
const budgetPositionMigration = migrations.find((entry) => entry.version === 12);
const receiptPathMigration = migrations.find((entry) => entry.version === 13);
const attachmentsMigration = migrations.find((entry) => entry.version === 14);
for (const entry of migrations) {
  if (
    entry === paymentMigration ||
    entry === notesMigration ||
    entry === standaloneMigration ||
    entry === subTransactionsMigration ||
    entry === datesMigration ||
    entry === foldersMigration ||
    entry === perfIndexesMigration ||
    entry === budgetPositionMigration ||
    entry === receiptPathMigration ||
    entry === attachmentsMigration
  ) {
    continue;
  }
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
db.prepare(`INSERT INTO reminders
   (id, transaction_id, enabled, remind_date, remind_time, remind_at, created_at, updated_at)
   VALUES ('v4_reminder', 'v4_expense', 1, '2026-10-20', '09:00', '2026-10-20T09:00:00+08:00', '2026-10-05', '2026-10-05')`).run();
await paymentMigration.up(adapter);
await notesMigration.up(adapter);
const preStandalone = await adapter.getFirstAsync(
  `SELECT transaction_id, notes FROM reminders WHERE id = 'v4_reminder'`,
);
check(
  'the pre-upgrade reminder still holds its link and notes',
  preStandalone?.transaction_id === 'v4_expense' && preStandalone?.notes === '',
  JSON.stringify(preStandalone),
);
await standaloneMigration.up(adapter);
await subTransactionsMigration.up(adapter);
await datesMigration.up(adapter);
// Folders last: the ALTER must add folder_id onto real pre-existing budget
// rows the way an older install would receive it.
await foldersMigration.up(adapter);
// Indexes truly last: the rebuild migrations above drop them if applied first,
// and runMigrations() would only ever apply version 11 after version 10.
await perfIndexesMigration.up(adapter);
// Budget manual order last: its backfill ranks rows by folder_id, which only
// exists after migration 10, and must run over real pre-existing budgets.
await budgetPositionMigration.up(adapter);
// Receipt attachments: migration 8 rebuilds the transactions table, so an
// ALTER applied before it would be dropped again. Version 13 then 14 run
// together at the very end, exactly as runMigrations() would apply them on
// a device upgrading through both at once.
await receiptPathMigration.up(adapter);
// Before the attachments rebuild: a receipt reference in the legacy column
// and a breakdown row, so the fold-in and the table swap are exercised on
// real pre-existing data, not just declared.
await adapter.runAsync(
  `UPDATE transactions SET receipt_path = 'receipts/test-legacy.jpg' WHERE id = 'v4_expense'`,
);
await adapter.runAsync(
  `INSERT INTO sub_transactions
     (id, transaction_id, description, amount, position, created_at, updated_at)
   VALUES ('v4_legacy_item', 'v4_expense', 'Legacy item', 500, 0, '2026-10-05', '2026-10-05')`,
);
await attachmentsMigration.up(adapter);
check(
  'migration 014 folds legacy receipt references into attachment rows',
  (await adapter.getFirstAsync(
    `SELECT path FROM attachments WHERE transaction_id = 'v4_expense'`,
  ))?.path === 'receipts/test-legacy.jpg',
);
check(
  'the attachments rebuild carries breakdown items through the table swap',
  Boolean(
    await adapter.getFirstAsync(`SELECT id FROM sub_transactions WHERE id = 'v4_legacy_item'`),
  ),
);
// The later sections assume the fixtures never existed, so both go back out.
await adapter.runAsync(`DELETE FROM sub_transactions WHERE id = 'v4_legacy_item'`);
await adapter.runAsync(`DELETE FROM attachments WHERE transaction_id = 'v4_expense'`);

// Same bookkeeping runMigrations() performs after applying a migration.
db.exec(`PRAGMA user_version = ${LATEST_VERSION}`);

const tables = (
  await adapter.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
).map((row) => row.name);

for (const expected of [
  'accounts',
  'attachments',
  'budgets',
  'folders',
  'reminders',
  'settings',
  'sub_transactions',
  'tags',
  'transactions',
]) {
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
check(
  'budgets gained an optional folder reference',
  budgetColumns.includes('folder_id'),
  budgetColumns.join(','),
);
check(
  'budgets gained a manual position column',
  budgetColumns.includes('position'),
  budgetColumns.join(','),
);
check(
  'budgets gained a nullable archive column',
  budgetColumns.includes('deleted_at'),
  budgetColumns.join(','),
);
const folderColumns = columnsOf('folders');
check(
  'folders carry name, color, position and timestamps',
  ['name', 'color', 'position', 'created_at', 'updated_at'].every((column) => folderColumns.includes(column)),
  folderColumns.join(','),
);
check(
  'the v4 budget row survived the folder ALTER with a null reference',
  (await adapter.getFirstAsync(`SELECT folder_id FROM budgets WHERE id = 'v4_budget'`))?.folder_id === null,
);
check(
  'migration 012 materialised a rank on the pre-existing budget row',
  (await adapter.getFirstAsync(`SELECT position FROM budgets WHERE id = 'v4_budget'`))?.position === 0,
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
check(
  'transactions gained a has_breakdown flag',
  transactionColumns.includes('has_breakdown'),
  transactionColumns.join(','),
);
check(
  'transactions lost the legacy receipt_path column',
  !transactionColumns.includes('receipt_path'),
  transactionColumns.join(','),
);
const attachmentColumns = columnsOf('attachments');
check(
  'attachments carry parent, path and timestamps',
  ['id', 'transaction_id', 'path', 'created_at', 'updated_at'].every((name) =>
    attachmentColumns.includes(name),
  ),
  attachmentColumns.join(','),
);
const attachmentIndexes = db.prepare(`PRAGMA index_list(attachments)`).all();
check(
  'attachment reads by parent are indexed',
  attachmentIndexes.some((index) => index.name === 'idx_attachments_transaction'),
  attachmentIndexes.map((index) => index.name).join(','),
);
const v4AfterBreakdown = await adapter.getFirstAsync(
  `SELECT id, amount, has_breakdown FROM transactions WHERE id = 'v4_expense'`,
);
check(
  'the breakdown rebuild keeps pre-existing transactions with an inactive breakdown',
  v4AfterBreakdown?.amount === 500 && v4AfterBreakdown?.has_breakdown === 0,
  JSON.stringify(v4AfterBreakdown),
);
const v4LinkAfterRebuild = await adapter.getFirstAsync(
  `SELECT transaction_id FROM reminders WHERE id = 'v4_reminder'`,
);
check(
  'the transactions rebuild keeps reminder links through the FK SET NULL',
  v4LinkAfterRebuild?.transaction_id === 'v4_expense',
  JSON.stringify(v4LinkAfterRebuild),
);
const subColumns = columnsOf('sub_transactions');
check(
  'breakdown items carry parent, description, signed amount, and position',
  ['transaction_id', 'description', 'amount', 'position'].every((column) =>
    subColumns.includes(column),
  ),
  subColumns.join(','),
);
const subDateColumns = columnsOf('sub_transactions');
check(
  'breakdown items gained purchase date, time, and notes',
  ['purchase_date', 'purchase_time', 'notes'].every((column) => subDateColumns.includes(column)),
  subDateColumns.join(','),
);
check(
  'transactions gained an optional payment due date',
  transactionColumns.includes('payment_due_date') ||
    db
      .prepare(`PRAGMA table_info(transactions)`)
      .all()
      .some((column) => column.name === 'payment_due_date'),
);

const subIndexes = db.prepare(`PRAGMA index_list(sub_transactions)`).all();
check(
  'breakdown reads by parent and description search are indexed',
  subIndexes.some((index) => index.name === 'idx_sub_transactions_parent') &&
    subIndexes.some((index) => index.name === 'idx_sub_transactions_description'),
  subIndexes.map((index) => index.name).join(','),
);
const budgetFolderIndexes = db.prepare(`PRAGMA index_list(budgets)`).all();
check(
  'budgets by folder are indexed',
  budgetFolderIndexes.some((index) => index.name === 'idx_budgets_folder'),
  budgetFolderIndexes.map((index) => index.name).join(','),
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
const v4ReminderAfter = await adapter.getFirstAsync(
  `SELECT transaction_id, status, notes FROM reminders WHERE id = 'v4_reminder'`,
);
check(
  'existing reminders gain empty notes on upgrade, never losing the row',
  v4ReminderAfter?.notes === '',
  JSON.stringify(v4ReminderAfter),
);
check(
  'the rebuild keeps the link and marks old reminders active',
  v4ReminderAfter?.transaction_id === 'v4_expense' && v4ReminderAfter?.status === 'active',
  JSON.stringify(v4ReminderAfter),
);
await adapter.runAsync(`DELETE FROM reminders WHERE id = 'v4_reminder'`);
await adapter.runAsync(`DELETE FROM transactions WHERE id IN ('v4_expense', 'v4_income')`);
await adapter.runAsync(`DELETE FROM budgets WHERE id = 'v4_budget'`);

const reminderColumns = columnsOf('reminders');
check(
  'reminders hold the schedule, lifecycle status and the notification id',
  ['transaction_id', 'enabled', 'status', 'remind_date', 'remind_time', 'remind_at', 'notification_id'].every(
    (column) => reminderColumns.includes(column),
  ),
  reminderColumns.join(','),
);
const transactionIdInfo = db
  .prepare(`PRAGMA table_info(reminders)`)
  .all()
  .find((column) => column.name === 'transaction_id');
check(
  'transaction_id is nullable so a reminder can stand alone',
  transactionIdInfo?.notnull === 0,
  JSON.stringify(transactionIdInfo),
);
const reminderIndexes = db.prepare(`PRAGMA index_list(reminders)`).all();
check(
  'reminder lookups by transaction are indexed',
  reminderIndexes.some((index) => index.name === 'idx_reminders_transaction'),
  reminderIndexes.map((index) => index.name).join(','),
);
check(
  'the per-transaction index no longer enforces one reminder per transaction',
  reminderIndexes.find((index) => index.name === 'idx_reminders_transaction')?.unique === 0,
);
check(
  'reminder dates are indexed for the calendar',
  reminderIndexes.some((index) => index.name === 'idx_reminders_date'),
);
check(
  'reminder sorts by remind_at are indexed',
  reminderIndexes.some((index) => index.name === 'idx_reminders_remind_at'),
  reminderIndexes.map((index) => index.name).join(','),
);

const rangeTransactionIndexes = db.prepare(`PRAGMA index_list(transactions)`).all();
check(
  'date-range transaction reads are indexed',
  rangeTransactionIndexes.some((index) => index.name === 'idx_transactions_date'),
  rangeTransactionIndexes.map((index) => index.name).join(','),
);

check(
  'reminders gained a notes column',
  reminderColumns.includes('notes'),
  reminderColumns.join(','),
);
check(
  'LATEST_VERSION matches the migration list',
  LATEST_VERSION === Math.max(...migrations.map((entry) => entry.version)),
  String(LATEST_VERSION),
);
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

// The breakdown CHECK relaxation: a calculated parent total of zero must be
// storable. The repository still refuses zero (and negative) amounts for
// transactions without a breakdown.
let zeroStored = true;
try {
  insertTransaction(db, {
    id: 'x_zero_breakdown',
    budget_id: 'b_oct',
    type: 'expense',
    amount: 0,
    tag_id: 'default_work',
    account_id: 'acc_bdo',
    transaction_date: '2026-10-05',
  });
} catch {
  zeroStored = false;
}
check('accepts a zero parent amount for an empty breakdown', zeroStored);

console.log('\n--- breakdown integrity ---');
insertTransaction(db, {
  id: 't_break',
  budget_id: 'b_oct',
  type: 'expense',
  amount: 900_000, // ₱9,000.00 calculated total
  tag_id: 'default_daily-expenses',
  account_id: 'acc_bdo',
  description: 'Weekly groceries',
  transaction_date: '2026-10-05',
});
await adapter.runAsync(
  `INSERT INTO sub_transactions (id, transaction_id, description, amount, position, created_at, updated_at)
   VALUES ('s_rice', 't_break', 'Rice 5kg', 1_000_000, 0, '2026-10-06', '2026-10-06')`,
);
await adapter.runAsync(
  `INSERT INTO sub_transactions (id, transaction_id, description, amount, position, created_at, updated_at)
   VALUES ('s_discount', 't_break', 'Loyalty discount', -100_000, 1, '2026-10-06', '2026-10-06')`,
);

let orphanRejected = false;
try {
  await adapter.runAsync(
    `INSERT INTO sub_transactions (id, transaction_id, description, amount, position, created_at, updated_at)
     VALUES ('s_orphan', 'tx_missing', 'Ghost', 100, 0, '2026-10-06', '2026-10-06')`,
  );
} catch {
  orphanRejected = true;
}
check('rejects a breakdown item with an unknown parent', orphanRejected);

let duplicateIdRejected = false;
try {
  await adapter.runAsync(
    `INSERT INTO sub_transactions (id, transaction_id, description, amount, position, created_at, updated_at)
     VALUES ('s_rice', 't_break', 'Dup', 100, 2, '2026-10-06', '2026-10-06')`,
  );
} catch {
  duplicateIdRejected = true;
}
check('rejects a duplicate breakdown item id', duplicateIdRejected);

const orderedItems = await adapter.getAllAsync(
  `SELECT description, amount FROM sub_transactions WHERE transaction_id = 't_break' ORDER BY position ASC`,
);
check(
  'items read back in persisted order with their signed amounts',
  orderedItems.length === 2 &&
    orderedItems[0].description === 'Rice 5kg' &&
    orderedItems[1].amount === -100_000,
  JSON.stringify(orderedItems),
);

const childRowsInTransactions = await adapter.getFirstAsync(
  `SELECT COUNT(*) AS total FROM transactions WHERE id IN ('s_rice', 's_discount')`,
);
check(
  'breakdown items never appear as financial transactions',
  childRowsInTransactions.total === 0,
  String(childRowsInTransactions.total),
);

await adapter.runAsync(`DELETE FROM transactions WHERE id = 't_break'`);
const orphansAfterCascade = await adapter.getFirstAsync(
  `SELECT COUNT(*) AS total FROM sub_transactions WHERE transaction_id = 't_break'`,
);
check(
  'deleting a parent cascades its breakdown items',
  orphansAfterCascade.total === 0,
  String(orphansAfterCascade.total),
);
await adapter.runAsync(`DELETE FROM sub_transactions`);
await adapter.runAsync(`DELETE FROM transactions WHERE id = 'x_zero_breakdown'`);

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
// Re-seed the default tag we just hard-deleted, so the parity scenario below
// starts sqlite with the same six defaults a fresh memory adapter seeds.
await adapter.runAsync(
  `INSERT OR IGNORE INTO tags
     (id, name, emoji, color, is_default, archived, created_at, updated_at)
   VALUES ('default_work', 'Work', '💼', '#6B3FA0', 1, 0, '2026-10-06', '2026-10-06')`,
);

// A reminder optionally belongs to a transaction; several may share one.
await adapter.runAsync(
  `INSERT INTO reminders
     (id, transaction_id, enabled, remind_date, remind_time, remind_at, notification_id, created_at, updated_at)
   VALUES ('rem_one', 't_cascade', 1, '2026-10-05', '09:00', '2026-10-05T09:00:00+08:00', NULL, ?, ?)`,
  '2026-10-06T00:00:00.000Z',
  '2026-10-06T00:00:00.000Z',
);
await adapter.runAsync(
  `INSERT INTO reminders
     (id, transaction_id, enabled, remind_date, remind_time, remind_at, notification_id, created_at, updated_at)
   VALUES ('rem_two', 't_cascade', 1, '2026-10-06', '09:00', '2026-10-06T09:00:00+08:00', NULL, ?, ?)`,
  '2026-10-06T00:00:00.000Z',
  '2026-10-06T00:00:00.000Z',
);
const linkedReminders = await adapter.getAllAsync(
  `SELECT id FROM reminders WHERE transaction_id = 't_cascade' ORDER BY id`,
);
check(
  'a transaction can own several reminders',
  linkedReminders.length === 2,
  JSON.stringify(linkedReminders),
);

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
// The cascade removed every transaction referencing the demo accounts, so the
// leftovers can now go too — the parity scenario below must start both engines
// with an identical (empty) accounts table.
await adapter.runAsync(`DELETE FROM accounts`);
const unlinkedReminders = await adapter.getAllAsync(
  `SELECT id, transaction_id FROM reminders ORDER BY id`,
);
check(
  'deleting a budget unlinks its reminders instead of deleting them',
  unlinkedReminders.length === 2 &&
    unlinkedReminders.every((row) => row.transaction_id === null),
  JSON.stringify(unlinkedReminders),
);
// Clear them so the parity snapshots below start from an empty table, the
// same as a fresh memory adapter.
await adapter.runAsync(`DELETE FROM reminders`);

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

  // Manual budget order: insertBudget defaults the rank, listBudgets sorts
  // position ahead of the date default, and updateBudgetPositions rewrites
  // ranks (with updated_at) identically on both engines.
  await store.insertBudget({
    id: 'p_budget_two',
    name: 'Parity Two',
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertBudget({
    id: 'p_budget_three',
    name: 'Parity Three',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.budgetsDefaultOrder = (await store.listBudgets()).map((budget) => budget.id);
  await store.updateBudgetPositions(
    [
      { id: 'p_budget', position: 2 },
      { id: 'p_budget_two', position: 0 },
      { id: 'p_budget_three', position: 1 },
    ],
    '2026-10-06T01:00:00.000Z',
  );
  snapshot.budgetsAfterReorder = (await store.listBudgets()).map((budget) => budget.id);
  snapshot.budgetRanksAfterReorder = (await store.listBudgets()).map(
    (budget) => `${budget.id}:${budget.position}:${budget.updated_at}`,
  );
  // An unrelated edit (no position in the row) must not disturb the rank.
  await store.updateBudget({
    id: 'p_budget_two',
    name: 'Parity Two Renamed',
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    color: null,
    updated_at: STAMP,
  });
  snapshot.budgetsAfterEdit = (await store.listBudgets()).map((budget) => `${budget.id}:${budget.position}`);
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

  // Budget folders: create, look up by name, rename, reorder, assign a
  // budget to one, then delete the folder. The budget must survive with a
  // cleared reference, identically on both engines.
  await store.insertFolder({
    id: 'p_folder',
    name: 'Parity Folder',
    color: '#FF9800',
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertFolder({
    id: 'p_folder_b',
    name: 'Second',
    color: null,
    position: 1,
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.folders = await store.listFolders();
  snapshot.duplicateFolderName = await store.findFolderByName('Second');
  snapshot.duplicateFolderNameIgnoringSelf = await store.findFolderByName('Second', 'p_folder_b');
  snapshot.missingFolderName = await store.findFolderByName('Nope');
  await store.updateFolder({
    id: 'p_folder',
    name: 'Renamed Folder',
    color: null,
    position: 1,
    updated_at: STAMP,
  });
  await store.updateFolder({
    id: 'p_folder_b',
    name: 'Second',
    color: '#00FF00',
    position: 0,
    updated_at: STAMP,
  });
  snapshot.foldersAfterSwap = await store.listFolders();
  snapshot.missingFolder = await store.getFolder('nope');
  await store.updateBudget({
    id: 'p_budget',
    name: 'Parity',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    color: null,
    folder_id: 'p_folder_b',
    updated_at: STAMP,
  });
  snapshot.budgetInFolder = await store.getBudget('p_budget');
  snapshot.folderDeleteChanges = await store.deleteFolder('p_folder');
  snapshot.missingFolderDelete = await store.deleteFolder('nope');
  await store.deleteFolder('p_folder_b');
  snapshot.budgetAfterFolderDelete = await store.getBudget('p_budget');
  snapshot.foldersAfterDelete = await store.listFolders();

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
    status: 'active',
    remind_date: '2026-10-19',
    remind_time: '09:00',
    remind_at: '2026-10-19T09:00:00+08:00',
    notification_id: 'os-123',
    notes: 'Pay the landlord on the day.',
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.reminder = await store.getReminderByTransaction('p_reminder_tx');
  snapshot.reminderById = await store.getReminder('p_reminder');
  snapshot.reminders = await store.listReminders();
  snapshot.reminderTransaction = await store.getTransaction('p_reminder_tx');

  // Rescheduling replaces the OS id in place.
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

  // Clearing notes writes the empty string on both engines; an omitted
  // `notes` key never blanks the row (SQLite COALESCE / memory merge).
  await store.updateReminder({
    id: 'p_reminder',
    transaction_id: 'p_reminder_tx',
    enabled: 0,
    remind_date: '2026-10-19',
    remind_time: '10:00',
    remind_at: '2026-10-19T10:00:00+08:00',
    notification_id: null,
    notes: '',
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.notesClearedReminder = await store.getReminderByTransaction('p_reminder_tx');

  // One transaction may own several reminders now: the second insert is
  // accepted and the oldest row stays the one the transaction form manages.
  await store.insertReminder({
    id: 'p_reminder_2',
    transaction_id: 'p_reminder_tx',
    enabled: 1,
    status: 'active',
    remind_date: '2026-10-21',
    remind_time: '09:00',
    remind_at: '2026-10-21T09:00:00+08:00',
    notification_id: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.secondReminder = await store.getReminder('p_reminder_2');
  snapshot.oldestReminderUnchanged = await store.getReminderByTransaction('p_reminder_tx');

  // A standalone reminder: no transaction, still a first-class row.
  await store.insertReminder({
    id: 'p_standalone',
    transaction_id: null,
    enabled: 1,
    status: 'active',
    remind_date: '2026-10-25',
    remind_time: '08:00',
    remind_at: '2026-10-25T08:00:00+08:00',
    notification_id: null,
    notes: 'Submit the travel report.',
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.standaloneReminder = await store.getReminder('p_standalone');
  snapshot.standaloneByTransaction = await store.getReminderByTransaction(null);
  snapshot.remindersWithStandalone = await store.listReminders();

  // Completing only flips the lifecycle status; an omitted status key in a
  // later bookkeeping update keeps it.
  await store.updateReminder({
    ...snapshot.notesClearedReminder,
    status: 'completed',
    updated_at: STAMP,
  });
  snapshot.completedReminder = await store.getReminder('p_reminder');

  // Deleting a reminder removes only that row.
  await store.insertReminder({
    id: 'p_temp',
    transaction_id: null,
    enabled: 1,
    status: 'active',
    remind_date: '2026-10-26',
    remind_time: '08:00',
    remind_at: '2026-10-26T08:00:00+08:00',
    notification_id: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.tempDeletedCount = await store.deleteReminder('p_temp');
  snapshot.tempAfterDelete = await store.getReminder('p_temp');

  // A budget's reminders go with it, but only through the explicit call the
  // budgets store makes — the foreign key alone would just unlink them.
  snapshot.budgetRemindersRemoved = await store.deleteRemindersForBudget('p_budget');
  snapshot.remindersAfterBudgetCleanup = await store.listReminders();

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

  // Breakdown items: identical ordered reads, child-description search that
  // returns the parent with its item count, reordering with an unchanged
  // total, a zero-total parent, rollback of a failed group, and the cascade
  // that follows the parent — on both engines.
  snapshot.subsBefore = await store.listSubTransactionsByParent('p_expense');
  await store.insertSubTransaction({
    id: 'p_sub_rice',
    transaction_id: 'p_expense',
    description: 'Rice 5kg',
    amount: 100_000,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
    purchase_date: '2026-10-08',
    purchase_time: '09:15',
    notes: 'Wet market, cash.',
  });
  await store.insertSubTransaction({
    id: 'p_sub_discount',
    transaction_id: 'p_expense',
    description: 'Loyalty discount',
    amount: -5_000,
    position: 1,
    created_at: STAMP,
    updated_at: STAMP,
    purchase_date: '2026-10-09',
    purchase_time: null,
    notes: null,
  });
  snapshot.subsByParent = await store.listSubTransactionsByParent('p_expense');
  snapshot.subsByBudget = await store.listSubTransactionsByBudget('p_budget');
  snapshot.searchByChild = await store.searchTransactions('rice', 10);
  snapshot.subsRemoved = await store.deleteSubTransactionsForParent('p_expense');
  // Persisted reorder: the same items come back with swapped positions.
  await store.insertSubTransaction({
    id: 'p_sub_discount',
    transaction_id: 'p_expense',
    description: 'Loyalty discount',
    amount: -5_000,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
    purchase_date: '2026-10-09',
    purchase_time: null,
    notes: null,
  });
  await store.insertSubTransaction({
    id: 'p_sub_rice',
    transaction_id: 'p_expense',
    description: 'Rice 5kg',
    amount: 100_000,
    position: 1,
    created_at: STAMP,
    updated_at: STAMP,
    purchase_date: '2026-10-08',
    purchase_time: '09:15',
    notes: 'Wet market, cash.',
  });
  snapshot.subsReordered = await store.listSubTransactionsByParent('p_expense');
  // Batch read for many parents: duplicate ids dedupe, a parent without items
  // and an unknown id simply contribute nothing.
  snapshot.subsByParents = await store.listSubTransactionsForParents([
    'p_expense',
    'p_expense',
    'p_income',
    'no_such_parent',
  ]);

  // Purchase dates and payment due dates round-trip identically: dated items
  // come back joined with parent context in date→time→position order, undated
  // items stay out of the events, and a due date selects its parent alone.
  snapshot.purchaseEvents = await store.listSubTransactionsInRange('2026-10-08', '2026-10-08');
  snapshot.purchaseEventsWide = await store.listSubTransactionsInRange('2026-10-01', '2026-10-31');

  await store.insertTransaction({
    id: 'p_due',
    budget_id: 'p_budget',
    type: 'expense',
    amount: 420_000,
    tag_id: null,
    account_id: null,
    to_account_id: null,
    description: 'Card bill',
    transaction_date: '2026-10-05',
    payment_status: 'unpaid',
    has_breakdown: 0,
    created_at: STAMP,
    updated_at: STAMP,
    payment_due_date: '2026-10-20',
  });
  snapshot.dueEvents = await store.listTransactionsByDueDateRange('2026-10-19', '2026-10-21');
  snapshot.dueCleared = await store.updateTransaction({
    ...(await store.getTransaction('p_due')),
    payment_due_date: null,
    updated_at: STAMP,
  });
  snapshot.dueEventsAfterClear = await store.listTransactionsByDueDateRange('2026-10-19', '2026-10-21');
  snapshot.dueParentAfterClear = await store.getTransaction('p_due');
  // An attachment on the row about to be deleted: removing the transaction
  // must take its attachment rows with it on both engines.
  await store.insertAttachment({
    id: 'p_att_due',
    transaction_id: 'p_due',
    path: 'receipts/due.jpg',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.deleteTransaction('p_due');
  snapshot.attachmentsAfterParentDelete = await store.listAttachmentsByTransaction('p_due');

  // A zero-total breakdown parent must store and read back identically.
  await store.insertTransaction({
    id: 'p_zero_break',
    budget_id: 'p_budget',
    type: 'expense',
    amount: 0,
    tag_id: null,
    account_id: null,
    to_account_id: null,
    description: 'Offsetting split',
    transaction_date: '2026-10-07',
    payment_status: 'paid',
    has_breakdown: 1,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertSubTransaction({
    id: 'p_sub_deposit',
    transaction_id: 'p_zero_break',
    description: 'Deposit',
    amount: 5_000,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
  // A group that fails mid-write leaves nothing behind on either engine.
  await store.beginTransaction();
  await store.insertSubTransaction({
    id: 'p_sub_doomed',
    transaction_id: 'p_zero_break',
    description: 'Doomed',
    amount: 1,
    position: 1,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.rollbackTransaction();
  snapshot.subsAfterRollback = await store.listSubTransactionsByParent('p_zero_break');
  // Two parents at once: rows come back grouped by parent, (position, id)
  // within each — the exact order the Reports hydrator relies on.
  snapshot.subsByTwoParents = await store.listSubTransactionsForParents([
    'p_expense',
    'p_zero_break',
  ]);
  snapshot.zeroParentDeleteChanges = await store.deleteTransaction('p_zero_break');
  snapshot.subsAfterParentDelete = await store.listSubTransactionsByParent('p_zero_break');

  // One more attachment, this time on a child of the budget about to go:
  // exercises the budget → transaction → attachment two-level cascade.
  await store.insertAttachment({
    id: 'p_att_budget',
    transaction_id: 'p_expense',
    path: 'receipts/gone.png',
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.deletedBudgets = await store.deleteBudget('p_budget');
  snapshot.budgetAfterDelete = await store.getBudget('p_budget');
  snapshot.transactionsAfterDelete = await store.listTransactionsByBudget('p_budget');
  snapshot.attachmentsAfterBudgetDelete = await store.listAttachmentsByTransaction('p_expense');
  snapshot.subsAfterBudgetDelete = await store.listSubTransactionsByParent('p_expense');
  snapshot.remindersAfterDelete = await store.listReminders();

  snapshot.schemaVersion = await store.getSchemaVersion();

  await store.setSetting('currency', 'PHP');
  snapshot.settings = await store.getAllSettings();

  // --- accounts (no repository uses them; backups read/write them) -----
  snapshot.accountsBefore = await store.listAccounts();
  await store.insertAccount({
    id: 'p_acct_cash',
    name: 'Cash',
    type: 'cash',
    initial_balance: 25000,
    archived: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertAccount({
    id: 'p_acct_bank',
    name: 'Bank',
    type: 'bank',
    initial_balance: 0,
    archived: 1,
    created_at: '2026-10-06T01:00:00.000Z',
    updated_at: STAMP,
  });
  snapshot.accounts = await store.listAccounts();
  await store.replaceAccount({
    id: 'p_acct_bank',
    name: 'Main Bank',
    type: 'bank',
    initial_balance: 150000,
    archived: 0,
    created_at: '2026-10-06T01:00:00.000Z',
    updated_at: '2026-10-06T02:00:00.000Z',
  });
  snapshot.accountAfterReplace = await store.listAccounts();

  // --- full-row replacements used by the backup merge path -------------
  await store.insertBudget({
    id: 'p_merge_budget',
    name: 'Original name',
    start_date: '2026-11-01',
    end_date: '2026-11-30',
    color: '#FF9800',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.replaceBudget({
    id: 'p_merge_budget',
    name: 'Replaced name',
    start_date: '2026-11-02',
    end_date: '2026-11-28',
    color: null,
    created_at: STAMP,
    updated_at: '2026-10-06T02:00:00.000Z',
  });
  snapshot.budgetAfterReplace = await store.getBudget('p_merge_budget');

  await store.insertTag({
    id: 'p_merge_tag',
    name: 'Original tag',
    emoji: '🅾️',
    color: '#123456',
    is_default: 0,
    archived: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.replaceTag({
    id: 'p_merge_tag',
    name: 'Replaced tag',
    emoji: '🔁',
    color: null,
    is_default: 0,
    archived: 1,
    created_at: STAMP,
    updated_at: '2026-10-06T02:00:00.000Z',
  });
  snapshot.tagAfterReplace = await store.getTag('p_merge_tag');

  await store.insertTransaction({
    id: 'p_merge_tx',
    budget_id: 'p_merge_budget',
    type: 'expense',
    amount: 100,
    tag_id: 'p_merge_tag',
    description: 'Original',
    transaction_date: '2026-11-05',
    payment_status: 'paid',
    has_breakdown: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.replaceTransaction({
    id: 'p_merge_tx',
    budget_id: 'p_merge_budget',
    type: 'expense',
    amount: 200,
    tag_id: null,
    description: 'Replaced',
    transaction_date: '2026-11-06',
    payment_status: 'unpaid',
    has_breakdown: 0,
    payment_due_date: '2026-11-20',
    created_at: STAMP,
    updated_at: '2026-10-06T02:00:00.000Z',
  });
  snapshot.transactionAfterReplace = await store.getTransaction('p_merge_tx');

  // --- attachments (receipt images) --------------------------------------
  // Two rows on one parent, then read back the whole operations surface:
  // stable (created_at, id) order, the parent-grouped read, single lookups,
  // and the delete's change count must agree on both engines.
  await store.insertAttachment({
    id: 'p_att_a',
    transaction_id: 'p_merge_tx',
    path: 'receipts/a.jpg',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertAttachment({
    id: 'p_att_b',
    transaction_id: 'p_merge_tx',
    path: 'receipts/b.png',
    created_at: '2026-10-06T01:00:00.000Z',
    updated_at: '2026-10-06T01:00:00.000Z',
  });
  snapshot.attachmentsByParent = await store.listAttachmentsByTransaction('p_merge_tx');
  snapshot.attachmentsForParents = await store.listAttachmentsForParents([
    'p_merge_tx',
    'p_merge_tx',
    'p_missing_parent',
  ]);
  snapshot.attachment = await store.getAttachment('p_att_a');
  snapshot.attachmentMissing = await store.getAttachment('no_such_attachment');
  snapshot.attachmentDeleteChanges = await store.deleteAttachment('p_att_b');
  snapshot.attachmentsAfterSingleDelete = await store.listAttachmentsByTransaction('p_merge_tx');

  await store.insertReminder({
    id: 'p_merge_rem',
    enabled: 1,
    status: 'active',
    remind_date: '2026-11-10',
    remind_time: '08:00',
    remind_at: '2026-11-10T08:00:00+08:00',
    notification_id: 'os-1',
    notes: 'original',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.replaceReminder({
    id: 'p_merge_rem',
    transaction_id: 'p_merge_tx',
    enabled: 0,
    status: 'completed',
    remind_date: '2026-11-11',
    remind_time: '09:30',
    remind_at: '2026-11-11T09:30:00+08:00',
    notification_id: null,
    notes: 'replaced',
    created_at: STAMP,
    updated_at: '2026-10-06T02:00:00.000Z',
  });
  snapshot.reminderAfterReplace = await store.getReminder('p_merge_rem');

  // --- archiving is a soft delete on both engines ------------------------
  // setBudgetArchived stamps deleted_at (never a hard delete), cross-budget
  // reads hide the row, listBudgets({includeArchived:true}) still finds it,
  // and restoring clears the column so the same id comes back intact.
  snapshot.archiveChanges = await store.setBudgetArchived('p_budget', STAMP, STAMP);
  snapshot.budgetsHiddenByArchive = (await store.listBudgets()).map((budget) => budget.id);
  snapshot.budgetsIncludingArchived = (await store.listBudgets({ includeArchived: true })).map(
    (budget) => `${budget.id}:${budget.folder_id}:${budget.deleted_at}`,
  );
  snapshot.archivedTransactionsInRange = await store.listTransactionsInRange(
    '2026-10-01',
    '2026-10-31',
  );
  snapshot.archivedBudgetRow = await store.getBudget('p_budget');
  snapshot.restoreChanges = await store.setBudgetArchived('p_budget', null, STAMP);
  snapshot.budgetsAfterRestore = (await store.listBudgets()).map((budget) => budget.id);

  // --- a folder's budgets are archived together (folder deletion) --------
  await store.insertFolder({
    id: 'p_archive_folder',
    name: 'Archive Me',
    color: null,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertBudget({
    id: 'p_archive_budget',
    name: 'Archived With Folder',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    folder_id: 'p_archive_folder',
    created_at: STAMP,
    updated_at: STAMP,
  });
  snapshot.folderArchiveChanges = await store.archiveBudgetsInFolder(
    'p_archive_folder',
    STAMP,
    STAMP,
  );
  snapshot.folderArchiveHidden = (await store.listBudgets()).map((budget) => budget.id);
  snapshot.folderArchiveKept = (await store.listBudgets({ includeArchived: true })).map(
    (budget) => `${budget.id}:${budget.folder_id}:${budget.deleted_at}`,
  );
  // A second pass must be a no-op: already-archived rows are left alone.
  snapshot.folderArchiveSecondPass = await store.archiveBudgetsInFolder(
    'p_archive_folder',
    '2026-10-06T03:00:00.000Z',
    '2026-10-06T03:00:00.000Z',
  );

  // --- archiving hides a budget's calendar events -------------------------
  // p_budget was hard-deleted by the cascade test above, so this fresh pair of
  // live budgets is what proves the Calendar's reads: the archived budget's
  // transaction, breakdown purchase, payment due date and reminder all
  // disappear, an unrelated active budget keeps every one of its own, the
  // reminder row itself survives untouched, and restoring brings it straight
  // back — on both engines.
  await store.insertBudget({
    id: 'p_arc_budget',
    name: 'Archived Events',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    folder_id: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertTransaction({
    id: 'p_arc_tx',
    budget_id: 'p_arc_budget',
    type: 'expense',
    amount: 12_000,
    tag_id: null,
    account_id: null,
    to_account_id: null,
    description: 'Archived bill',
    transaction_date: '2026-10-21',
    payment_status: 'unpaid',
    has_breakdown: 1,
    payment_due_date: '2026-10-25',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertSubTransaction({
    id: 'p_arc_sub',
    transaction_id: 'p_arc_tx',
    description: 'Archived purchase',
    amount: 12_000,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
    purchase_date: '2026-10-22',
    purchase_time: '10:30',
    notes: null,
  });
  await store.insertReminder({
    id: 'p_arc_reminder',
    transaction_id: 'p_arc_tx',
    enabled: 1,
    status: 'active',
    remind_date: '2026-10-23',
    remind_time: '09:00',
    remind_at: '2026-10-23T09:00:00+08:00',
    notification_id: null,
    notes: '',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertBudget({
    id: 'p_live_budget',
    name: 'Live Events',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    folder_id: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertTransaction({
    id: 'p_live_tx',
    budget_id: 'p_live_budget',
    type: 'expense',
    amount: 8_000,
    tag_id: null,
    account_id: null,
    to_account_id: null,
    description: 'Live bill',
    transaction_date: '2026-10-24',
    payment_status: 'unpaid',
    has_breakdown: 0,
    payment_due_date: '2026-10-27',
    created_at: STAMP,
    updated_at: STAMP,
  });
  await store.insertReminder({
    id: 'p_live_reminder',
    transaction_id: 'p_live_tx',
    enabled: 1,
    status: 'active',
    remind_date: '2026-10-26',
    remind_time: '09:00',
    remind_at: '2026-10-26T09:00:00+08:00',
    notification_id: null,
    notes: '',
    created_at: STAMP,
    updated_at: STAMP,
  });

  await store.setBudgetArchived('p_arc_budget', STAMP, STAMP);
  snapshot.arcReminders = (await store.listReminders()).map((row) => row.id);
  snapshot.arcRemindersAll = (await store.listReminders({ includeArchived: true })).map(
    (row) => row.id,
  );
  // The dashboard's compact recent list: newest first, capped at the limit,
  // and — like every cross-budget read — blind to an archived budget's rows.
  snapshot.recentTransactions = (await store.listRecentTransactions(5)).map((row) => row.id);
  snapshot.recentTransactionsAll = (await store.listRecentTransactions(200)).map((row) => row.id);
  // The scoped reads the Calendar, the budget detail view and the transaction
  // form use: same rows, same order and same archive rule as the full read,
  // but narrowed by the engine instead of filtered in JS.
  snapshot.arcRemindersMonth = (await store.listRemindersInRange('2026-10-01', '2026-10-31')).map(
    (row) => row.id,
  );
  snapshot.arcRemindersMonthAll = (
    await store.listRemindersInRange('2026-10-01', '2026-10-31', { includeArchived: true })
  ).map((row) => row.id);
  snapshot.arcRemindersOtherMonth = (await store.listRemindersInRange('2026-09-01', '2026-09-30')).map(
    (row) => row.id,
  );
  snapshot.arcRemindersLiveDay = (
    await store.listRemindersInRange('2026-10-26', '2026-10-26')
  ).map((row) => row.id);
  snapshot.arcRemindersArchivedDay = (
    await store.listRemindersInRange('2026-10-23', '2026-10-23')
  ).map((row) => row.id);
  snapshot.arcRemindersLiveBudget = (await store.listRemindersForBudget('p_live_budget')).map(
    (row) => row.id,
  );
  snapshot.arcRemindersArchivedBudget = (await store.listRemindersForBudget('p_arc_budget')).map(
    (row) => row.id,
  );
  snapshot.arcRemindersArchivedBudgetAll = (
    await store.listRemindersForBudget('p_arc_budget', { includeArchived: true })
  ).map((row) => row.id);
  snapshot.arcRemindersLiveTransaction = (
    await store.listRemindersForTransaction('p_live_tx')
  ).map((row) => row.id);
  snapshot.arcRemindersArchivedTransaction = (
    await store.listRemindersForTransaction('p_arc_tx')
  ).map((row) => row.id);
  snapshot.arcRemindersArchivedTransactionAll = (
    await store.listRemindersForTransaction('p_arc_tx', { includeArchived: true })
  ).map((row) => row.id);
  // Standing in for a caller that asks for something that is not there.
  snapshot.arcRemindersMissingBudget = (await store.listRemindersForBudget('no_such_budget')).length;
  snapshot.arcRemindersMissingTransaction = (await store.listRemindersForTransaction(null)).length;
  // The scoped reads must be exactly what the old full read plus a JS filter
  // produced — filtering a sorted list preserves the order.
  const fullReminders = await store.listReminders({ includeArchived: true });
  snapshot.arcScopedMatchesFullRead =
    JSON.stringify(
      fullReminders
        .filter((row) => row.remind_date >= '2026-10-01' && row.remind_date <= '2026-10-31')
        .map((row) => row.id),
    ) === JSON.stringify(snapshot.arcRemindersMonthAll) &&
    JSON.stringify(
      fullReminders.filter((row) => row.budget_id === 'p_arc_budget').map((row) => row.id),
    ) === JSON.stringify(snapshot.arcRemindersArchivedBudgetAll) &&
    JSON.stringify(
      fullReminders.filter((row) => row.transaction_id === 'p_arc_tx').map((row) => row.id),
    ) === JSON.stringify(snapshot.arcRemindersArchivedTransactionAll);
  snapshot.arcReminderRow = await store.getReminder('p_arc_reminder');
  snapshot.arcEvents = (await store.listTransactionsInRange('2026-10-01', '2026-10-31')).map(
    (row) => row.id,
  );
  snapshot.arcPurchases = (await store.listSubTransactionsInRange('2026-10-01', '2026-10-31')).map(
    (row) => row.id,
  );
  snapshot.arcDue = (
    await store.listTransactionsByDueDateRange('2026-10-01', '2026-10-31')
  ).map((row) => row.id);
  snapshot.arcRestore = await store.setBudgetArchived('p_arc_budget', null, STAMP);
  snapshot.arcRemindersAfterRestore = (await store.listReminders()).map((row) => row.id);

  // --- a rolled-back wipe restores every table (failed-restore safety) --
  await store.beginTransaction();
  await store.clearAllData();
  await store.rollbackTransaction();
  snapshot.afterWipeRollback = {
    accounts: await store.listAccounts(),
    budget: await store.getBudget('p_merge_budget'),
    tag: await store.getTag('p_merge_tag'),
    transaction: await store.getTransaction('p_merge_tx'),
    reminder: await store.getReminder('p_merge_rem'),
    attachment: await store.getAttachment('p_att_a'),
    budgetCount: (await store.listBudgets()).length,
    tagCount: (await store.listTags({ includeArchived: true })).length,
    reminderCount: (await store.listReminders()).length,
    transactions: await store.listTransactionsInRange('2026-11-01', '2026-11-30'),
    settings: await store.getAllSettings(),
  };

  // --- a committed wipe empties everything ------------------------------
  await store.clearAllData();
  snapshot.afterFullWipe = {
    accounts: await store.listAccounts(),
    budgets: await store.listBudgets(),
    tags: await store.listTags({ includeArchived: true }),
    transactions: await store.listTransactionsInRange('2026-11-01', '2026-11-30'),
    subTransactions: await store.listSubTransactionsInRange('0000-01-01', '9999-12-31'),
    attachment: await store.getAttachment('p_att_a'),
    reminders: await store.listReminders(),
    settings: await store.getAllSettings(),
  };

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
check(
  'both adapters report the same schema version',
  sqliteResult.schemaVersion === memoryResult.schemaVersion &&
    sqliteResult.schemaVersion === LATEST_VERSION,
);
const parityBudget = sqliteResult.budgets.find((budget) => budget.id === 'p_budget');
check(
  'both adapters report period income on the folder row',
  parityBudget?.income === 400_000 && memoryResult.budgets.find((budget) => budget.id === 'p_budget')?.income === 400_000,
  String(parityBudget?.income),
);

check(
  'reminder notes round-trip and survive notification-only updates on both engines',
  sqliteResult.reminder.notes === 'Pay the landlord on the day.' &&
    sqliteResult.rescheduledReminder.notes === 'Pay the landlord on the day.' &&
    sqliteResult.disabledReminder.notes === 'Pay the landlord on the day.' &&
    sqliteResult.notesClearedReminder.notes === '' &&
    memoryResult.reminder.notes === 'Pay the landlord on the day.' &&
    memoryResult.rescheduledReminder.notes === 'Pay the landlord on the day.' &&
    memoryResult.disabledReminder.notes === 'Pay the landlord on the day.' &&
    memoryResult.notesClearedReminder.notes === '',
  JSON.stringify([sqliteResult.disabledReminder?.notes, memoryResult.notesClearedReminder?.notes]),
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

check(
  'searching a child description returns the parent once, with its item count',
  sqliteResult.searchByChild.length === 1 &&
    sqliteResult.searchByChild[0].id === 'p_expense' &&
    sqliteResult.searchByChild[0].sub_transaction_count === 2 &&
    memoryResult.searchByChild.length === 1 &&
    memoryResult.searchByChild[0].id === 'p_expense' &&
    memoryResult.searchByChild[0].sub_transaction_count === 2,
  JSON.stringify(sqliteResult.searchByChild.map((row) => row.id)),
);
check(
  'breakdown items read back in persisted order on both engines',
  sqliteResult.subsReordered.map((item) => item.id).join(',') === 'p_sub_discount,p_sub_rice' &&
    memoryResult.subsReordered.map((item) => item.id).join(',') === 'p_sub_discount,p_sub_rice',
  JSON.stringify(sqliteResult.subsReordered?.map((item) => item.id)),
);
check(
  'reordering never changes the calculated total',
  sqliteResult.subsByParent.reduce((total, item) => total + item.amount, 0) ===
    sqliteResult.subsReordered.reduce((total, item) => total + item.amount, 0) &&
    memoryResult.subsByParent.reduce((total, item) => total + item.amount, 0) ===
      memoryResult.subsReordered.reduce((total, item) => total + item.amount, 0),
);
check(
  'a zero-total breakdown parent stores and reads back on both engines',
  sqliteResult.zeroParentDeleteChanges === 1 &&
    memoryResult.zeroParentDeleteChanges === 1,
  String(sqliteResult.zeroParentDeleteChanges),
);
check(
  'a rolled-back group leaves no partial write on either engine',
  sqliteResult.subsAfterRollback.length === 1 &&
    sqliteResult.subsAfterRollback[0].id === 'p_sub_deposit' &&
    memoryResult.subsAfterRollback.length === 1 &&
    memoryResult.subsAfterRollback[0].id === 'p_sub_deposit',
  JSON.stringify(sqliteResult.subsAfterRollback),
);
check(
  'deleting a parent removes its breakdown items on both engines',
  sqliteResult.subsAfterParentDelete.length === 0 &&
    memoryResult.subsAfterParentDelete.length === 0,
);
check(
  'purchase events round-trip identically: dated items only, joined to parents',
  sqliteResult.purchaseEvents.length === 1 &&
    sqliteResult.purchaseEvents[0].id === 'p_sub_rice' &&
    sqliteResult.purchaseEvents[0].parent_type === 'expense' &&
    sqliteResult.purchaseEvents[0].notes === 'Wet market, cash.' &&
    JSON.stringify(sqliteResult.purchaseEvents) === JSON.stringify(memoryResult.purchaseEvents) &&
    JSON.stringify(sqliteResult.purchaseEventsWide) ===
      JSON.stringify(memoryResult.purchaseEventsWide),
  JSON.stringify(sqliteResult.purchaseEvents),
);
check(
  'a payment due date selects its parent and clearing removes only the event',
  sqliteResult.dueEvents.length === 1 &&
    sqliteResult.dueEvents[0].id === 'p_due' &&
    memoryResult.dueEvents.length === 1 &&
    JSON.stringify(memoryResult.dueEvents[0]) === JSON.stringify(sqliteResult.dueEvents[0]) &&
    sqliteResult.dueCleared === 1 &&
    sqliteResult.dueEventsAfterClear.length === 0 &&
    memoryResult.dueEventsAfterClear.length === 0 &&
    sqliteResult.dueParentAfterClear.payment_due_date === null &&
    memoryResult.dueParentAfterClear.payment_due_date === null,
  JSON.stringify(sqliteResult.dueEvents),
);
check(
  'deleting a budget cascades through transactions to breakdown items',
  sqliteResult.subsAfterBudgetDelete.length === 0 &&
    memoryResult.subsAfterBudgetDelete.length === 0,
);
check(
  'accounts round-trip through insert, list and replace identically',
  sqliteResult.accountAfterReplace.length === 2 &&
    sqliteResult.accountAfterReplace[1].name === 'Main Bank' &&
    sqliteResult.accountAfterReplace[1].initial_balance === 150000 &&
    memoryResult.accountAfterReplace[1].name === 'Main Bank' &&
    JSON.stringify(sqliteResult.accountAfterReplace) ===
      JSON.stringify(memoryResult.accountAfterReplace),
  JSON.stringify(sqliteResult.accountAfterReplace),
);
check(
  'full-row replace updates every stored column on both engines',
  sqliteResult.budgetAfterReplace.name === 'Replaced name' &&
    sqliteResult.budgetAfterReplace.color === null &&
    sqliteResult.tagAfterReplace.archived === 1 &&
    sqliteResult.transactionAfterReplace.payment_due_date === '2026-11-20' &&
    sqliteResult.transactionAfterReplace.tag_id === null &&
    sqliteResult.reminderAfterReplace.status === 'completed' &&
    sqliteResult.reminderAfterReplace.notification_id === null &&
    JSON.stringify(sqliteResult.budgetAfterReplace) ===
      JSON.stringify(memoryResult.budgetAfterReplace) &&
    JSON.stringify(sqliteResult.transactionAfterReplace) ===
      JSON.stringify(memoryResult.transactionAfterReplace) &&
    JSON.stringify(sqliteResult.reminderAfterReplace) ===
      JSON.stringify(memoryResult.reminderAfterReplace),
);
check(
  'a rolled-back wipe restores every table on both engines',
  sqliteResult.afterWipeRollback.budget.name === 'Replaced name' &&
    sqliteResult.afterWipeRollback.transaction.description === 'Replaced' &&
    sqliteResult.afterWipeRollback.reminder.notes === 'replaced' &&
    sqliteResult.afterWipeRollback.accounts.length === 2 &&
    sqliteResult.afterWipeRollback.budgetCount > 0 &&
    sqliteResult.afterWipeRollback.tagCount > 0 &&
    sqliteResult.afterWipeRollback.transactions.length === 1 &&
    sqliteResult.afterWipeRollback.settings.currency === 'PHP' &&
    JSON.stringify(sqliteResult.afterWipeRollback) ===
      JSON.stringify(memoryResult.afterWipeRollback),
);
check(
  'a committed wipe empties every table on both engines',
  sqliteResult.afterFullWipe.budgets.length === 0 &&
    sqliteResult.afterFullWipe.tags.length === 0 &&
    sqliteResult.afterFullWipe.accounts.length === 0 &&
    sqliteResult.afterFullWipe.transactions.length === 0 &&
    sqliteResult.afterFullWipe.reminders.length === 0 &&
    Object.keys(sqliteResult.afterFullWipe.settings).length === 0 &&
    JSON.stringify(sqliteResult.afterFullWipe) === JSON.stringify(memoryResult.afterFullWipe),
);
check(
  'an archived budget hides its reminders from the calendar list on both engines',
  sqliteResult.arcReminders.includes('p_arc_reminder') === false &&
    sqliteResult.arcReminders.includes('p_live_reminder') &&
    // The row itself is untouched by archiving — only hidden.
    sqliteResult.arcReminderRow?.enabled === 1 &&
    sqliteResult.arcReminderRow?.remind_date === '2026-10-23' &&
    sqliteResult.arcRemindersAll.includes('p_arc_reminder') &&
    JSON.stringify(sqliteResult.arcReminders) === JSON.stringify(memoryResult.arcReminders) &&
    JSON.stringify(sqliteResult.arcRemindersAll) === JSON.stringify(memoryResult.arcRemindersAll),
  JSON.stringify(sqliteResult.arcReminders),
);
check(
  'an archived budget hides its calendar events, purchases and payments on both engines',
  sqliteResult.arcEvents.includes('p_arc_tx') === false &&
    sqliteResult.arcEvents.includes('p_live_tx') &&
    sqliteResult.arcPurchases.includes('p_arc_sub') === false &&
    sqliteResult.arcDue.includes('p_arc_tx') === false &&
    sqliteResult.arcDue.includes('p_live_tx') &&
    JSON.stringify(sqliteResult.arcEvents) === JSON.stringify(memoryResult.arcEvents) &&
    JSON.stringify(sqliteResult.arcPurchases) === JSON.stringify(memoryResult.arcPurchases) &&
    JSON.stringify(sqliteResult.arcDue) === JSON.stringify(memoryResult.arcDue),
  JSON.stringify(sqliteResult.arcEvents),
);
check(
  'restoring a budget brings its reminders back on both engines',
  sqliteResult.arcRemindersAfterRestore.includes('p_arc_reminder') &&
    sqliteResult.arcRestore === 1 &&
    memoryResult.arcRestore === 1 &&
    JSON.stringify(sqliteResult.arcRemindersAfterRestore) ===
      JSON.stringify(memoryResult.arcRemindersAfterRestore),
  JSON.stringify(sqliteResult.arcRemindersAfterRestore),
);
check(
  'the scoped reminder reads return exactly what a full read plus a filter returned on both engines',
  sqliteResult.arcScopedMatchesFullRead === true && memoryResult.arcScopedMatchesFullRead === true,
  String(sqliteResult.arcScopedMatchesFullRead),
);
check(
  'a range read narrows to the month and the day, hiding archived budgets by default',
  sqliteResult.arcRemindersMonth.includes('p_live_reminder') &&
    sqliteResult.arcRemindersMonth.includes('p_arc_reminder') === false &&
    sqliteResult.arcRemindersMonthAll.includes('p_arc_reminder') &&
    sqliteResult.arcRemindersOtherMonth.includes('p_live_reminder') === false &&
    sqliteResult.arcRemindersLiveDay.includes('p_live_reminder') &&
    sqliteResult.arcRemindersArchivedDay.includes('p_arc_reminder') === false,
  JSON.stringify([sqliteResult.arcRemindersMonth, sqliteResult.arcRemindersLiveDay]),
);
check(
  'a budget or transaction read stays scoped to that scope on both engines',
  sqliteResult.arcRemindersLiveBudget.includes('p_live_reminder') &&
    sqliteResult.arcRemindersLiveBudget.includes('p_arc_reminder') === false &&
    sqliteResult.arcRemindersArchivedBudget.length === 0 &&
    sqliteResult.arcRemindersArchivedBudgetAll.includes('p_arc_reminder') &&
    sqliteResult.arcRemindersLiveTransaction.length === 1 &&
    sqliteResult.arcRemindersLiveTransaction[0] === 'p_live_reminder' &&
    sqliteResult.arcRemindersArchivedTransaction.length === 0 &&
    sqliteResult.arcRemindersArchivedTransactionAll.length === 1 &&
    sqliteResult.arcRemindersArchivedTransactionAll[0] === 'p_arc_reminder' &&
    sqliteResult.arcRemindersMissingBudget === 0 &&
    sqliteResult.arcRemindersMissingTransaction === 0,
  JSON.stringify([
    sqliteResult.arcRemindersArchivedBudget,
    sqliteResult.arcRemindersLiveTransaction,
  ]),
);
check(
  'the recent-transactions read caps its list and hides archived budgets on both engines',
  sqliteResult.recentTransactions.length > 0 &&
    sqliteResult.recentTransactions.length <= 5 &&
    sqliteResult.recentTransactionsAll.includes('p_arc_tx') === false &&
    JSON.stringify(sqliteResult.recentTransactions) ===
      JSON.stringify(memoryResult.recentTransactions) &&
    JSON.stringify(sqliteResult.recentTransactionsAll) ===
      JSON.stringify(memoryResult.recentTransactionsAll),
  JSON.stringify(sqliteResult.recentTransactions),
);
check(
  'deleting a transaction or budget cascades its attachments on both engines',
  sqliteResult.attachmentsAfterParentDelete.length === 0 &&
    sqliteResult.attachmentsAfterBudgetDelete.length === 0 &&
    sqliteResult.attachmentDeleteChanges === 1 &&
    memoryResult.attachmentsAfterParentDelete.length === 0 &&
    memoryResult.attachmentsAfterBudgetDelete.length === 0 &&
    memoryResult.attachmentDeleteChanges === 1,
);
check(
  'attachment rows survive a rolled-back wipe and vanish on a committed one',
  sqliteResult.afterWipeRollback.attachment?.id === 'p_att_a' &&
    memoryResult.afterWipeRollback.attachment?.id === 'p_att_a' &&
    sqliteResult.afterFullWipe.attachment === null &&
    memoryResult.afterFullWipe.attachment === null,
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
check('legacy database has fourteen pending migrations', pending.length === 14, String(pending.length));
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
for (const expected of [
  'accounts',
  'attachments',
  'budgets',
  'folders',
  'reminders',
  'settings',
  'tags',
  'transactions',
]) {
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

console.log('\n--- budget manual order (migration 012) ---');

/**
 * A v10-shaped database (position absent, folder_id present) with rows that
 * span two scopes. Migration 012 must rank each scope by exactly the old
 * default ORDER BY so the upgrade changes nothing on screen.
 */
const orderDb = new DatabaseSync(':memory:');
const orderAdapter = createAdapter(orderDb);
orderDb.exec(`
  CREATE TABLE budgets (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, start_date TEXT NOT NULL,
    end_date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    color TEXT, folder_id TEXT);
  INSERT INTO budgets (id, name, start_date, end_date, created_at, updated_at, color, folder_id) VALUES
    ('root_new', 'Root new', '2026-03-01', '2026-03-31', '2026-01-01', '2026-01-01', NULL, NULL),
    ('root_mid', 'Root mid', '2026-02-01', '2026-02-28', '2026-01-01', '2026-01-01', NULL, NULL),
    ('root_old', 'Root old', '2026-01-01', '2026-01-31', '2026-01-01', '2026-01-01', NULL, NULL),
    ('fold_b', 'Folder B', '2025-12-01', '2025-12-31', '2025-12-01', '2025-12-01', NULL, 'f1'),
    ('fold_a', 'Folder A', '2025-11-01', '2025-11-30', '2025-11-01', '2025-11-01', NULL, 'f1');
`);
await budgetPositionMigration.up(orderAdapter);

const rankedRoot = await orderAdapter.getAllAsync(`
  SELECT id FROM budgets WHERE folder_id IS NULL
   ORDER BY position ASC, start_date DESC, created_at DESC
`);
const rankedFolder = await orderAdapter.getAllAsync(`
  SELECT id FROM budgets WHERE folder_id = 'f1'
   ORDER BY position ASC, start_date DESC, created_at DESC
`);
check(
  'root scope keeps its default order after materialising ranks',
  rankedRoot.map((row) => row.id).join(',') === 'root_new,root_mid,root_old',
  rankedRoot.map((row) => row.id).join(','),
);
check(
  'folder scope ranks independently of the root scope',
  rankedFolder.map((row) => row.id).join(',') === 'fold_b,fold_a',
  rankedFolder.map((row) => row.id).join(','),
);
const rankValues = await orderAdapter.getAllAsync('SELECT id, position FROM budgets ORDER BY id');
check(
  'ranks are contiguous per scope starting at zero',
  rankValues.map((row) => `${row.id}:${row.position}`).join(',') ===
    'fold_a:1,fold_b:0,root_mid:1,root_new:0,root_old:2',
  rankValues.map((row) => `${row.id}:${row.position}`).join(','),
);

console.log('\n--- payment status rules ---');
check('only two statuses exist', JSON.stringify(PAYMENT_STATUSES) === '["unpaid","paid"]');
check(
  'a new expense defaults to paid',
  defaultPaymentStatus(undefined) === 'paid' && defaultPaymentStatus(null) === 'paid',
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

console.log('\n--- breakdown rules ---');
check(
  'the parent total is the signed sum of its items',
  computeBreakdownTotal([
    { description: 'Groceries', amount: 100_000 },
    { description: 'Discount', amount: -10_000 },
  ]) === 90_000,
);
check('an empty breakdown totals zero', computeBreakdownTotal([]) === 0);
check(
  'a zero calculated total is valid',
  breakdownValidationError(
    normalizeBreakdownItems([
      { description: 'Deposit', amount: 5_000 },
      { description: 'Refund', amount: -5_000 },
    ]),
  ) === null,
);
check(
  'a negative calculated total is rejected, never clamped',
  breakdownValidationError(normalizeBreakdownItems([{ description: 'Refund', amount: -5_000 }])) ===
    'The breakdown total cannot be negative.',
);
check(
  'negative individual items are valid adjustments',
  breakdownValidationError(
    normalizeBreakdownItems([
      { description: 'Cart', amount: 20_000 },
      { description: 'Discount', amount: -10_000 },
    ]),
  ) === null,
);
check(
  'every item needs a non-blank description',
  breakdownValidationError(normalizeBreakdownItems([{ description: '   ', amount: 100 }])) ===
    'Every breakdown item needs a description.',
);
const trimmedItem = normalizeBreakdownItems([{ id: 's1', description: '  Rice 5kg  ', amount: 100 }])[0];
check('descriptions are trimmed and ids are kept', trimmedItem.description === 'Rice 5kg' && trimmedItem.id === 's1');
const preparedRows = prepareBreakdownRows(
  [trimmedItem, { description: 'Oil', amount: 50 }],
  { createId: (prefix) => `${prefix}_minted`, timestamp: STAMP },
);
check(
  'positions persist list order from zero',
  preparedRows.map((row) => row.position).join(',') === '0,1',
  JSON.stringify(preparedRows),
);
check(
  'items keep existing ids and mint fresh ones for duplicates',
  preparedRows[0].id === 's1' && preparedRows[1].id === 'subtx_minted',
  JSON.stringify(preparedRows.map((row) => row.id)),
);

check(
  'a malformed purchase date is rejected by the same rules the repository uses',
  breakdownValidationError(
    normalizeBreakdownItems([{ description: 'Rice', amount: 100, purchase_date: '2026-02-30' }]),
  ) === 'Breakdown purchase dates must be real calendar dates (YYYY-MM-DD).',
);
check(
  'a malformed purchase time is rejected outright',
  breakdownValidationError(
    normalizeBreakdownItems([{ description: 'Rice', amount: 100, purchase_time: '25:00' }]),
  ) === 'Breakdown purchase times must be 24-hour HH:mm.',
);
check(
  'notes are trimmed and an empty note clears to null',
  normalizeBreakdownItems([
    { description: 'Rice', amount: 100, notes: '  keep me  ' },
    { description: 'Oil', amount: 50, notes: '   ' },
  ]).map((item) => String(item.notes)).join('|') === 'keep me|null',
);
const datedRows = prepareBreakdownRows(
  [
    {
      id: 's9',
      description: 'Rice',
      amount: 100,
      purchase_date: '2026-10-08',
      purchase_time: '09:15',
      notes: 'note',
    },
  ],
  { createId: (prefix) => `${prefix}_x`, timestamp: STAMP },
);
check(
  'storage rows carry purchase date, time, and notes',
  datedRows[0].purchase_date === '2026-10-08' &&
    datedRows[0].purchase_time === '09:15' &&
    datedRows[0].notes === 'note',
  JSON.stringify(datedRows),
);
check(
  'isIsoCalendarDate accepts real days only',
  isIsoCalendarDate('2026-02-28') && !isIsoCalendarDate('2026-02-30') && !isIsoCalendarDate('nope'),
);
check(
  'isHhMm accepts 24-hour times only',
  isHhMm('09:15') && isHhMm('23:59') && !isHhMm('9:15') && !isHhMm('24:00'),
);
check(
  'the payment lifecycle reads status first, then the due date',
  derivePaymentEventStatus(
    { type: 'expense', payment_status: 'paid', payment_due_date: '2026-10-01' },
    '2026-10-12',
  ) === 'paid' &&
    derivePaymentEventStatus(
      { type: 'expense', payment_status: 'unpaid', payment_due_date: '2026-10-01' },
      '2026-10-12',
    ) === 'overdue' &&
    derivePaymentEventStatus(
      { type: 'expense', payment_status: 'unpaid', payment_due_date: '2026-10-12' },
      '2026-10-12',
    ) === 'dueToday' &&
    derivePaymentEventStatus(
      { type: 'expense', payment_status: 'unpaid', payment_due_date: '2026-11-01' },
      '2026-10-12',
    ) === 'upcoming' &&
    derivePaymentEventStatus({ type: 'expense', payment_status: 'unpaid' }, '2026-10-12') === null,
);
check(
  'the purchase perspective replaces breakdown parents with their dated items',
  (() => {
    const parents = [
      { id: 'plain', type: 'expense', amount: 500, transaction_date: '2026-10-05', has_breakdown: 0 },
      {
        id: 'parent',
        type: 'expense',
        amount: 900,
        transaction_date: '2026-10-06',
        tag_id: 't1',
        has_breakdown: 1,
        subTransactions: [
          { id: 'a', amount: 1000, description: 'Rice', purchase_date: '2026-10-08' },
          { id: 'b', amount: -100, description: 'Refund', purchase_date: null },
        ],
      },
    ];
    const events = [
      {
        id: 'a',
        transaction_id: 'parent',
        description: 'Rice',
        amount: 1000,
        purchase_date: '2026-10-08',
        parent_type: 'expense',
        parent_tag_id: 't1',
        parent_budget_id: 'bud',
      },
    ];
    const rows = toPurchaseRows(parents, events);
    return (
      rows.length === 3 &&
      rows.some((row) => row.id === 'plain') &&
      !rows.some((row) => row.id === 'parent') &&
      rows.some(
        (row) =>
          row.id === 'purchase_a' &&
          row.transaction_date === '2026-10-08' &&
          row.amount === 1000 &&
          row.tag_id === 't1',
      ) &&
      rows.some(
        (row) =>
          row.id === 'purchase_b' && row.transaction_date === '2026-10-06' && row.amount === -100,
      ) &&
      computeTotals(rows).expense === 1400
    );
  })(),
);
check(
  'the purchase perspective counts every cent exactly once',
  computeTotals(
    toPurchaseRows(
      [
        {
          id: 'parent',
          type: 'expense',
          amount: 180_000,
          transaction_date: '2026-10-05',
          has_breakdown: 1,
          subTransactions: [],
        },
      ],
      [
        { id: 'i1', transaction_id: 'parent', description: 'G', amount: 125_000, purchase_date: '2026-10-08', parent_type: 'expense' },
        { id: 'i2', transaction_id: 'parent', description: 'F', amount: 80_000, purchase_date: '2026-10-09', parent_type: 'expense' },
        { id: 'i3', transaction_id: 'parent', description: 'R', amount: -25_000, purchase_date: '2026-10-10', parent_type: 'expense' },
      ],
    ),
  ).expense === 180_000,
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

const upcomingStatus = deriveReminderStatus(
  { status: 'active', remind_at: buildRemindAt('2026-10-08', '09:00') },
  new Date(2026, 9, 7),
);
const overdueStatus = deriveReminderStatus(
  { status: 'active', remind_at: buildRemindAt('2026-10-06', '09:00') },
  new Date(2026, 9, 7),
);
const completedStatus = deriveReminderStatus(
  { status: 'completed', remind_at: buildRemindAt('2026-10-06', '09:00') },
  new Date(2026, 9, 7),
);
check('a future armed reminder is upcoming', upcomingStatus === 'upcoming', upcomingStatus);
check('a past armed reminder is overdue', overdueStatus === 'overdue', overdueStatus);
check('a completed reminder never reads as overdue', completedStatus === 'completed', completedStatus);

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

const notedCopy = buildReminderNotification({ notes: 'Pay the landlord on the day.' });
check(
  'the notification body is the saved reminder note',
  notedCopy.body === 'Pay the landlord on the day.',
  notedCopy.body,
);
check('the notification is titled as a payment reminder', notedCopy.title === 'Payment reminder', notedCopy.title);

const standaloneCopy = buildReminderNotification({ notes: 'Buy milk', linked: false });
check(
  'a standalone reminder is titled as a plain reminder',
  standaloneCopy.title === 'Reminder',
  standaloneCopy.title,
);

const blankCopy = buildReminderNotification({ notes: '   \n\t ' });
check(
  'blank or whitespace-only notes fall back to a generic message',
  blankCopy.body === 'You have a scheduled reminder.',
  blankCopy.body,
);

const paddedCopy = buildReminderNotification({ notes: '  Rent is due Friday.  ' });
check('the note is trimmed before it becomes the body', paddedCopy.body === 'Rent is due Friday.', paddedCopy.body);

const longCopy = buildReminderNotification({ notes: 'x'.repeat(800) });
check(
  'unusually long notes are capped with an ellipsis',
  longCopy.body.length <= 501 && longCopy.body.endsWith('…'),
  String(longCopy.body.length),
);

const unnamedCopy = buildReminderNotification({ notes: undefined });
check('a missing notes value still yields readable copy', unnamedCopy.body === 'You have a scheduled reminder.', unnamedCopy.body);

console.log('\n--- export & import backup ---');

// A small but complete snapshot exercising every entity a backup carries.
const BACKUP_STAMP = '2026-10-05T12:00:00.000Z';
const fixtureSnapshot = {
  accounts: [
    {
      id: 'acct_a',
      name: 'Cash',
      type: 'cash',
      initial_balance: 50000,
      archived: 0,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
    {
      id: 'acct_b',
      name: 'Bank',
      type: 'bank',
      initial_balance: 2500000,
      archived: 0,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
  ],
  folders: [
    {
      id: 'folder_1',
      name: 'Travel',
      color: '#0F6B4B',
      position: 0,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
    {
      id: 'folder_2',
      name: 'Business',
      color: null,
      position: 1,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
  ],
  budgets: [
    {
      id: 'bkt_1',
      name: 'October',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      color: '#FF9800',
      folder_id: 'folder_1',
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
  ],
  tags: [
    {
      id: 'tag_a',
      name: 'Groceries',
      emoji: '🛒',
      color: '#A96600',
      is_default: 0,
      archived: 0,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
    {
      id: 'tag_b',
      name: 'Rent',
      emoji: '🏠',
      color: '#0F6B4B',
      is_default: 0,
      archived: 0,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
  ],
  transactions: [
    {
      id: 'tx_1',
      budget_id: 'bkt_1',
      type: 'expense',
      amount: 10000,
      tag_id: 'tag_a',
      account_id: null,
      to_account_id: null,
      description: 'Weekly groceries',
      transaction_date: '2026-10-05',
      payment_status: 'paid',
      has_breakdown: 1,
      payment_due_date: null,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
    {
      id: 'tx_2',
      budget_id: 'bkt_1',
      type: 'expense',
      amount: 12345,
      tag_id: 'tag_b',
      account_id: null,
      to_account_id: null,
      description: 'Electric bill',
      transaction_date: '2026-10-06',
      payment_status: 'unpaid',
      has_breakdown: 0,
      payment_due_date: '2026-11-01',
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
    {
      id: 'tx_3',
      budget_id: 'bkt_1',
      type: 'income',
      amount: 4500000,
      tag_id: 'tag_b',
      account_id: null,
      to_account_id: null,
      description: 'Salary',
      transaction_date: '2026-10-07',
      payment_status: null,
      has_breakdown: 0,
      payment_due_date: null,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
    {
      id: 'tx_4',
      budget_id: 'bkt_1',
      type: 'transfer',
      amount: 100000,
      tag_id: null,
      account_id: 'acct_a',
      to_account_id: 'acct_b',
      description: 'Banked the cash',
      transaction_date: '2026-10-08',
      payment_status: null,
      has_breakdown: 0,
      payment_due_date: null,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
  ],
  subTransactions: [
    {
      id: 'sub_1',
      transaction_id: 'tx_1',
      description: 'Rice',
      amount: 6000,
      position: 0,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
      purchase_date: '2026-10-05',
      purchase_time: '08:30',
      notes: null,
    },
    {
      id: 'sub_2',
      transaction_id: 'tx_1',
      description: 'Fish',
      amount: 4000,
      position: 1,
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
      purchase_date: '2026-10-05',
      purchase_time: '09:00',
      notes: 'wet market',
    },
  ],
  reminders: [
    {
      id: 'rem_1',
      transaction_id: 'tx_2',
      enabled: 1,
      status: 'active',
      remind_date: '2026-11-01',
      remind_time: '09:00',
      remind_at: '2020-01-01T00:00:00Z',
      notification_id: 'os-old',
      notes: 'Pay the bill',
      created_at: BACKUP_STAMP,
      updated_at: BACKUP_STAMP,
    },
  ],
  settings: {
    currency: 'PHP',
    theme: 'dark',
    pinned_budgets: JSON.stringify(['bkt_1', 'ghost']),
  },
};

const backupEnvelope = serializeSnapshot(fixtureSnapshot, {
  appVersion: '1.2.3',
  createdAt: '2026-10-12T00:00:00.000Z',
});
check('a backup envelope declares its format and version', backupEnvelope.format === BACKUP_FORMAT && backupEnvelope.formatVersion === BACKUP_FORMAT_VERSION);
check(
  'the envelope carries app identity and creation time',
  backupEnvelope.app.name === 'Budgetarian' &&
    backupEnvelope.app.version === '1.2.3' &&
    backupEnvelope.createdAt === '2026-10-12T00:00:00.000Z',
);
check(
  'derived budget fields never enter the backup',
  backupEnvelope.data.budgets.every((row) => !('spent' in row) && !('income' in row)),
);

const roundTrip = parseBackupText(stringifyBackup(backupEnvelope));
check(
  'a written backup parses and validates back to itself',
  roundTrip.ok === true && roundTrip.issues === undefined,
  JSON.stringify(roundTrip.issues ?? roundTrip.warnings),
);
check(
  'the round trip reports preview counts',
  roundTrip.ok &&
    roundTrip.counts.folders === 2 &&
    roundTrip.counts.budgets === 1 &&
    roundTrip.counts.transactions === 4 &&
    roundTrip.counts.breakdownTransactions === 1 &&
    roundTrip.counts.breakdownItems === 2 &&
    roundTrip.counts.reminders === 1 &&
    roundTrip.counts.activeReminders === 1 &&
    roundTrip.counts.settingsKeys === 3,
  JSON.stringify(roundTrip.counts),
);
check(
  'the round trip preserves the envelope metadata for the preview',
  roundTrip.ok && roundTrip.createdAt === '2026-10-12T00:00:00.000Z' && roundTrip.appVersion === '1.2.3',
);
check(
  'pinned budgets are filtered to existing ones during validation',
  roundTrip.ok && roundTrip.data.settings.pinned_budgets === JSON.stringify(['bkt_1']),
  roundTrip.data?.settings?.pinned_budgets,
);
check(
  'orphan pins produce a warning',
  roundTrip.warnings.some((w) => w.includes('unknown budget')),
  JSON.stringify(roundTrip.warnings),
);
check(
  'the round trip preserves folder rows and budget folder references',
  roundTrip.ok &&
    roundTrip.data.folders.length === 2 &&
    roundTrip.data.folders[0].name === 'Travel' &&
    roundTrip.data.folders[1].name === 'Business' &&
    roundTrip.data.budgets[0].folder_id === 'folder_1',
  JSON.stringify(roundTrip.data?.folders),
);
const noFolders = dataClone((d) => delete d.folders);
check(
  'a backup without the folders section imports with a compat warning',
  noFolders.ok === true &&
    noFolders.data.folders.length === 0 &&
    noFolders.warnings.some((w) => w.includes('predates budget folders')) &&
    // Its budgets referenced a folder that is no longer known: ungrouped.
    noFolders.data.budgets[0].folder_id === null,
  JSON.stringify(noFolders.warnings ?? noFolders.issues),
);
const orphanFolder = dataClone((d) => {
  d.folders = [{ ...d.folders[0], id: 'other_folder' }];
});
check(
  'a budget pointing at a missing folder is left ungrouped with a warning',
  orphanFolder.ok === true &&
    orphanFolder.data.budgets[0].folder_id === null &&
    orphanFolder.warnings.some((w) => w.includes('folder_1') && w.includes('left ungrouped')),
  JSON.stringify(orphanFolder.warnings ?? orphanFolder.issues),
);
const dupFolderId = dataClone((d) => d.folders.push({ ...d.folders[0] }));
check(
  'duplicate folder ids are rejected',
  dupFolderId.ok === false && dupFolderId.issues.some((i) => i.includes('budget folder')),
  JSON.stringify(dupFolderId.issues),
);
const junkFolderPosition = dataClone((d) => {
  d.folders[0].position = 'top';
});
check(
  'a non-numeric folder position repairs to 0 with a warning',
  junkFolderPosition.ok === true &&
    junkFolderPosition.data.folders[0].position === 0 &&
    junkFolderPosition.warnings.some((w) => w.includes('position')),
  JSON.stringify(junkFolderPosition.warnings ?? junkFolderPosition.issues),
);
check(
  'backup file names follow the dated convention',
  buildBackupFileName('2026-10-12') === 'Budgetarian-Backup-2026-10-12.json' &&
    buildBackupFileName('2026-10-12', '-Recovery') === 'Budgetarian-Backup-Recovery-2026-10-12.json',
);

// ---- rejection of anything that is not a usable backup -------------------
const rejectEmpty = parseBackupText('   ');
check('an empty file is rejected', rejectEmpty.ok === false && rejectEmpty.issues[0] === 'The file is empty.');
const rejectJson = parseBackupText('this is { not json');
check('a non-JSON file is rejected with a clear reason', rejectJson.ok === false && rejectJson.issues[0].includes('not valid JSON'));
const rejectFormat = validateBackup({ ...backupEnvelope, format: 'somebody-elses-file' });
check(
  'a foreign format id is rejected and quotes what was found',
  rejectFormat.ok === false && rejectFormat.issues[0].includes('somebody-elses-file'),
);
const rejectFuture = validateBackup({ ...backupEnvelope, formatVersion: 99 });
check(
  'a future backup version is rejected with an upgrade hint',
  rejectFuture.ok === false &&
    rejectFuture.issues[0].includes('newer version of Budgetarian') &&
    rejectFuture.issues[0].includes('v99'),
  JSON.stringify(rejectFuture.issues),
);
const rejectVersionJunk = validateBackup({ ...backupEnvelope, formatVersion: 'x' });
check('a non-numeric version is rejected', rejectVersionJunk.ok === false && rejectVersionJunk.issues[0].includes('unreadable'));
const rejectNoData = validateBackup({ format: BACKUP_FORMAT, formatVersion: 1 });
check('a backup without a data section is rejected', rejectNoData.ok === false && rejectNoData.issues[0].includes('no data section'));

function dataClone(mutate) {
  const clone = structuredClone(backupEnvelope);
  mutate(clone.data);
  return validateBackup(clone, { nowStamp: '2026-10-06T00:00:00.000Z' });
}
const dupId = dataClone((d) => d.budgets.push({ ...d.budgets[0] }));
check('duplicate ids are rejected', dupId.ok === false && dupId.issues.some((i) => i.includes('duplicate id')));
const badRef = dataClone((d) => (d.transactions[0].budget_id = 'nope'));
check(
  'a transaction referencing a missing budget is rejected',
  badRef.ok === false && badRef.issues.some((i) => i.includes('references budget "nope"')),
  JSON.stringify(badRef.issues),
);
const negAmount = dataClone((d) => (d.transactions[1].amount = -5));
check('negative amounts are rejected', negAmount.ok === false && negAmount.issues.some((i) => i.includes('invalid amount')));
const zeroAmount = dataClone((d) => (d.transactions[1].amount = 0));
check('a zero amount on a plain transaction is rejected', zeroAmount.ok === false && zeroAmount.issues.some((i) => i.includes('invalid amount')));
const badTotal = dataClone((d) => (d.subTransactions[1].amount = 1000));
check(
  'a breakdown whose items do not sum to the parent is rejected by name',
  badTotal.ok === false &&
    badTotal.issues.some((i) => i.includes('Weekly groceries') && i.includes('total 7000')),
  JSON.stringify(badTotal.issues),
);
const oneAccountTransfer = dataClone((d) => (d.transactions[3].to_account_id = d.transactions[3].account_id));
check(
  'a transfer to the same account is rejected',
  oneAccountTransfer.ok === false && oneAccountTransfer.issues.some((i) => i.includes('transfer')),
);
const transferNoAccounts = dataClone((d) => {
  d.transactions[3].account_id = null;
  d.transactions[3].to_account_id = null;
});
check(
  'a transfer without two accounts is rejected',
  transferNoAccounts.ok === false &&
    transferNoAccounts.issues.some((i) => i.includes('transfer without two different known accounts')),
);
const badReminderRef = dataClone((d) => (d.reminders[0].transaction_id = 'tx_missing'));
check(
  'a reminder referencing a missing transaction is rejected',
  badReminderRef.ok === false && badReminderRef.issues.some((i) => i.includes('not in the backup')),
);
const badDate = dataClone((d) => (d.budgets[0].start_date = 'Oct 1'));
check('a non-ISO calendar date is rejected', badDate.ok === false && badDate.issues.some((i) => i.includes('invalid start date')));
const dupTagNames = dataClone((d) => d.tags.push({ ...d.tags[0], id: 'tag_c' }));
check('two tags sharing one name are rejected', dupTagNames.ok === false && dupTagNames.issues.some((i) => i.includes('share the name')));

// ---- legacy backups without breakdown items ------------------------------
const legacy = structuredClone(backupEnvelope);
delete legacy.data.subTransactions;
legacy.data.transactions.forEach((tx) => (tx.has_breakdown = tx.id === 'tx_1' ? 1 : tx.has_breakdown));
const legacyResult = validateBackup(legacy);
check(
  'a legacy backup without the breakdown section still imports',
  legacyResult.ok === true && legacyResult.warnings.some((w) => w.includes('breakdown items')),
  JSON.stringify(legacyResult.issues ?? legacyResult.warnings),
);
check(
  'a breakdown flag with no items is cleared instead of failing',
  legacyResult.ok === true &&
    legacyResult.data.transactions.find((t) => t.id === 'tx_1').has_breakdown === 0 &&
    legacyResult.warnings.some((w) => w.includes('flag was cleared')),
);
const noSettings = structuredClone(backupEnvelope);
delete noSettings.data.settings;
const noSettingsResult = validateBackup(noSettings);
check(
  'a backup with no settings section imports with a warning',
  noSettingsResult.ok === true && noSettingsResult.warnings.some((w) => w.includes('no settings section')),
);

// ---- gentle coercion of repairable problems --------------------------------
const repaired = dataClone((d) => {
  d.budgets[0].color = 'not-a-colour';
  d.budgets[0].created_at = 'yesterday-ish';
  d.transactions[1].payment_status = null;
  d.transactions[2].payment_status = 'unpaid';
  delete d.reminders[0].remind_at;
  d.reminders[0].notification_id = 'stale-from-old-phone';
  d.settings.currency = 'ZZZ';
  d.settings.theme = 'hotdog';
  d.settings.pinned_budgets = 'not json at all';
});
check(
  'an invalid colour falls back to the theme default',
  repaired.ok === true && repaired.data.budgets[0].color === null,
  JSON.stringify(repaired.issues ?? repaired.warnings),
);
check(
  'an unreadable timestamp is replaced with the validation stamp',
  repaired.ok === true && repaired.data.budgets[0].created_at === '2026-10-06T00:00:00.000Z',
);
check(
  'a missing status on an expense defaults to paid',
  repaired.ok === true && repaired.data.transactions[1].payment_status === 'paid',
);
check(
  'a status on an income is cleared',
  repaired.ok === true && repaired.data.transactions[2].payment_status === null,
);
check(
  'remind_at is rebuilt from the local date and time on this device',
  repaired.ok === true &&
    repaired.data.reminders[0].remind_at === buildRemindAt('2026-11-01', '09:00'),
);
check(
  'notification ids from another install are cleared for resync',
  repaired.ok === true && repaired.data.reminders[0].notification_id === null,
);
check(
  'unknown currency, theme and unreadable pins are dropped with warnings',
  repaired.ok === true &&
    !('currency' in repaired.data.settings) &&
    !('theme' in repaired.data.settings) &&
    !('pinned_budgets' in repaired.data.settings) &&
    repaired.warnings.filter((w) => w.includes('dropped') || w.includes('unreadable')).length >= 3,
  JSON.stringify(repaired.warnings),
);

// ---- merge planning ---------------------------------------------------------
const currentData = structuredClone(fixtureSnapshot);
currentData.budgets[0].name = 'October (my edits)';
currentData.folders[0].name = 'Travel (my edits)';
// Local edits that keep the breakdown total consistent (5500 + 4500 = 10000)
// but differ from the backup's items (6000 + 4000).
currentData.subTransactions[0].amount = 5500;
currentData.subTransactions[1].amount = 4500;
currentData.subTransactions[1].description = 'Milk';
currentData.transactions = currentData.transactions.filter((t) => t.id !== 'tx_3' && t.id !== 'tx_4');
currentData.reminders = [];
currentData.settings = { currency: 'PHP', theme: 'dark' };

const mergePlan = buildMergePlan(roundTrip.data, currentData);
const conflictKeys = mergePlan.groups.filter((g) => g.state === 'conflict').map((g) => g.key);
check(
  'the merge spots changed rows as conflicts with a safe default',
  conflictKeys.includes('budgets:bkt_1') &&
    conflictKeys.includes('folders:folder_1') &&
    conflictKeys.includes('transactions:tx_1') &&
    mergePlan.groups.find((g) => g.key === 'budgets:bkt_1').resolution === 'keep',
  JSON.stringify(conflictKeys),
);
check(
  'identical rows are recognised and never written',
  mergePlan.groups.some((g) => g.key === 'tags:tag_a' && g.state === 'identical') &&
    mergePlan.groups.some((g) => g.key === 'accounts:acct_a' && g.state === 'identical') &&
    mergePlan.groups.some((g) => g.key === 'settings:currency' && g.state === 'identical'),
);
check(
  'rows only in the backup are planned as new',
  mergePlan.groups.some((g) => g.key === 'transactions:tx_3' && g.state === 'new') &&
    mergePlan.groups.some((g) => g.key === 'reminders:rem_1' && g.state === 'new'),
);
const txGroup = mergePlan.groups.find((g) => g.key === 'transactions:tx_1');
check(
  'a transaction and its breakdown items form ONE conflict group',
  txGroup.state === 'conflict' && txGroup.items.length === 2 && txGroup.existingItems.length === 2,
);
const decidedPlan = resolveGroup(
  resolveGroup(
    resolveGroup(mergePlan, 'budgets:bkt_1', 'replace'),
    'folders:folder_1',
    'replace',
  ),
  'transactions:tx_1',
  'replace',
);
check(
  'resolving a conflict switches the plan without touching other groups',
  decidedPlan.groups.find((g) => g.key === 'budgets:bkt_1').resolution === 'replace' &&
    decidedPlan.groups.find((g) => g.key === 'settings:currency').resolution === null,
);
check(
  'an undecided conflict keeps existing data by default',
  mergePlan.groups
    .filter((g) => g.state === 'conflict')
    .every((g) => g.resolution === 'keep'),
);

const mergeWrites = compileMergeWrites(decidedPlan);
const opNames = mergeWrites.map((w) => w.op);
check(
  'the merge writes parents before the rows that reference them',
  opNames.indexOf('replaceBudget') !== -1 &&
    opNames.indexOf('replaceBudget') < opNames.findIndex((op) => op.includes('Transaction')),
  JSON.stringify(opNames),
);
check(
  'folder rows are written before the budgets that reference them',
  opNames.indexOf('replaceFolder') !== -1 &&
    opNames.indexOf('replaceFolder') < opNames.indexOf('replaceBudget'),
  JSON.stringify(opNames),
);
check(
  'replacing a breakdown transaction swaps its items without deleting the parent',
  opNames.includes('replaceTransaction') &&
    opNames.includes('clearSubTransactions') &&
    opNames.filter((op) => op === 'insertSubTransaction').length === 2 &&
    !opNames.some((op) => op === 'deleteTransaction'),
  JSON.stringify(opNames),
);
check(
  'identical rows produce no writes at all',
  !opNames.includes('insertTag') && !opNames.includes('replaceTag') && !opNames.includes('insertAccount'),
  JSON.stringify(opNames),
);

const projection = projectMergeResult(currentData, mergeWrites);
check(
  'the projected merge result validates cleanly',
  projection.issues.length === 0,
  JSON.stringify(projection.issues),
);
check(
  'the projection applies replaces and adds news without losing anything',
  projection.data.budgets.find((b) => b.id === 'bkt_1').name === 'October' &&
    projection.data.transactions.length === 4 &&
    computeBreakdownTotal(
      projection.data.subTransactions.filter((i) => i.transaction_id === 'tx_1'),
    ) === 10000,
);
const keepPlan = mergePlan; // conflicts stay 'keep'
const keepWrites = compileMergeWrites(keepPlan);
const keepProjection = projectMergeResult(currentData, keepWrites);
check(
  'keeping all conflicts only adds the new rows',
  keepProjection.issues.length === 0 &&
    keepProjection.data.budgets.find((b) => b.id === 'bkt_1').name === 'October (my edits)' &&
    keepProjection.data.transactions.length === 4 &&
    keepWrites.every((w) => w.op.startsWith('insert') || w.op === 'setSetting'),
  JSON.stringify(keepWrites.map((w) => w.op)),
);
const poisoned = projectMergeResult(currentData, [
  { op: 'insertTransaction', row: { ...fixtureSnapshot.transactions[0], id: 'tx_ghost', budget_id: 'nowhere' } },
]);
check(
  'a merge that would create invalid data is refused before any write',
  poisoned.issues.length > 0 && poisoned.issues.some((i) => i.includes('nowhere')),
  JSON.stringify(poisoned.issues),
);

// ---- restore + merge execution parity across engines -----------------------
async function restoreVia(store, data) {
  await store.beginTransaction();
  try {
    await store.clearAllData();
    for (const row of data.accounts) await store.insertAccount(row);
    for (const row of data.folders) await store.insertFolder(row);
    for (const row of data.budgets) await store.insertBudget(row);
    for (const row of data.tags) await store.insertTag(row);
    for (const row of data.transactions) await store.insertTransaction(row);
    for (const row of data.subTransactions) await store.insertSubTransaction(row);
    for (const row of data.reminders) await store.insertReminder(row);
    for (const [key, value] of Object.entries(data.settings)) await store.setSetting(key, value);
    await store.commitTransaction();
  } catch (error) {
    await store.rollbackTransaction();
    throw error;
  }
}

async function applyWrites(store, writes) {
  await store.beginTransaction();
  try {
    for (const write of writes) {
      switch (write.op) {
        case 'insertAccount':
          await store.insertAccount(write.row);
          break;
        case 'replaceAccount':
          await store.replaceAccount(write.row);
          break;
        case 'insertFolder':
          await store.insertFolder(write.row);
          break;
        case 'replaceFolder':
          await store.replaceFolder(write.row);
          break;
        case 'insertBudget':
          await store.insertBudget(write.row);
          break;
        case 'replaceBudget':
          await store.replaceBudget(write.row);
          break;
        case 'insertTag':
          await store.insertTag(write.row);
          break;
        case 'replaceTag':
          await store.replaceTag(write.row);
          break;
        case 'insertTransaction':
          await store.insertTransaction(write.row);
          break;
        case 'replaceTransaction':
          await store.replaceTransaction(write.row);
          break;
        case 'clearSubTransactions':
          await store.deleteSubTransactionsForParent(write.transactionId);
          break;
        case 'insertSubTransaction':
          await store.insertSubTransaction(write.row);
          break;
        case 'insertReminder':
          await store.insertReminder(write.row);
          break;
        case 'replaceReminder':
          await store.replaceReminder(write.row);
          break;
        case 'setSetting':
          await store.setSetting(write.key, write.value);
          break;
        default:
          throw new Error(`Unknown write op "${write.op}"`);
      }
    }
    await store.commitTransaction();
  } catch (error) {
    await store.rollbackTransaction();
    throw error;
  }
}

async function readEverything(store) {
  const budgets = await store.listBudgets();
  const transactions = [];
  const subTransactions = [];
  for (const budget of budgets) {
    transactions.push(...(await store.listTransactionsByBudget(budget.id)));
    subTransactions.push(...(await store.listSubTransactionsByBudget(budget.id)));
  }
  return stable({
    accounts: await store.listAccounts(),
    folders: await store.listFolders(),
    budgets,
    tags: await store.listTags({ includeArchived: true }),
    transactions,
    subTransactions,
    reminders: await store.listReminders(),
    settings: await store.getAllSettings(),
  });
}

// `adapter` holds the migrated sqlite tables, emptied by the parity wipe above.
const restoreSqlite = createSqliteAdapter(async () => adapter);
const restoreMemory = createMemoryAdapter();
const restoredData = roundTrip.data;
await restoreVia(restoreSqlite, restoredData);
await restoreVia(restoreMemory, restoredData);
const restoredSqliteJson = JSON.stringify(await readEverything(restoreSqlite));
const restoredMemoryJson = JSON.stringify(await readEverything(restoreMemory));
check(
  'a full restore lands identically on both engines',
  restoredSqliteJson === restoredMemoryJson,
  restoredSqliteJson === restoredMemoryJson ? '' : `\n--- sqlite ---\n${restoredSqliteJson}\n--- memory ---\n${restoredMemoryJson}`,
);
{
  const after = await readEverything(restoreSqlite);
  check(
    'the restore brings back every entity',
    after.budgets.length === 1 &&
      after.budgets[0].name === 'October' &&
      after.folders.length === 2 &&
      after.budgets[0].folder_id === 'folder_1' &&
      after.tags.length === 2 &&
      after.transactions.length === 4 &&
      after.subTransactions.length === 2 &&
      after.reminders.length === 1 &&
      after.accounts.length === 2,
    JSON.stringify({
      budgets: after.budgets.length,
      tags: after.tags.length,
      transactions: after.transactions.length,
      subs: after.subTransactions.length,
      reminders: after.reminders.length,
      accounts: after.accounts.length,
    }),
  );
  check(
    'settings survive a restore exactly as validated',
    after.settings.currency === 'PHP' &&
      after.settings.theme === 'dark' &&
      after.settings.pinned_budgets === JSON.stringify(['bkt_1']),
    JSON.stringify(after.settings),
  );
  check(
    'a restored reminder keeps its schedule fields',
    after.reminders[0].enabled === 1 &&
      after.reminders[0].status === 'active' &&
      after.reminders[0].remind_at === buildRemindAt('2026-11-01', '09:00') &&
      after.reminders[0].notification_id === null,
    JSON.stringify(after.reminders[0]),
  );
  check(
    'the restored budget keeps its derived totals correct',
    after.budgets[0].income === 4500000 && after.budgets[0].spent === 22345,
    JSON.stringify({ income: after.budgets[0].income, spent: after.budgets[0].spent }),
  );
}

// Now replay a merge onto the restored data: current state == restored, the
// incoming backup carries edits (rename the budget, change one item) plus a
// brand-new transaction.
const incomingMerge = structuredClone(restoredData);
incomingMerge.budgets[0].name = 'October — from the file';
incomingMerge.subTransactions[0].amount = 5500;
incomingMerge.subTransactions[1].amount = 4500;
incomingMerge.transactions = incomingMerge.transactions.filter((t) => t.id !== 'tx_4');
const mergePlan2 = buildMergePlan(incomingMerge, {
  ...restoredData,
  transactions: restoredData.transactions.filter((t) => t.id !== 'tx_4'),
});
const conflictKeys2 = mergePlan2.groups.filter((g) => g.state === 'conflict').map((g) => g.key);
check(
  'a merge against restored data sees only real differences as conflicts',
  conflictKeys2.includes('budgets:bkt_1') && conflictKeys2.includes('transactions:tx_1'),
  JSON.stringify(conflictKeys2),
);
const decidedMerge2 = resolveGroup(resolveGroup(mergePlan2, 'budgets:bkt_1', 'replace'), 'transactions:tx_1', 'replace');
const mergeWrites2 = compileMergeWrites(decidedMerge2);
const projected2 = projectMergeResult(
  { ...restoredData, transactions: restoredData.transactions.filter((t) => t.id !== 'tx_4') },
  mergeWrites2,
);
check(
  'the second merge projects validly',
  projected2.issues.length === 0,
  JSON.stringify(projected2.issues),
);
// Rebuild the "current" state the projection assumed on both engines.
await restoreVia(restoreSqlite, { ...restoredData, transactions: restoredData.transactions.filter((t) => t.id !== 'tx_4') });
await restoreVia(restoreMemory, { ...restoredData, transactions: restoredData.transactions.filter((t) => t.id !== 'tx_4') });
await applyWrites(restoreSqlite, mergeWrites2);
await applyWrites(restoreMemory, mergeWrites2);
const mergedSqlite = await readEverything(restoreSqlite);
const mergedMemory = await readEverything(restoreMemory);
check(
  'an applied merge produces the same database on both engines',
  JSON.stringify(mergedSqlite) === JSON.stringify(mergedMemory),
  JSON.stringify(mergedSqlite) === JSON.stringify(mergedMemory)
    ? ''
    : `\n--- sqlite ---\n${JSON.stringify(mergedSqlite)}\n--- memory ---\n${JSON.stringify(mergedMemory)}`,
);
check(
  'the merged database shows replaced rows and preserved links',
  mergedSqlite.budgets[0].name === 'October — from the file' &&
    mergedSqlite.reminders.length === 1 &&
    mergedSqlite.reminders[0].transaction_id === 'tx_2' &&
    computeBreakdownTotal(mergedSqlite.subTransactions) === 10000,
  JSON.stringify({
    name: mergedSqlite.budgets[0].name,
    reminders: mergedSqlite.reminders.length,
    total: computeBreakdownTotal(mergedSqlite.subTransactions),
  }),
);
check(
  'the projected merge matches what was actually written',
  JSON.stringify(stable(projected2.data.settings)) === JSON.stringify(stable(mergedSqlite.settings)),
);

console.log('\n--- sqlite serialization regression ---');

// Regression guard for the budget-detail crash: expo-sqlite's async calls run
// on a thread pool and only lock per statement, so overlapping queries on the
// shared connection could race prepare/step/finalize ("prepareAsync ...
// Cannot use shared object that was already released"). The adapter must
// serialize every operation so no two ever overlap.
{
  let inFlight = 0;
  let maxInFlight = 0;
  const fakeDb = {
    async getAllAsync() {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return [];
    },
    async getFirstAsync() {
      return fakeDb.getAllAsync();
    },
    async runAsync() {
      await fakeDb.getAllAsync();
      return { changes: 0 };
    },
  };
  const serialized = createSqliteAdapter(async () => fakeDb);

  // Fan out several reads at once, exactly like the budget screen's Promise.all.
  await Promise.all([
    serialized.getBudget('b1'),
    serialized.listTags(),
    serialized.listTransactionsByBudget('b1'),
    serialized.listReminders(),
    serialized.getSchemaVersion(),
  ]);
  check('sqlite adapter serializes concurrent reads (max 1 in flight)', maxInFlight === 1, String(maxInFlight));

  // A failing operation must reject its caller but not wedge the queue.
  let shouldThrow = true;
  const flakyDb = {
    async getAllAsync() {
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error('boom');
      }
      return [];
    },
    async getFirstAsync() {
      return { ok: true };
    },
    async runAsync() {
      return { changes: 0 };
    },
  };
  const recovering = createSqliteAdapter(async () => flakyDb);
  let firstThrew = false;
  try {
    await recovering.listBudgets();
  } catch {
    firstThrew = true;
  }
  const after = await recovering.listBudgets();
  check('a failed sqlite operation rejects its caller', firstThrew);
  check('the sqlite queue keeps working after a failure', Array.isArray(after), JSON.stringify(after));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);