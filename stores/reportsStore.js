import { create } from 'zustand';

import { getTags } from '../storage/repositories/tagRepository';
import { getTransactionsInRange } from '../storage/repositories/transactionRepository';
import { computeTotals } from '../utils/calculations';
import { buildBarGroups, buildTagSlices, buildTrendBuckets, periodRange, trendRange } from '../utils/reports';

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
  trendView: 'weekly',
  trendOffset: 0,
  trend: { start: '', end: '', label: '', buckets: [], total: 0 },
  isTrendLoading: true,
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

  /**
   * The expenses-over-time chart owns its own window: it is navigated by
   * weeks/months/years independently of the report period filter, so it
   * reads its range straight from storage. Offsets are clamped at 0 —
   * future periods are never browsable.
   */
  loadTrend: async (view = get().trendView, offset = get().trendOffset) => {
    const clamped = Math.min(offset, 0);
    set({ isTrendLoading: true, trendView: view, trendOffset: clamped, error: null });

    try {
      const range = trendRange(view, clamped);
      const rows = await getTransactionsInRange(range.start, range.end);
      const buckets = buildTrendBuckets(view, range, rows);
      set({
        trend: {
          start: range.start,
          end: range.end,
          label: range.label,
          buckets,
          total: buckets.reduce((sum, bucket) => sum + bucket.amount, 0),
        },
        isTrendLoading: false,
      });
    } catch (error) {
      set({ error, isTrendLoading: false });
    }
  },

  setTrendView: async (view) => {
    if (view === get().trendView) return;
    await get().loadTrend(view, 0);
  },

  /** delta is -1 (back) or +1 (forward); +1 from the current period is a no-op. */
  shiftTrend: async (delta) => {
    const next = Math.min(get().trendOffset + delta, 0);
    if (next === get().trendOffset) return;
    await get().loadTrend(get().trendView, next);
  },
}));
