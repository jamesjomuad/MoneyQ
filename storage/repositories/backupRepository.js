/**
 * Data access for backups: read a whole-database snapshot, replace
 * everything (full restore), or apply a decided merge plan. All writes run
 * inside one adapter transaction, so a failure part-way through leaves the
 * previous data intact on both engines.
 */

import { storage } from '../adapters/adapter';

/** Every table + settings, in the shape utils/backup serializes. */
export async function readSnapshot(store = storage) {
  const accounts = await store.listAccounts();
  const folders = await store.listFolders();
  // Archived budgets must round-trip: their transactions are exported too.
  const budgets = await store.listBudgets({ includeArchived: true });
  const tags = await store.listTags({ includeArchived: true });
  const transactions = [];
  const subTransactions = [];
  for (const budget of budgets) {
    const rows = await store.listTransactionsByBudget(budget.id);
    transactions.push(...rows);
    const items = await store.listSubTransactionsByBudget(budget.id);
    subTransactions.push(...items);
  }
  const reminders = await store.listReminders();
  const settings = await store.getAllSettings();
  return { accounts, folders, budgets, tags, transactions, subTransactions, reminders, settings };
}

/**
 * Replace every table with the validated backup rows. `data` comes from
 * utils/backup.validateBackup, so ids, refs and shapes are already checked;
 * dependency order is enforced here (parents before children).
 */
export async function restoreAll(data, store = storage) {
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
    for (const [key, value] of Object.entries(data.settings)) {
      await store.setSetting(key, value);
    }
    await store.commitTransaction();
  } catch (error) {
    await store.rollbackTransaction();
    throw error;
  }
}

/** Apply the ordered writes compiled from a merge plan, atomically. */
export async function applyMerge(writes, store = storage) {
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
          throw new Error(`Unknown merge operation "${write.op}".`);
      }
    }
    await store.commitTransaction();
  } catch (error) {
    await store.rollbackTransaction();
    throw error;
  }
}
