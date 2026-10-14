import { create } from 'zustand';

import { getBudget } from '../storage/repositories/budgetRepository';
import { getReminders } from '../storage/repositories/reminderRepository';
import { getTags } from '../storage/repositories/tagRepository';
import {
  createTransaction,
  deleteTransaction,
  getSubTransactionsForBudget,
  getTransaction,
  getTransactionsForBudget,
  updateTransaction,
} from '../storage/repositories/transactionRepository';
import { applyReminder } from '../services/reminderService';
import { deleteReceiptFile } from '../services/receiptFiles';
import {
  collectUsedTagIds,
  computeTagExpenseBreakdown,
  computeTotals,
  computeTransactionSharePercent,
} from '../utils/calculations';

/**
 * State for a single opened Budget. The repository returns raw rows and this
 * store reduces them with the shared rules in utils/calculations.js, so the
 * summary and the per-tag breakdown can never disagree with each other.
 *
 * Reminder rows ride along on each entry (`entry.reminder`) so the form and
 * the transaction list read one consistent snapshot; scheduling itself stays
 * in the reminder service, never in a screen.
 */
export const useBudgetDetailStore = create((set, get) => {
  let requestId = 0;

  return {
    budgetId: null,
    budget: null,
    summary: { transactionCount: 0, income: 0, expense: 0, remaining: 0 },
    tagSummaries: [],
    entries: [],
    transactions: [],
    activeTagId: null,
    isLoading: true,
    // Two distinct failure modes so the UI never mislabels one as the other:
    // `error`  — the budget row genuinely does not exist (a real not-found).
    // `loadError` — a database/read failure while loading; the row may well
    //               exist, so the screen must offer a retry, not "not found".
    error: null,
    loadError: null,

    load: async (budgetId) => {
      if (!budgetId) return;

      const id = ++requestId;
      const state = get();
      const activeTagId = state.budgetId === budgetId ? state.activeTagId : null;

      // Claim the route identity immediately. A superseded request can never
      // write itself back after a newer budget has taken over.
      set({ budgetId, isLoading: true, error: null, loadError: null, activeTagId });

      try {
        const [budget, tags, entries, reminders, breakdowns] = await Promise.all([
          getBudget(budgetId),
          getTags(),
          getTransactionsForBudget(budgetId),
          getReminders(),
          getSubTransactionsForBudget(budgetId),
        ]);

        if (id !== requestId) return;

        if (!budget) {
          set({
            budget: null,
            summary: { transactionCount: 0, income: 0, expense: 0, remaining: 0 },
            tagSummaries: [],
            entries: [],
            transactions: [],
            activeTagId: null,
            error: new Error('That budget no longer exists.'),
            loadError: null,
            isLoading: false,
          });
          return;
        }

        // A transaction can own several reminders; hydrate with the oldest,
        // the same one the form's "Set Reminder" switch manages.
        const reminderByTransaction = new Map();
        for (const reminder of reminders) {
          if (reminder.transaction_id == null) continue;
          if (!reminderByTransaction.has(reminder.transaction_id)) {
            reminderByTransaction.set(reminder.transaction_id, reminder);
          }
        }
        // Breakdown items ride along in persisted order, read once for the
        // whole budget. The list UI only ever needs the count; the form and
        // the details section read `subTransactions` off the same snapshot.
        const hydrated = entries.map((entry) => ({
          ...entry,
          reminder: reminderByTransaction.get(entry.id) ?? null,
          subTransactions: breakdowns.get(entry.id) ?? [],
          sub_transaction_count: (breakdowns.get(entry.id) ?? []).length,
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

        // Share is always against the full budget summary, even while a tag
        // filter is active. Transfers receive null because they are neither
        // income nor spending.
        const withShares = hydrated.map((entry) => ({
          ...entry,
          sharePercent: computeTransactionSharePercent(entry, summary),
        }));

        const selectedTagId = get().activeTagId;
        set({
          budgetId,
          budget,
          summary,
          tagSummaries,
          entries: withShares,
          transactions: selectedTagId
            ? withShares.filter((entry) => entry.tag_id === selectedTagId)
            : withShares,
          error: null,
          loadError: null,
          isLoading: false,
        });
      } catch (error) {
        if (id !== requestId) return;
        // A thrown query is a read failure, not proof the budget is gone —
        // keep whatever `budget` we had and surface a retryable error.
        set({ loadError: error, isLoading: false });
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
      // The transaction goes; its reminders survive as standalone records
      // (the foreign key clears the link), keeping their schedules.
      const row = await getTransaction(transactionId);
      await deleteTransaction(transactionId);
      // Only once the row is gone: its receipt image goes too. Each receipt
      // file has a unique name, so no other row can reference it — and a
      // failed delete above throws first, leaving file and row untouched.
      if (row?.receipt_path) deleteReceiptFile(row.receipt_path);
      await get().load(get().budgetId);
    },

    refresh: async () => {
      const { budgetId } = get();
      if (budgetId) await get().load(budgetId);
    },
  };
});
