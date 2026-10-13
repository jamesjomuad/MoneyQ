import { create } from 'zustand';

/**
 * Transient state for a receipt shared into the app. The receipt-import
 * screen fills it once; the transaction form reads it, prefills from it,
 * and discards it when the user saves or leaves. It is never persisted —
 * a cancelled import leaves nothing behind, and only a real save writes
 * to storage. One pending record at a time: a fresh share replaces any
 * half-finished import rather than stacking duplicate screens.
 */
export const useReceiptImportStore = create((set) => ({
  /** null, or { id, text, imageUri, previewUnavailable, parsed, createdAt } */
  pending: null,
  setPending: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
