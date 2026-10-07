import { create } from 'zustand';

import {
  getPermissionStatusAsync,
  requestPermissionAsync,
} from '../services/notificationService';
import { resyncReminders } from '../services/reminderService';

/**
 * View state for device notification permission, plus the one launch-time
 * reconciliation that keeps scheduled notifications in step with the rows in
 * SQLite. The permission itself is the OS's to hold — this store only reads
 * and reports it, and asks exactly when a user action needs it.
 */
export const useRemindersStore = create((set, get) => ({
  permission: null, // { supported, granted, canAskAgain, status } | null

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
}));
