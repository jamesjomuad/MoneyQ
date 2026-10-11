import { create } from 'zustand';

import {
  getPermissionStatusAsync,
  requestPermissionAsync,
} from '../services/notificationService';
import {
  completeReminder,
  createReminder,
  editReminder,
  removeReminder,
  resyncReminders,
} from '../services/reminderService';
import { getReminder, getReminders } from '../storage/repositories/reminderRepository';
import {
  getTransaction,
  searchTransactions,
} from '../storage/repositories/transactionRepository';

/**
 * The reminder module's store: device notification permission, the one
 * launch-time reconciliation, and the CRUD the Calendar tab drives. The
 * SQLite rows are the source of truth — every action reads back through the
 * repository after mutating, so nothing here can drift.
 *
 * `dayReminders` is scoped to a single date (`dayDate`). Loading a new date
 * claims the scope and clears the list immediately, and a stale response can
 * never overwrite a newer selection (`dayRequestId`), so the Calendar tab
 * never shows one day's reminders under another day's header.
 */
export const useRemindersStore = create((set, get) => {
  let dayRequestId = 0;
  let linkRequestId = 0;

  return {
    permission: null, // { supported, granted, canAskAgain, status } | null
    dayDate: null,
    dayReminders: [],
    dayIsLoading: false,
    dayError: null,
    linkResults: [],
    linkError: null,

    refreshPermission: async () => {
      try {
        const permission = await getPermissionStatusAsync();
        set({ permission });
        return permission;
      } catch {
        return null; // Permission state is a nicety, never a crash.
      }
    },

    requestPermission: async () => {
      try {
        const permission = await requestPermissionAsync();
        set({ permission });
        return permission;
      } catch {
        return get().permission;
      }
    },

    /** Runs once after storage is ready: rebuild schedules, then read status. */
    resyncOnLaunch: async () => {
      try {
        await resyncReminders();
      } catch {
        // A failed resync is retried on the next launch; the rows stay correct.
      }
      await get().refreshPermission();
    },

    /** Loads the enabled reminders scheduled for one local date. */
    loadDay: async (date = get().dayDate) => {
      if (!date) return;
      const id = ++dayRequestId;
      // Claim the date at once and clear the list: while the read is in
      // flight the UI shows an empty day, never the previous selection.
      set({ dayDate: date, dayReminders: [], dayIsLoading: true, dayError: null });

      try {
        const rows = await getReminders();
        if (id !== dayRequestId) return;
        const dayReminders = rows.filter(
          (reminder) => reminder.enabled === 1 && reminder.remind_date === date,
        );
        set({ dayReminders, dayIsLoading: false });
      } catch (error) {
        if (id !== dayRequestId) return;
        set({ dayError: error, dayIsLoading: false });
      }
    },

    /** One reminder row, for hydrating the editor. */
    fetchReminder: (id) => getReminder(id),

    /** One transaction row, to show what a reminder is linked to. */
    fetchTransaction: (id) => getTransaction(id),

    /** Cross-budget matches for the editor's optional transaction link. */
    searchLink: async (query) => {
      const term = (query ?? '').trim();
      const id = ++linkRequestId;
      if (term.length === 0) {
        set({ linkResults: [], linkError: null });
        return;
      }
      try {
        const results = (await searchTransactions(term)).slice(0, 10);
        if (id === linkRequestId) set({ linkResults: results, linkError: null });
      } catch (error) {
        if (id === linkRequestId) set({ linkResults: [], linkError: error });
      }
    },

    resetLinkSearch: () => {
      linkRequestId += 1;
      set({ linkResults: [], linkError: null });
    },

    addReminder: async (input) => {
      const outcome = await createReminder(input);
      await get().loadDay();
      return outcome;
    },

    editReminder: async (id, input) => {
      const outcome = await editReminder(id, input);
      await get().loadDay();
      return outcome;
    },

    completeReminder: async (id) => {
      const outcome = await completeReminder(id);
      await get().loadDay();
      return outcome;
    },

    removeReminder: async (id) => {
      await removeReminder(id);
      await get().loadDay();
    },
  };
});
