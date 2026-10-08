import { create } from 'zustand';

import { getTags } from '../storage/repositories/tagRepository';
import { getTransactionsInRange } from '../storage/repositories/transactionRepository';
import { computeTotals } from '../utils/calculations';
import { buildBarGroups, buildTagSlices, periodRange } from '../utils/reports';

/**
 * View state for the Reports tab. Transactions are read from storage per
 * selected period (never persisted here); every derived figure comes from
 * utils/calculations.js and utils/reports.js so the summary, bars and pie
 * can never disagree with each other.
 */
export const useReportsStore = create((set, get) => ({
  filter: 'thisMonth',
  transactions: [],
  tags: [],
  period: periodRange('thisMonth'),
  summary: { income: 0, expense: 0, remaining: 0, transactionCount: 0 },
  barGroups: [],
  tagSlices: [],
  isLoading: true,
  error: null,

  load: async (filter = get().filter) => {
    set({ isLoading: true, error: null, filter });

    try {
      const period = periodRange(filter);
      const [rows, tags] = await Promise.all([
        getTransactionsInRange(period.start, period.end),
        getTags(),
      ]);

      set({
        period,
        transactions: rows,
        tags,
        summary: computeTotals(rows),
        barGroups: buildBarGroups(rows, filter),
        tagSlices: buildTagSlices(rows, tags),
        isLoading: false,
      });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  setFilter: async (filter) => {
    if (filter === get().filter) return;
    await get().load(filter);
  },
}));
