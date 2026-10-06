import { create } from 'zustand';

import { getAccounts, getAllTransactions, getRowCounts } from '../database/repositories/dashboardRepository';
import { getSchemaVersion } from '../database/database';
import { currentMonthKey, isWithin, monthRange } from '../utils/dates';
import { computeTotals, computeTotalAssets } from '../utils/calculations';

const RECENT_LIMIT = 5;

function buildSummary(accounts, transactions) {
  const { start, end } = monthRange(currentMonthKey());
  const inPeriod = transactions.filter((transaction) =>
    isWithin(transaction.transaction_date, start, end),
  );

  const { income, expense, net } = computeTotals(inPeriod);

  return {
    balance: computeTotalAssets(accounts, transactions),
    income,
    expense,
    net,
    period: { start, end, monthKey: currentMonthKey() },
    // Only the rows the dashboard renders are kept; the rest are discarded so
    // the store does not become a second copy of the database.
    recentTransactions: transactions.slice(0, RECENT_LIMIT),
    accountCount: accounts.length,
    transactionCount: transactions.length,
  };
}

const EMPTY_SUMMARY = {
  balance: 0,
  income: 0,
  expense: 0,
  net: 0,
  period: null,
  recentTransactions: [],
  accountCount: 0,
  transactionCount: 0,
};

/**
 * Transient view state for the dashboard. Raw rows are read from SQLite on
 * demand, reduced to the figures the screen needs, then dropped.
 */
export const useDashboardStore = create((set) => ({
  summary: EMPTY_SUMMARY,
  counts: null,
  schemaVersion: 0,
  isLoading: true,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });

    try {
      const [accounts, transactions, counts, schemaVersion] = await Promise.all([
        getAccounts(),
        getAllTransactions(),
        getRowCounts(),
        getSchemaVersion(),
      ]);

      set({
        summary: buildSummary(accounts, transactions),
        counts,
        schemaVersion,
        isLoading: false,
      });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },
}));