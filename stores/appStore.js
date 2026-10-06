import { create } from 'zustand';

/**
 * Tracks the lifecycle of local storage so the UI can distinguish "still
 * opening the database" from "the database failed to open", and can tell the
 * user when they are looking at the in-memory web preview instead of real
 * SQLite data.
 */
export const useAppStore = create((set) => ({
  databaseStatus: 'idle', // 'idle' | 'ready' | 'error'
  databaseError: null,
  schemaVersion: 0,
  storageSource: null, // 'sqlite' (persistent) | 'memory' (web preview)

  setDatabaseReady: (schemaVersion, storageSource = null) =>
    set({
      databaseStatus: 'ready',
      databaseError: null,
      schemaVersion,
      storageSource,
    }),

  setDatabaseError: (databaseError) =>
    set({ databaseStatus: 'error', databaseError, storageSource: null }),
}));

export const selectIsDatabaseReady = (state) => state.databaseStatus === 'ready';