import { create } from 'zustand';

import {
  exportBudgetTransfer,
  importBudgetTransfer,
  pickBudgetTransfer,
} from '../services/budgetTransferService';
import { useBudgetDetailStore } from './budgetDetailStore';
import { useBudgetsStore } from './budgetsStore';
import { useCalendarStore } from './calendarStore';
import { useFoldersStore } from './foldersStore';
import { useRemindersStore } from './remindersStore';
import { useReportsStore } from './reportsStore';
import { useSettingsStore } from './settingsStore';
import { useTagsStore } from './tagsStore';
import { showToast } from './toastStore';

/**
 * Single-budget export/import state. The work itself lives in the service and
 * repository layers; this store only holds the transient preview, the chosen
 * destination and the busy/error flags, then refreshes the same caches a full
 * backup restore refreshes.
 *
 * A preview is the only thing an import changes before the user confirms it.
 * Cancelling or closing the sheet clears it, so a half-read file can never
 * reach the database.
 */
async function refreshAfterImport() {
  useSettingsStore.getState().loadSettings();
  useBudgetsStore.getState().load();
  useFoldersStore.getState().load();
  useTagsStore.getState().load();
  useCalendarStore.getState().load();
  useReportsStore.getState().load();
  const detail = useBudgetDetailStore.getState();
  if (detail.budgetId) await detail.load(detail.budgetId);
  try {
    await useRemindersStore.getState().resyncOnLaunch();
  } catch {
    // Notification resync failures must not undo a good data import; the next
    // launch resyncs again.
  }
}

export const useBudgetTransferStore = create((set, get) => ({
  isBusy: false,
  error: null,
  preview: null,

  clearError: () => set({ error: null }),

  /**
   * Export one budget. `destination` mirrors the backup screen: 'save' asks
   * for a folder, 'share' opens the share sheet. A cancelled picker is silent.
   */
  exportBudget: async (budgetId, destination = 'save', origin = 'budget') => {
    set({ isBusy: true, error: null });
    try {
      const result = await exportBudgetTransfer(budgetId, destination);
      if (result.saved) {
        const verb = destination === 'share' ? 'Shared' : 'Saved';
        if (result.warnings.length) {
          showToast(
            `${verb} "${result.fileName}" · ${result.warnings.length} receipt warning${
              result.warnings.length === 1 ? '' : 's'
            }`,
            'warning',
          );
        } else {
          showToast(`${verb} "${result.fileName}"`, 'success');
        }
      }
      return result;
    } catch (error) {
      set({
        error: {
          title: 'Could not export the budget',
          message: error?.message ?? 'Nothing was changed.',
          origin,
        },
      });
      return null;
    } finally {
      set({ isBusy: false });
    }
  },

  /**
   * Pick and validate a file. Returns true when a preview is ready; an
   * invalid file leaves the preview closed and fills `error` instead.
   */
  startImport: async ({ defaultFolderId = null, origin = 'budget' } = {}) => {
    set({ isBusy: true, error: null });
    try {
      const picked = await pickBudgetTransfer();
      if (!picked) return false;
      if (!picked.validation.ok) {
        set({
          error: {
            title: 'Cannot import this budget',
            message: picked.validation.issues.slice(0, 6).join('\n'),
            origin,
          },
        });
        return false;
      }
      set({
        preview: {
          fileName: picked.fileName,
          validation: picked.validation,
          folderId: defaultFolderId ?? null,
          origin,
        },
      });
      return true;
    } catch (error) {
      set({
        error: {
          title: 'Cannot import this budget',
          message: error?.message ?? 'Nothing was changed.',
          origin,
        },
      });
      return false;
    } finally {
      set({ isBusy: false });
    }
  },

  setDestinationFolder: (folderId) =>
    set((state) =>
      state.preview
        ? { preview: { ...state.preview, folderId: folderId ?? null } }
        : { preview: null },
    ),

  cancelImport: () => set({ preview: null }),

  /** Import the previewed budget as a new, independent budget. */
  confirmImport: async () => {
    const { preview } = get();
    if (!preview) return null;
    set({ isBusy: true, error: null });
    try {
      const result = await importBudgetTransfer(preview.validation, {
        folderId: preview.folderId,
      });
      await refreshAfterImport();
      set({ preview: null });
      showToast(`Imported "${result.budgetName}"`, 'success');
      return result;
    } catch (error) {
      set({
        error: {
          title: 'Could not import the budget',
          message: error?.message ?? 'Nothing was changed.',
          origin: preview.origin,
        },
      });
      return null;
    } finally {
      set({ isBusy: false });
    }
  },
}));
