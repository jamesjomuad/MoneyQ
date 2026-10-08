import { create } from 'zustand';

import { getReminders } from '../storage/repositories/reminderRepository';
import { getTransactionsInRange } from '../storage/repositories/transactionRepository';
import { currentMonthKey, isWithin, monthRange, todayIso } from '../utils/dates';

/**
 * View state for the Calendar tab. A whole month of transactions is loaded
 * once per month change; picking a different day only re-derives from the
 * rows already in memory, so tapping dates never hits storage.
 *
 * Reminder rows are the joined ones from the repository (they carry the
 * transaction's description and amount); only enabled reminders inside the
 * visible month are kept, and each transaction is hydrated with its reminder
 * exactly like the budget detail store does.
 */
export const useCalendarStore = create((set, get) => ({
  monthKey: currentMonthKey(),
  selectedDate: todayIso(),
  transactions: [],
  reminders: [],
  isLoading: true,
  error: null,

  load: async (monthKey = get().monthKey) => {
    set({ isLoading: true, error: null, monthKey });

    try {
      const { start, end } = monthRange(monthKey);
      const [rows, allReminders] = await Promise.all([
        getTransactionsInRange(start, end),
        getReminders(),
      ]);

      const reminderByTransaction = new Map(
        allReminders.map((reminder) => [reminder.transaction_id, reminder]),
      );
      const transactions = rows.map((row) => ({
        ...row,
        reminder: reminderByTransaction.get(row.id) ?? null,
      }));
      const reminders = allReminders.filter(
        (reminder) => reminder.enabled === 1 && isWithin(reminder.remind_date, start, end),
      );

      // Keep the selection when it belongs to the new month; otherwise fall
      // back to today (or the first of the month for past/future months).
      const current = get().selectedDate;
      const selectedDate =
        current && isWithin(current, start, end)
          ? current
          : isWithin(todayIso(), start, end)
            ? todayIso()
            : start;

      set({ transactions, reminders, selectedDate, isLoading: false });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  setMonth: async (monthKey) => {
    await get().load(monthKey);
  },

  selectDate: (selectedDate) => set({ selectedDate }),
}));
