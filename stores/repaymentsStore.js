import { create } from 'zustand';

import {
  getRepayments,
  setRepaymentStatus,
} from '../storage/repositories/transactionRepository';
import {
  cancelScheduledReminder,
  scheduleSavedReminder,
} from '../services/reminderService';

/**
 * The Home money lists: every pending repayment across all budgets, earliest
 * due date first. Paid entries leave the list entirely — their history stays
 * with the budget's transaction list, which is where the app already keeps
 * everything that happened.
 *
 * Overdue is derived at render time from the due date; nothing here (or
 * anywhere else) settles a repayment on its own.
 */
export const useRepaymentsStore = create((set, get) => ({
  pending: [],
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const pending = await getRepayments('pending');
      set({ pending, isLoading: false });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  markPaid: async (transactionId) => {
    const transaction = await setRepaymentStatus(transactionId, 'paid');
    await cancelScheduledReminder(transactionId);
    await get().load();
    return transaction;
  },

  markUnpaid: async (transactionId) => {
    const transaction = await setRepaymentStatus(transactionId, 'pending');
    await scheduleSavedReminder(transactionId);
    await get().load();
    return transaction;
  },
}));
