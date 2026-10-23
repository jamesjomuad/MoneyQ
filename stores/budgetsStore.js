import { create } from 'zustand';

import {
  archiveBudgets,
  createBudget,
  deleteBudget,
  getArchivedBudgets,
  getBudget,
  getBudgets,
  reorderBudget,
  restoreBudget,
  restoreBudgets,
  setBudgetFolder,
  setBudgetsFolder,
  updateBudget,
} from '../storage/repositories/budgetRepository';
import {
  getPinnedBudgetIds,
  setPinnedBudgetIds,
} from '../storage/repositories/settingsRepository';
import { deleteRemindersForBudget } from '../storage/repositories/reminderRepository';
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
  archivedBudgets: [],
  pinnedIds: [],
  isLoading: true,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const [budgets, archivedBudgets, pinned] = await Promise.all([
        getBudgets(),
        getArchivedBudgets(),
        getPinnedBudgetIds(),
      ]);
      // Drop pins for budgets that no longer exist. Archived budgets are still
      // real rows with their data intact, so their pins are kept and come back
      // when the budget is restored.
      const existing = new Set(
        [...budgets, ...archivedBudgets].map((budget) => budget.id),
      );
      const pinnedIds = pinned.filter((id) => existing.has(id));
      if (pinnedIds.length !== pinned.length) await setPinnedBudgetIds(pinnedIds);
      set({ budgets, archivedBudgets, pinnedIds, isLoading: false });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  /** Refresh only the archive list (Archive screen focus). */
  loadArchived: async () => {
    const archivedBudgets = await getArchivedBudgets();
    set({ archivedBudgets });
  },

  /** Archive the selection: budgets leave every active list, data untouched. */
  archiveMany: async (ids) => {
    await archiveBudgets(ids);
    await get().load();
  },

  /**
   * Restore one archived budget. It returns to its original folder when that
   * folder still exists, otherwise to the root list.
   */
  restoreArchived: async (id) => {
    const budget = await restoreBudget(id);
    await get().load();
    return budget;
  },

  /**
   * Undo a bulk archive: bring the same ids back in one write. Every budget
   * keeps its own folder assignment, so each returns to where it came from
   * (root level when its folder no longer exists).
   */
  restoreMany: async (ids) => {
    await restoreBudgets(ids);
    await get().load();
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
    // Notifications first: the rows below tell us which OS notifications to
    // cancel. Then the reminder rows themselves — the foreign key would only
    // unlink them, but a deleted budget's reminders belong with it.
    await cancelScheduledRemindersForBudget(id);
    await deleteRemindersForBudget(id);
    await deleteBudget(id);
    const pinnedIds = get().pinnedIds.filter((pinnedId) => pinnedId !== id);
    if (pinnedIds.length !== get().pinnedIds.length) await setPinnedBudgetIds(pinnedIds);
    await get().load();
  },

  /**
   * Permanently delete several archived budgets — the Archive screen's bulk
   * action. Each id goes through exactly the single-delete sequence (cancel
   * its OS notifications, delete its reminder rows, then delete the budget and
   * let the adapter cascade its transactions, breakdown items and attachments).
   * A failure on one id never hides the others: the caller gets back what was
   * deleted and what was not, and the store is reloaded from storage either
   * way, so the screen can report the truth instead of assuming success.
   */
  removeMany: async (ids) => {
    const deleted = [];
    const failed = [];
    for (const id of ids) {
      try {
        await cancelScheduledRemindersForBudget(id);
        await deleteRemindersForBudget(id);
        await deleteBudget(id);
        deleted.push(id);
      } catch (error) {
        failed.push({ id, message: error?.message ?? 'Could not delete this budget.' });
      }
    }
    const pinnedIds = get().pinnedIds.filter((pinnedId) => !deleted.includes(pinnedId));
    if (pinnedIds.length !== get().pinnedIds.length) await setPinnedBudgetIds(pinnedIds);
    await get().load();
    return { deleted, failed };
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

  /**
   * Reassign one budget's folder (`null` returns it to the root). Only the
   * assignment changes — name, period, colors and transactions are untouched.
   */
  moveToFolder: async (id, folderId = null) => {
    await setBudgetFolder(id, folderId);
    await get().load();
  },

  /** Bulk move used by Home's selection mode; one validated transaction for all. */
  moveManyToFolder: async (ids, folderId = null) => {
    await setBudgetsFolder(ids, folderId);
    await get().load();
  },

  /**
   * Manual drag order within a budget's scope (root list or its folder).
   * The repository owns the rank rewrite; this stays a read-through cache —
   * reload so the store mirrors SQLite, and a failed write changes nothing.
   */
  reorderBudget: async (id, targetIndex) => {
    const budget = await reorderBudget(id, targetIndex);
    await get().load();
    return budget;
  },
}));