import { create } from 'zustand';

import { getTags } from '../storage/repositories/tagRepository';
import { getTransactionsInRange } from '../storage/repositories/transactionRepository';
import { computeTotals } from '../utils/calculations';
import { toIsoDate } from '../utils/dates';
import { buildBarGroups, buildTagSlices, buildTrendBuckets, periodRange, trendForFilter, trendRange } from '../utils/reports';

function computeTrend(view, range, rows) {
  const buckets = buildTrendBuckets(view, range, rows);
  return {
    start: range.start,
    end: range.end,
    label: range.label,
    buckets,
    total: buckets.reduce((sum, bucket) => sum + bucket.amount, 0),
  };
}

function defaultCustomRange() {
  const now = new Date();
  return { start: `${now.getFullYear()}-01-01`, end: toIsoDate(now) };
}

/**
 * View state for the Reports tab. Transactions are read from storage per
 * selected period (never persisted here); every derived figure comes from
 * utils/calculations.js and utils/reports.js so the summary, bars and pie
 * can never disagree with each other. The expenses-over-time chart starts
 * from the same period as the page filter.
 */
export const useReportsStore = create((set, get) => ({
  filter: 'thisMonth',
  custom: defaultCustomRange(),
  transactions: [],
  tags: [],
  period: periodRange('thisMonth'),
  summary: { income: 0, expense: 0, remaining: 0, transactionCount: 0 },
  barGroups: [],
  tagSlices: [],
  trendView: 'monthly',
  trend: computeTrend('monthly', trendRange('monthly', 0), []),
  isLoading: true,
  error: null,

  load: async (filter = get().filter) => {
    set({ isLoading: true, error: null, filter });

    try {
      const period = periodRange(filter, get().custom);
      const [rows, tags] = await Promise.all([
        getTransactionsInRange(period.start, period.end),
        getTags(),
      ]);

      const anchor = trendForFilter(filter, period);
      const range = anchor.range ?? trendRange(anchor.view, anchor.offset);
      set({
        period,
        transactions: rows,
        tags,
        summary: computeTotals(rows),
        barGroups: buildBarGroups(rows, filter, period),
        tagSlices: buildTagSlices(rows, tags),
        trendView: anchor.view,
        trend: computeTrend(anchor.view, range, rows),
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

  /** Partial update of the custom bounds; reversed picks are normalized. */
  setCustomRange: async (patch) => {
    const merged = { ...get().custom, ...patch };
    const custom =
      merged.start <= merged.end ? merged : { start: merged.end, end: merged.start };
    set({ custom });
    await get().load('custom');
  },
}));
