import { create } from 'zustand';

import { searchTransactions } from '../storage/repositories/transactionRepository';

/**
 * Home search state. Folders are filtered from the already-loaded budgets in
 * the view; this store only owns the cross-budget transaction matches, which
 * need a read. Every search reads through to the repository, so SQLite stays
 * the source of truth, and a requestId guard drops responses from superseded
 * keystrokes.
 */
export const useSearchStore = create((set) => {
  let requestId = 0;

  return {
    transactions: [],
    error: null,

    search: async (query) => {
      const term = (query ?? '').trim();
      const id = ++requestId;
      if (term.length === 0) {
        set({ transactions: [], error: null });
        return;
      }
      try {
        const transactions = await searchTransactions(term);
        if (id === requestId) set({ transactions, error: null });
      } catch (error) {
        if (id === requestId) set({ transactions: [], error });
      }
    },

    reset: () => {
      requestId += 1;
      set({ transactions: [], error: null });
    },
  };
});
