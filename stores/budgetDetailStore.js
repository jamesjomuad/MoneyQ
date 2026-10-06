import { create } from 'zustand';

import { getBudget } from '../storage/repositories/budgetRepository';
import { getTags } from '../storage/repositories/tagRepository';
import {
  createTransaction,
  deleteTransaction,
  getTransactionsForBudget,
} from '../storage/repositories/transactionRepository';
import { computeSpendByTag, computeTotals } from '../utils/calculations';

/**
 * State for a single opened Budget. The repository returns raw rows and this
 * store reduces them with the shared rules in utils/calculations.js, so the
 * summary and the per-tag breakdown can never disagree with each other.
 */
export const useBudgetDetailStore = create((set, get) => ({
  budgetId: null,
  budget: null,
  summary: { transactionCount: 0, income: 0, expense: 0, remaining: 0 },
  tagSummaries: [],
  entries: [],
  transactions: [],
  activeTagId: null,
  isLoading: true,
  error: null,

  load: async (budgetId) => {
    if (!budgetId) return;

    const previousBudgetId = get().budgetId;
    const activeTagId = previousBudgetId === budgetId ? get().activeTagId : null;

    set({ isLoading: true, error: null, activeTagId });

    try {
      const [budget, tags, entries] = await Promise.all([
        getBudget(budgetId),
        getTags(),
        getTransactionsForBudget(budgetId),
      ]);

      if (!budget) {
        set({ error: new Error('That budget no longer exists.'), isLoading: false });
        return;
      }

      set({
        budgetId,
        budget,
        summary: computeTotals(entries),
        tagSummaries: computeSpendByTag(entries, tags),
        entries,
        transactions: activeTagId ? entries.filter((entry) => entry.tag_id === activeTagId) : entries,
        isLoading: false,
      });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  setActiveTag: (tagId) => {
    const { entries } = get();
    set({
      activeTagId: tagId,
      transactions: tagId ? entries.filter((entry) => entry.tag_id === tagId) : entries,
    });
  },

  addTransaction: async (input) => {
    await createTransaction(input);
    await get().load(get().budgetId);
  },

  removeTransaction: async (transactionId) => {
    await deleteTransaction(transactionId);
    await get().load(get().budgetId);
  },

  refresh: async () => {
    const { budgetId } = get();
    if (budgetId) await get().load(budgetId);
  },
}));