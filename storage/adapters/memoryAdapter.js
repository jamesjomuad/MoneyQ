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
import { suggestBudgetDates, toIsoDate } from '../../utils/dates';
import { LATEST_VERSION } from '../database/migrations';

export function createMemoryAdapter({ seedDemo = false } = {}) {
  const store = {
    budgets: [],
    tags: [],
    transactions: [],
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
          let transactionCount = 0;
          for (const transaction of store.transactions) {
            if (transaction.budget_id !== budget.id) continue;
            transactionCount += 1;
            if (transaction.type === 'expense') spent += transaction.amount;
          }
          return { ...budget, spent, transaction_count: transactionCount };
        });
    },

    async getBudget(id) {
      return copy(store.budgets.find((budget) => budget.id === id) ?? null);
    },

    async insertBudget(row) {
      store.budgets.push({ ...row });
    },

    async updateBudget(row) {
      const index = store.budgets.findIndex((budget) => budget.id === row.id);
      if (index >= 0) store.budgets[index] = { ...store.budgets[index], ...row };
    },

    /** Mirrors `ON DELETE CASCADE` on transactions. */
    async deleteBudget(id) {
      const before = store.budgets.length;
      store.budgets = store.budgets.filter((budget) => budget.id !== id);
      const removed = before - store.budgets.length;
      store.transactions = store.transactions.filter(
        (transaction) => transaction.budget_id !== id,
      );
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

    async getTransaction(id) {
      return copy(store.transactions.find((transaction) => transaction.id === id) ?? null);
    },

    async insertTransaction(row) {
      store.transactions.push({ ...row });
    },

    async deleteTransaction(id) {
      const before = store.transactions.length;
      store.transactions = store.transactions.filter((transaction) => transaction.id !== id);
      return before - store.transactions.length;
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
    tx(budgets[0], 'expense', 480_000, 'default_travel', 'Flight to Cebu', budgets[0].start_date),
    tx(budgets[1], 'income', 4_000_000, 'default_work', 'Salary', budgets[1].start_date),
    tx(budgets[1], 'expense', 1_200_000, 'default_household', 'Apartment rent', budgets[1].start_date),
    tx(budgets[1], 'expense', 98_000, 'default_daily-expenses', 'Groceries', budgets[1].end_date),
  ];

  store.transactions.push(...transactions);

  function tx(budget, type, amount, tagId, description, date) {
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