import { create } from 'zustand';

import { getBudget } from '../storage/repositories/budgetRepository';
import { getReminders } from '../storage/repositories/reminderRepository';
import { getTags } from '../storage/repositories/tagRepository';
import {
  createTransaction,
  deleteTransaction,
  getTransactionsForBudget,
  updateTransaction,
} from '../storage/repositories/transactionRepository';
import { applyReminder, cancelScheduledReminder } from '../services/reminderService';
import { collectUsedTagIds, computeTagExpenseBreakdown, computeTotals } from '../utils/calculations';

/**
 * State for a single opened Budget. The repository returns raw rows and this
 * store reduces them with the shared rules in utils/calculations.js, so the
 * summary and the per-tag breakdown can never disagree with each other.
 *
 * Reminder rows ride along on each entry (`entry.reminder`) so the form and
 * the transaction list read one consistent snapshot; scheduling itself stays
 * in the reminder service, never in a screen.
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
      const [budget, tags, entries, reminders] = await Promise.all([
        getBudget(budgetId),
        getTags(),
        getTransactionsForBudget(budgetId),
        getReminders(),
      ]);

      if (!budget) {
        set({ error: new Error('That budget no longer exists.'), isLoading: false });
        return;
      }

      const reminderByTransaction = new Map(
        reminders.map((reminder) => [reminder.transaction_id, reminder]),
      );
      const hydrated = entries.map((entry) => ({
        ...entry,
        reminder: reminderByTransaction.get(entry.id) ?? null,
      }));

      const summary = computeTotals(hydrated);

      // Show only tags this budget's transactions actually reference, keeping
      // the library's order. Each tag's bar is its expense total divided by
      // the same `summary.expense` shown by the budget, never signed amount or
      // income, so mixed income/expense tags still measure their real spend.
      const usedTagIds = collectUsedTagIds(hydrated);
      const tagSummaries = computeTagExpenseBreakdown(hydrated, tags, summary.expense).filter(
        (row) => usedTagIds.has(row.tag.id),
      );

      set({
        budgetId,
        budget,
        summary,
        tagSummaries,
        entries: hydrated,
        transactions: activeTagId
          ? hydrated.filter((entry) => entry.tag_id === activeTagId)
          : hydrated,
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

  /**
   * Saves the transaction first and its reminder second, so a notification
   * problem can never lose the financial record. Returns the reminder outcome
   * for the form to explain (permission denied, browser preview, …).
   */
  addTransaction: async (input) => {
    const transaction = await createTransaction(input);
    const reminder =
      input.reminder === undefined
        ? null
        : await applyReminder({ transaction, reminder: input.reminder });
    await get().load(get().budgetId ?? transaction.budget_id);
    return { transaction, reminder };
  },

  updateTransaction: async (input) => {
    const transaction = await updateTransaction(input.id, input);
    const reminder =
      input.reminder === undefined
        ? null
        : await applyReminder({ transaction, reminder: input.reminder });
    await get().load(get().budgetId);
    return { transaction, reminder };
  },

  removeTransaction: async (transactionId) => {
    // The row cascades away with its reminder; the OS notification must be
    // cancelled explicitly, or a deleted entry would still speak up.
    await cancelScheduledReminder(transactionId);
    await deleteTransaction(transactionId);
    await get().load(get().budgetId);
  },

  refresh: async () => {
    const { budgetId } = get();
    if (budgetId) await get().load(budgetId);
  },
}));
