import { create } from 'zustand';

import {
  countTransactionsUsingTag,
  createTag,
  deleteTag,
  getTags,
  updateTag,
} from '../storage/repositories/tagRepository';

export const useTagsStore = create((set, get) => ({
  tags: [],
  isLoading: true,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ tags: await getTags(), isLoading: false });
    } catch (error) {
      set({ error, isLoading: false });
    }
  },

  addTag: async (input) => {
    const tag = await createTag(input);
    await get().load();
    return tag;
  },

  renameTag: async (id, input) => {
    const tag = await updateTag(id, input);
    await get().load();
    return tag;
  },

  removeTag: async (id) => {
    const usage = await countTransactionsUsingTag(id);
    await deleteTag(id);
    await get().load();
    return usage;
  },

  /** How many transactions currently use this tag, for delete confirmation. */
  getUsage: (id) => countTransactionsUsingTag(id),

  clearError: () => set({ error: null }),
}));