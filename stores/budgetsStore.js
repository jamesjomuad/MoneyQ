import { create } from 'zustand';

import {
  createBudget,
  deleteBudget,
  getBudget,
  getBudgets,
  updateBudget,
} from '../storage/repositories/budgetRepository';
import { cancelScheduledRemindersForBudget } from '../services/reminderService';

/**
 * Home screen state. Each entry already carries `spent`, `income` and
 * `transaction_count`, all computed by the adapters rather than reconstructed
 * here. This store is a cache: every action reads through to the repository so
 * SQLite stays the source of truth.
 */
export const useBudgetsStore = create((set, get) => ({
  budgets: [],
  isLoading: true,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ budgets: await getBudgets(), isLoading: false });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  fetchBudget: (id) => getBudget(id),

  addBudget: async (input) => {
    const budget = await createBudget(input);
    await get().load();
    return budget;
  },

  editBudget: async (id, input) => {
    const budget = await updateBudget(id, input);
    await get().load();
    return budget;
  },

  removeBudget: async (id) => {
    // Notifications first: the cascade below deletes the reminder rows that
    // tell us which OS notifications to cancel.
    await cancelScheduledRemindersForBudget(id);
    await deleteBudget(id);
    await get().load();
  },
}));