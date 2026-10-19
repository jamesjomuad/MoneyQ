import { create } from 'zustand';

import { getRemindersInRange } from '../storage/repositories/reminderRepository';
import {
  getBreakdownItemsInRange,
  getTransactionsByDueDateRange,
  getTransactionsInRange,
} from '../storage/repositories/transactionRepository';
import { currentMonthKey, isWithin, monthRange, todayIso } from '../utils/dates';

/**
 * View state for the Calendar tab. A whole month of transactions is loaded
 * once per month change; picking a different day only re-derives from the
 * rows already in memory, so tapping dates never hits storage.
 *
 * Reminder rows are the joined ones from the repository (they carry the
 * transaction's description and amount when linked); only enabled reminders
 * inside the visible month are kept for the per-day dots, and each
 * transaction is hydrated with its oldest reminder exactly like the budget
 * detail store does. The interactive per-day list lives in the reminders
 * store, not here.
 */
export const useCalendarStore = create((set, get) => ({
  monthKey: currentMonthKey(),
  selectedDate: todayIso(),
  transactions: [],
  // Breakdown items with a purchase_date inside the visible month — purchase
  // events, never financial rows. `paymentsByDate` holds parents whose
  // payment_due_date lands in the month: all-day payment events.
  purchases: [],
  paymentParents: [],
  reminders: [],
  isLoading: true,
  error: null,

  load: async (monthKey = get().monthKey) => {
    set({ isLoading: true, error: null, monthKey });

    try {
      const { start, end } = monthRange(monthKey);
      const [rows, allReminders, purchases, paymentParents] = await Promise.all([
        getTransactionsInRange(start, end),
        // Only this month's reminders: the engine narrows the range (and hides
        // archived budgets' rows), so the read never scales with the whole
        // reminder table.
        getRemindersInRange(start, end),
        getBreakdownItemsInRange(start, end),
        getTransactionsByDueDateRange(start, end),
      ]);

      // A transaction can own several reminders; hydrate with the oldest,
      // the same one getReminderByTransaction and the form manage.
      const reminderByTransaction = new Map();
      for (const reminder of allReminders) {
        if (reminder.transaction_id == null) continue;
        if (!reminderByTransaction.has(reminder.transaction_id)) {
          reminderByTransaction.set(reminder.transaction_id, reminder);
        }
      }
      const transactions = rows.map((row) => ({
        ...row,
        reminder: reminderByTransaction.get(row.id) ?? null,
      }));
      // The month range is already applied by the read; only the enabled flag
      // is left to check here.
      const reminders = allReminders.filter((reminder) => reminder.enabled === 1);

      // Keep the selection when it belongs to the new month; otherwise fall
      // back to today (or the first of the month for past/future months).
      const current = get().selectedDate;
      const selectedDate =
        current && isWithin(current, start, end)
          ? current
          : isWithin(todayIso(), start, end)
            ? todayIso()
            : start;

      set({ transactions, reminders, purchases, paymentParents, selectedDate, isLoading: false });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  setMonth: async (monthKey) => {
    await get().load(monthKey);
  },

  selectDate: (selectedDate) => set({ selectedDate }),
}));
