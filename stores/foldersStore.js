import { create } from 'zustand';

import {
  countBudgetsInFolder,
  createFolder,
  deleteFolder,
  getFolder,
  getFolders,
  reorderFolder,
  updateFolder,
} from '../storage/repositories/folderRepository';

/**
 * Budget-folder state for Home and the folder screens. Like every store here
 * this is only a cache: actions read through to the repository so SQLite (or
 * the memory adapter on web) stays the source of truth.
 *
 * Folders are purely organizational — no money lives on them, so nothing
 * here computes amounts.
 */
export const useFoldersStore = create((set, get) => ({
  folders: [],
  isLoading: true,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const folders = await getFolders();
      set({ folders, isLoading: false });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  fetchFolder: (id) => getFolder(id),

  countBudgets: (id) => countBudgetsInFolder(id),

  addFolder: async (input) => {
    const folder = await createFolder(input);
    await get().load();
    return folder;
  },

  editFolder: async (id, input) => {
    const folder = await updateFolder(id, input);
    await get().load();
    return folder;
  },

  /** Move a folder to a new 0-based slot among its siblings. */
  moveFolder: async (id, targetIndex) => {
    const folder = await reorderFolder(id, targetIndex);
    await get().load();
    return folder;
  },

  /**
   * Removes the folder only. Its budgets survive and return to the root list,
   * so callers should also reload the budgets store afterwards.
   */
  removeFolder: async (id) => {
    await deleteFolder(id);
    await get().load();
  },
}));
