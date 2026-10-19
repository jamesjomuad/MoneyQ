import { create } from 'zustand';

import { getRemindersInRange } from '../storage/repositories/reminderRepository';
import {
  getRecentTransactions,
  getTransactionsByDueDateRange,
  getTransactionsInRange,
} from '../storage/repositories/transactionRepository';
import { addDaysIso, currentMonthKey, formatMonth, monthRange, todayIso } from '../utils/dates';

/** How many recent transactions the dashboard's compact list shows. */
const RECENT_LIMIT = 6;

/**
 * The payments-and-reminders window: a month ahead, plus a month behind so a
 * payment that slipped past its due date still surfaces as overdue instead of
 * silently dropping off the dashboard.
 */
const DUE_PAST_DAYS = 30;
const DUE_AHEAD_DAYS = 30;

/**
 * Everything the Insights dashboard reads, in one place: the current month's
 * financial rows, the payments and reminders around today, and the newest
 * transactions. The screen never touches a repository — it renders this state
 * and derives totals from it.
 *
 * Every read is a store call, so each one is archive-safe by construction:
 * the adapters exclude transactions and reminders belonging to an archived
 * budget. Budget figures themselves come from `useBudgetsStore`, which only
 * ever loads active budgets.
 */
export const useDashboardStore = create((set) => ({
  isLoading: true,
  error: null,
  /** The month the summary covers: { monthKey, start, end, label }. */
  range: null,
  /** Parent rows only, so a breakdown is never counted twice. */
  monthTransactions: [],
  upcomingPayments: [],
  upcomingReminders: [],
  recent: [],

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const monthKey = currentMonthKey();
      const { start, end } = monthRange(monthKey);
      const today = todayIso();

      const [monthTransactions, upcomingPayments, reminders, recent] = await Promise.all([
        getTransactionsInRange(start, end),
        getTransactionsByDueDateRange(addDaysIso(today, -DUE_PAST_DAYS), addDaysIso(today, DUE_AHEAD_DAYS)),
        getRemindersInRange(today, addDaysIso(today, DUE_AHEAD_DAYS)),
        getRecentTransactions(RECENT_LIMIT),
      ]);

      set({
        isLoading: false,
        range: { monthKey, start, end, label: formatMonth(monthKey) },
        monthTransactions,
        upcomingPayments,
        // Disabled and completed reminders are not upcoming anything.
        upcomingReminders: reminders.filter(
          (reminder) => reminder.enabled === 1 && reminder.status !== 'completed',
        ),
        recent,
      });
    } catch (error) {
      set({ isLoading: false, error });
    }
  },
}));
