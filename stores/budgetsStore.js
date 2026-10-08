import { create } from 'zustand';

import {
  createBudget,
  deleteBudget,
  getBudget,
  getBudgets,
  updateBudget,
} from '../storage/repositories/budgetRepository';
import {
  getPinnedBudgetIds,
  setPinnedBudgetIds,
} from '../storage/repositories/settingsRepository';
import { cancelScheduledRemindersForBudget } from '../services/reminderService';

/**
 * Home screen state. Each entry already carries `spent`, `income` and
 * `transaction_count`, all computed by the adapters rather than reconstructed
 * here. This store is a cache: every action reads through to the repository so
 * SQLite stays the source of truth.
 *
 * `pinnedIds` is the ordered list of budget ids the user pinned for quick
 * navigation. Order is insertion order (newly pinned go last); the settings
 * table is the source of truth.
 */
export const useBudgetsStore = create((set, get) => ({
  budgets: [],
  pinnedIds: [],
  isLoading: true,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const [budgets, pinned] = await Promise.all([getBudgets(), getPinnedBudgetIds()]);
      // Drop pins for budgets that no longer exist so a deleted folder also
      // disappears from the pinned section.
      const existing = new Set(budgets.map((budget) => budget.id));
      const pinnedIds = pinned.filter((id) => existing.has(id));
      if (pinnedIds.length !== pinned.length) await setPinnedBudgetIds(pinnedIds);
      set({ budgets, pinnedIds, isLoading: false });
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
    const pinnedIds = get().pinnedIds.filter((pinnedId) => pinnedId !== id);
    if (pinnedIds.length !== get().pinnedIds.length) await setPinnedBudgetIds(pinnedIds);
    await get().load();
  },

  /** Toggle a budget's pinned state; a fresh pin is appended (order-preserving). */
  togglePinned: async (id) => {
    const current = get().pinnedIds;
    const pinnedIds = current.includes(id)
      ? current.filter((pinnedId) => pinnedId !== id)
      : [...current, id];
    set({ pinnedIds });
    await setPinnedBudgetIds(pinnedIds);
  },
}));