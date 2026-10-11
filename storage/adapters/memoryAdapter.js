/**
 * In-memory implementation of the storage interface.
 *
 * Used by the web build so Expo Go stays the real target while the browser
 * becomes a useful UI/UX harness: no worker, no wasm, no persistence. Every
 * method mirrors the SQLite adapter's behaviour for the operations the app
 * actually performs, so repositories and stores stay completely unaware of
 * which engine they are talking to.
 */

import { DEFAULT_TAGS } from '../../constants/finance';
import { createId, nowIso } from '../../utils/id';
import { suggestBudgetDates, toIsoDate, addDaysIso } from '../../utils/dates';
import { buildRemindAt } from '../../utils/reminders';
import { LATEST_VERSION } from '../database/migrations';

export function createMemoryAdapter({ seedDemo = false } = {}) {
  const store = {
    budgets: [],
    tags: [],
    transactions: [],
    reminders: [],
    settings: new Map(),
  };

  const timestamp = nowIso();
  seedDefaultTags(store, timestamp);
  if (seedDemo) seedDemoData(store, timestamp);

  const copy = (row) => (row ? { ...row } : null);

  /** SQLite's `ORDER BY start_date DESC, created_at DESC`. */
  const byBudgetPeriod = (a, b) =>
    b.start_date.localeCompare(a.start_date) || b.created_at.localeCompare(a.created_at);

  /** SQLite's `ORDER BY transaction_date DESC, created_at DESC`. */
  const byTransactionDate = (a, b) =>
    b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at);

  /** SQLite's `ORDER BY name COLLATE NOCASE ASC`. */
  const byTagName = (a, b) => {
    const left = a.name.toLowerCase();
    const right = b.name.toLowerCase();
    return left < right ? -1 : left > right ? 1 : 0;
  };

  return {
    source: 'memory',

    async getSchemaVersion() {
      return LATEST_VERSION;
    },

    // --- budgets -------------------------------------------------------

    async listBudgets() {
      return [...store.budgets]
        .sort(byBudgetPeriod)
        .map((budget) => {
          let spent = 0;
          let income = 0;
          let transactionCount = 0;
          for (const transaction of store.transactions) {
            if (transaction.budget_id !== budget.id) continue;
            transactionCount += 1;
            if (transaction.type === 'expense') spent += transaction.amount;
            else if (transaction.type === 'income') income += transaction.amount;
          }
          return { ...budget, spent, income, transaction_count: transactionCount };
        });
    },

    async getBudget(id) {
      return copy(store.budgets.find((budget) => budget.id === id) ?? null);
    },

    async insertBudget(row) {
      // Mirror the SQLite schema: `color` always exists on the row (NULL when
      // the budget keeps the theme-driven folder colors).
      store.budgets.push({ color: null, ...row });
    },

    async updateBudget(row) {
      const index = store.budgets.findIndex((budget) => budget.id === row.id);
      if (index >= 0) store.budgets[index] = { ...store.budgets[index], ...row };
    },

    /**
     * Cascades to the budget's transactions through the foreign key; their
     * reminders are only unlinked (`ON DELETE SET NULL`), not deleted — the
     * app layer calls deleteRemindersForBudget when a budget is removed.
     */
    async deleteBudget(id) {
      const before = store.budgets.length;
      store.budgets = store.budgets.filter((budget) => budget.id !== id);
      const removed = before - store.budgets.length;
      const doomed = new Set(
        store.transactions.filter((transaction) => transaction.budget_id === id).map((t) => t.id),
      );
      store.transactions = store.transactions.filter(
        (transaction) => transaction.budget_id !== id,
      );
      for (const reminder of store.reminders) {
        if (doomed.has(reminder.transaction_id)) reminder.transaction_id = null;
      }
      return removed;
    },

    // --- tags ----------------------------------------------------------

    async listTags({ includeArchived = false } = {}) {
      return store.tags
        .filter((tag) => includeArchived || tag.archived === 0)
        .sort(byTagName)
        .map(copy);
    },

    async getTag(id) {
      return copy(store.tags.find((tag) => tag.id === id) ?? null);
    },

    /** Pass `exceptId` to ignore one row — used by the uniqueness check on edit. */
    async findTagByName(name, exceptId = null) {
      return copy(store.tags.find((tag) => tag.name === name && tag.id !== exceptId) ?? null);
    },

    async insertTag(row) {
      store.tags.push({ ...row });
    },

    async updateTag(row) {
      const index = store.tags.findIndex((tag) => tag.id === row.id);
      if (index >= 0) store.tags[index] = { ...store.tags[index], ...row };
    },

    /** Mirrors `ON DELETE SET NULL`: transactions keep their amount. */
    async deleteTag(id) {
      const before = store.tags.length;
      store.tags = store.tags.filter((tag) => tag.id !== id);
      const removed = before - store.tags.length;
      for (const transaction of store.transactions) {
        if (transaction.tag_id === id) transaction.tag_id = null;
      }
      return removed;
    },

    async countTransactionsUsingTag(tagId) {
      return store.transactions.filter((transaction) => transaction.tag_id === tagId).length;
    },

    // --- transactions --------------------------------------------------

    async listTransactionsByBudget(budgetId) {
      return store.transactions
        .filter((transaction) => transaction.budget_id === budgetId)
        .sort(byTransactionDate)
        .map(copy);
    },

    async listTransactionsInRange(startIso, endIso) {
      return store.transactions
        .filter(
          (transaction) =>
            transaction.transaction_date >= startIso &&
            transaction.transaction_date <= endIso,
        )
        .sort(byTransactionDate)
        .map(copy);
    },

    /** SQLite's case-insensitive description-or-tag-name search, wildcards literal. */
    async searchTransactions(term, limit) {
      const needle = String(term).toLowerCase();
      const tagById = new Map(store.tags.map((tag) => [tag.id, tag]));
      const budgetById = new Map(store.budgets.map((budget) => [budget.id, budget]));
      return store.transactions
        .filter((transaction) => {
          const inDescription = (transaction.description ?? '')
            .toLowerCase()
            .includes(needle);
          const tag = tagById.get(transaction.tag_id);
          const inTag = tag ? tag.name.toLowerCase().includes(needle) : false;
          return inDescription || inTag;
        })
        .sort(byTransactionDate)
        .slice(0, limit)
        .map((transaction) => {
          const tag = tagById.get(transaction.tag_id) ?? null;
          return copy({
            ...transaction,
            tag_name: tag?.name ?? null,
            tag_emoji: tag?.emoji ?? null,
            tag_color: tag?.color ?? null,
            budget_name: budgetById.get(transaction.budget_id)?.name ?? null,
          });
        });
    },

    async getTransaction(id) {
      return copy(store.transactions.find((transaction) => transaction.id === id) ?? null);
    },

    async insertTransaction(row) {
      store.transactions.push({ ...row, payment_status: row.payment_status ?? null });
    },

    async updateTransaction(row) {
      const existing = store.transactions.find((transaction) => transaction.id === row.id);
      if (!existing) return 0;
      existing.type = row.type;
      existing.amount = row.amount;
      existing.tag_id = row.tag_id ?? null;
      existing.description = row.description ?? null;
      existing.transaction_date = row.transaction_date;
      existing.payment_status = row.payment_status ?? null;
      existing.updated_at = row.updated_at;
      return 1;
    },

    /**
     * Mirrors `ON DELETE SET NULL` on reminders: the transaction goes, the
     * reminder survives as a standalone record.
     */
    async deleteTransaction(id) {
      const before = store.transactions.length;
      store.transactions = store.transactions.filter((transaction) => transaction.id !== id);
      for (const reminder of store.reminders) {
        if (reminder.transaction_id === id) reminder.transaction_id = null;
      }
      return before - store.transactions.length;
    },

    // --- reminders -----------------------------------------------------

    /**
     * Same projection as the SQLite LEFT JOIN: reminder row + transaction
     * fields, or NULL transaction fields for a standalone reminder.
     */
    async listReminders() {
      return store.reminders
        .map((reminder) => {
          const transaction = reminder.transaction_id
            ? store.transactions.find((tx) => tx.id === reminder.transaction_id)
            : null;
          return {
            ...reminder,
            budget_id: transaction?.budget_id ?? null,
            amount: transaction?.amount ?? null,
            description: transaction?.description ?? null,
            transaction_date: transaction?.transaction_date ?? null,
          };
        })
        .sort((a, b) => a.remind_at.localeCompare(b.remind_at));
    },

    async getReminder(id) {
      return copy(store.reminders.find((reminder) => reminder.id === id) ?? null);
    },

    /** The oldest reminder linked to a transaction, if any. */
    async getReminderByTransaction(transactionId) {
      if (transactionId == null) return null;
      return copy(
        [...store.reminders]
          .filter((reminder) => reminder.transaction_id === transactionId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0] ??
          null,
      );
    },

    async insertReminder(row) {
      store.reminders.push({ ...row, status: row.status ?? 'active', notes: row.notes ?? '' });
    },

    async updateReminder(row) {
      const index = store.reminders.findIndex((reminder) => reminder.id === row.id);
      if (index < 0) return 0;
      const existing = store.reminders[index];
      // notes and status mirror SQLite's COALESCE: an omitted or null value
      // keeps what the row already holds, so notification-id bookkeeping can
      // never blank either one.
      store.reminders[index] = {
        ...existing,
        ...row,
        status: row.status == null ? existing.status : row.status,
        notes: row.notes == null ? existing.notes : row.notes,
      };
      return 1;
    },

    async deleteReminder(id) {
      const before = store.reminders.length;
      store.reminders = store.reminders.filter((reminder) => reminder.id !== id);
      return before - store.reminders.length;
    },

    /** Mirrors the subquery DELETE used before a budget is removed. */
    async deleteRemindersForBudget(budgetId) {
      const doomed = new Set(
        store.transactions
          .filter((transaction) => transaction.budget_id === budgetId)
          .map((t) => t.id),
      );
      const before = store.reminders.length;
      store.reminders = store.reminders.filter(
        (reminder) => !doomed.has(reminder.transaction_id),
      );
      return before - store.reminders.length;
    },

    // --- settings ------------------------------------------------------

    async getSetting(key, fallback = null) {
      return store.settings.has(key) ? store.settings.get(key) : fallback;
    },

    async setSetting(key, value) {
      store.settings.set(key, String(value));
    },

    async getAllSettings() {
      return Object.fromEntries(store.settings);
    },
  };
}

/** Same six rows the SQLite migration seeds, via the same constant. */
function seedDefaultTags(store, timestamp) {
  for (const tag of DEFAULT_TAGS) {
    const id = `default_${tag.key}`;
    if (store.tags.some((existing) => existing.id === id)) continue;
    store.tags.push({
      id,
      name: tag.name,
      emoji: tag.emoji,
      color: tag.color,
      is_default: 1,
      archived: 0,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }
}

/**
 * Web-only sample data so every screen renders populated during visual
 * testing. Native installs start empty and are never touched by this.
 */
function seedDemoData(store, timestamp) {
  if (store.budgets.length > 0) return;

  const current = suggestBudgetDates(0);
  const previous = suggestBudgetDates(-1);
  const today = toIsoDate(new Date());

  const budgets = [
    { id: 'demo_budget_current', ...current },
    { id: 'demo_budget_previous', ...previous },
  ].map((entry) => ({
    id: entry.id,
    name: entry.name,
    start_date: entry.startDate,
    end_date: entry.endDate,
    color: null,
    created_at: timestamp,
    updated_at: timestamp,
  }));

  store.budgets.push(...budgets);

  const transactions = [
    tx(budgets[0], 'income', 4_000_000, 'default_work', 'Salary', budgets[0].start_date),
    tx(budgets[0], 'expense', 1_200_000, 'default_household', 'Apartment rent', budgets[0].start_date),
    tx(budgets[0], 'expense', 145_000, 'default_daily-expenses', 'Groceries', today),
    tx(budgets[0], 'expense', 320_000, 'default_education', 'Online course', today),
    tx(budgets[0], 'expense', 250_000, 'default_car', 'Fuel', yesterday()),
    tx(budgets[0], 'expense', 480_000, 'default_travel', 'Flight to Cebu', budgets[0].start_date, 'unpaid'),
    tx(budgets[1], 'income', 4_000_000, 'default_work', 'Salary', budgets[1].start_date),
    tx(budgets[1], 'expense', 1_200_000, 'default_household', 'Apartment rent', budgets[1].start_date),
    tx(budgets[1], 'expense', 98_000, 'default_daily-expenses', 'Groceries', budgets[1].end_date),
  ];

  store.transactions.push(...transactions);

  // A plain expense with a reminder, so the browser harness shows the reminder
  // editor populated instead of always empty.
  const reminderDate = addDaysIso(today, 10);
  store.transactions.push({
    id: 'demo_tx_reminder',
    budget_id: budgets[0].id,
    type: 'expense',
    amount: 200_000, // ₱2,000.00
    tag_id: 'default_daily-expenses',
    account_id: null,
    to_account_id: null,
    description: 'Internet bill',
    transaction_date: today,
    payment_status: 'unpaid',
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.reminders.push({
    id: 'demo_reminder_bill',
    transaction_id: 'demo_tx_reminder',
    notes: 'Reload the prepaid wifi before it cuts out.',
    enabled: 1,
    status: 'active',
    remind_date: reminderDate,
    remind_time: '09:00',
    remind_at: buildRemindAt(reminderDate, '09:00'),
    notification_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });

  // A standalone reminder with no transaction, so the Calendar tab's reminder
  // editor shows both shapes in the browser harness.
  const standaloneDate = addDaysIso(today, 3);
  store.reminders.push({
    id: 'demo_reminder_standalone',
    transaction_id: null,
    notes: 'Submit the travel expense report.',
    enabled: 1,
    status: 'active',
    remind_date: standaloneDate,
    remind_time: '14:00',
    remind_at: buildRemindAt(standaloneDate, '14:00'),
    notification_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });

  function tx(budget, type, amount, tagId, description, date, paymentStatus) {
    return {
      id: createId('tx'),
      budget_id: budget.id,
      type,
      amount,
      tag_id: tagId,
      account_id: null,
      to_account_id: null,
      description,
      transaction_date: date,
      // Mirrors the migration backfill: historical expenses read as paid.
      payment_status:
        paymentStatus ?? (type === 'expense' ? 'paid' : null),
      created_at: timestamp,
      updated_at: timestamp,
    };
  }
}

function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toIsoDate(date);
}