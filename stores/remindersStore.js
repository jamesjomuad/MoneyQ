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
  snoozeReminder,
} from '../services/reminderService';
import {
  getReminder,
  getRemindersForTransaction,
  getRemindersInRange,
} from '../storage/repositories/reminderRepository';
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
 * `dayCache` holds one loaded list per date, so revisiting a date is
 * instant (no spinner flash). Loading a new date keeps `dayIsLoading` true
 * until its rows land, and a stale response can never overwrite a newer
 * selection (`dayRequestId`), so the Calendar tab never shows one day's
 * reminders under another day's header.
 */
export const useRemindersStore = create((set, get) => {
  let dayRequestId = 0;
  let linkRequestId = 0;
  let transactionRequestId = 0;

  /** Re-reads both open scopes: the selected day and the open transaction, if any. */
  const refreshOpenLists = async () => {
    const { dayDate, transactionId } = get();
    if (dayDate) await get().loadDay(dayDate, { force: true });
    if (transactionId) await get().loadForTransaction(transactionId);
  };

  return {
    permission: null, // { supported, granted, canAskAgain, status } | null
    dayDate: null,
    dayCache: {},
    dayIsLoading: false,
    dayError: null,
    linkResults: [],
    linkError: null,
    transactionId: null,
    transactionReminders: [],
    transactionIsLoading: false,
    transactionError: null,

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

    /**
     * Loads the enabled reminders scheduled for one local date, cached per
     * date so revisits are instant. Pass `{ force: true }` to re-read — the
     * mutations use it after every change.
     */
    loadDay: async (date = get().dayDate, options = {}) => {
      const { force = false } = options || {};
      if (!date) return;
      if (!force && Object.prototype.hasOwnProperty.call(get().dayCache, date)) {
        set({ dayDate: date });
        return;
      }
      const id = ++dayRequestId;
      set({ dayDate: date, dayIsLoading: true, dayError: null });

      try {
        // The repository hides reminders of archived budgets and narrows the
        // read to this one day, so a day can only ever show rows belonging to
        // live budgets — and the read never scales with the whole table.
        const rows = await getRemindersInRange(date, date);
        if (id !== dayRequestId) return;
        const dayReminders = rows.filter((reminder) => reminder.enabled === 1);
        set((state) => ({
          dayCache: { ...state.dayCache, [date]: dayReminders },
          dayIsLoading: false,
        }));
      } catch (error) {
        if (id !== dayRequestId) return;
        set({ dayError: error, dayIsLoading: false });
      }
    },

    /**
     * Loads every reminder linked to one transaction — standalone reminders
     * (transaction_id NULL) are never included. Like `loadDay`, the scope is
     * claimed up front and the list cleared, and a stale response can never
     * overwrite a newer selection (`transactionRequestId`), so the transaction
     * view never shows one transaction's reminders under another.
     */
    loadForTransaction: async (transactionId) => {
      if (!transactionId) {
        set({
          transactionId: null,
          transactionReminders: [],
          transactionIsLoading: false,
          transactionError: null,
        });
        return;
      }
      const id = ++transactionRequestId;
      set({
        transactionId,
        transactionReminders: [],
        transactionIsLoading: true,
        transactionError: null,
      });

      try {
        // Archived rows included: this list belongs to the transaction form,
        // which manages the reminder row that already exists — hiding it here
        // would make the form's switch look off for a row that is still there.
        // Scoped to the one transaction instead of reading every reminder.
        const rows = await getRemindersForTransaction(transactionId, { includeArchived: true });
        if (id !== transactionRequestId) return;
        set({ transactionReminders: rows, transactionIsLoading: false });
      } catch (error) {
        if (id !== transactionRequestId) return;
        set({ transactionError: error, transactionIsLoading: false });
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
      await refreshOpenLists();
      return outcome;
    },

    editReminder: async (id, input) => {
      const outcome = await editReminder(id, input);
      await refreshOpenLists();
      return outcome;
    },

    completeReminder: async (id) => {
      const outcome = await completeReminder(id);
      await refreshOpenLists();
      return outcome;
    },

    /** Pushes one reminder's schedule forward — the notification's "Remind Later". */
    snoozeReminder: async (id, options) => {
      const outcome = await snoozeReminder(id, options);
      await refreshOpenLists();
      return outcome;
    },

    removeReminder: async (id) => {
      await removeReminder(id);
      await refreshOpenLists();
    },
  };
});
