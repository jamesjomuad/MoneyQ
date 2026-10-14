import { create } from 'zustand';

import {
  createAttachment,
  getAttachments,
  removeAttachment,
} from '../storage/repositories/attachmentRepository';
import { deleteReceiptFile, persistReceipt, receiptFileUri } from '../services/receiptFiles';

/**
 * Receipt attachments of the ONE transaction the form is editing. Scoped to
 * a transaction id (like the detail store is scoped to a budget) rather than
 * hydrated onto every budget entry: only the form ever shows attachments,
 * so list screens never pay for reading them.
 *
 * Adding and removing are immediate, self-contained writes — the same
 * treatment reminders get — so they are deliberately outside the form's
 * dirty-check/autosave machinery: picking a photo lands in the database and
 * disappears from it on its own, whatever the other fields do next.
 *
 * Each attachment row carries a document-relative path; `uri` is the same
 * reference resolved to a displayable file URI — null when the file is gone,
 * so the row still shows and can be removed.
 */
export const useAttachmentStore = create((set, get) => {
  let requestId = 0;

  return {
    transactionId: null,
    attachments: [],
    isLoading: false,

    load: async (transactionId) => {
      if (!transactionId) return;
      const id = ++requestId;
      set({ transactionId, isLoading: true });
      try {
        const rows = await getAttachments(transactionId);
        if (id !== requestId) return;
        set({
          transactionId,
          attachments: rows.map((row) => ({ ...row, uri: receiptFileUri(row.path) })),
          isLoading: false,
        });
      } catch {
        if (id !== requestId) return;
        // A read failure leaves the section empty rather than stale; the
        // repository is the source of truth and the next load retries.
        set({ transactionId, attachments: [], isLoading: false });
      }
    },

    /**
     * Copy a picked/shared image into permanent storage and attach it. The
     * file is written first: a row may only reference bytes that already
     * exist. If the row then fails to commit, the fresh copy is removed
     * again — nothing is ever referenced that is not there, and nothing
     * orphaned is left behind.
     */
    addImage: async (transactionId, sourceUri) => {
      const path = await persistReceipt(sourceUri);
      try {
        await createAttachment({ transactionId, path });
      } catch (error) {
        deleteReceiptFile(path);
        throw error;
      }
      await get().load(transactionId);
    },

    /**
     * Drop one attachment: the row goes first, and only after it is
     * confirmed gone does its file follow — a failed delete therefore
     * keeps row and file together rather than stranding a reference.
     */
    remove: async (attachmentId) => {
      const row = await removeAttachment(attachmentId);
      if (row) deleteReceiptFile(row.path);
      const { transactionId } = get();
      if (transactionId) await get().load(transactionId);
    },

    clear: () => {
      requestId += 1;
      set({ transactionId: null, attachments: [], isLoading: false });
    },
  };
});
