import { create } from 'zustand';

/**
 * Tracks the lifecycle of the local database so the UI can distinguish
 * "still opening SQLite" from "SQLite failed to open".
 */
export const useAppStore = create((set) => ({
  databaseStatus: 'idle', // 'idle' | 'ready' | 'error'
  databaseError: null,
  schemaVersion: 0,

  setDatabaseReady: (schemaVersion) =>
    set({ databaseStatus: 'ready', databaseError: null, schemaVersion }),

  setDatabaseError: (databaseError) =>
    set({ databaseStatus: 'error', databaseError }),
}));

export const selectIsDatabaseReady = (state) => state.databaseStatus === 'ready';