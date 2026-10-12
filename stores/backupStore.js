/**
 * Orchestrates the backup flows: export, the import preview, the merge
 * review, and the destructive full restore (guarded by a mandatory
 * recovery backup). Owns the busy flag so no two transfers can overlap,
 * and refreshes every data store after a successful write so the UI never
 * shows pre-import rows.
 */

import Constants from 'expo-constants';
import { create } from 'zustand';

import {
  buildMergePlan,
  buildBackupFileName,
  parseBackupText,
  projectMergeResult,
  resolveGroup,
  serializeSnapshot,
  stringifyBackup,
  compileMergeWrites,
} from '../utils/backup';
import { todayIso } from '../utils/dates';
import { nowIso } from '../utils/id';
import {
  applyMerge,
  readSnapshot,
  restoreAll,
} from '../storage/repositories/backupRepository';
import { pickBackup, saveBackup } from '../services/fileService';
import { useBudgetDetailStore } from './budgetDetailStore';
import { useBudgetsStore } from './budgetsStore';
import { useCalendarStore } from './calendarStore';
import { useRemindersStore } from './remindersStore';
import { useReportsStore } from './reportsStore';
import { useSettingsStore } from './settingsStore';
import { showToast } from './toastStore';
import { useTagsStore } from './tagsStore';

export const useBackupStore = create((set, get) => ({
  isBusy: false,
  error: null,
  /** { fileName, createdAt, appVersion, counts, warnings, data } once parsed. */
  preview: null,
  /** Merge plan { groups, counts } while the user reviews conflicts. */
  plan: null,
  /** Snapshot taken when the merge started, for planning + projection. */
  currentSnapshot: null,

  clearError() {
    set({ error: null });
  },

  async exportBackup() {
    if (get().isBusy) return;
    set({ isBusy: true });
    try {
      const snapshot = await readSnapshot();
      const envelope = serializeSnapshot(snapshot, {
        appVersion: Constants.expoConfig?.version ?? null,
        createdAt: nowIso(),
      });
      const { name } = await saveBackup(
        stringifyBackup(envelope),
        buildBackupFileName(todayIso()),
      );
      showToast(`Backup exported as ${name}`, 'success');
    } catch (error) {
      showToast('Could not export the backup', 'error');
      set({ error: { title: 'Export failed', message: error?.message ?? 'Please try again.' } });
    } finally {
      set({ isBusy: false });
    }
  },

  async startImport() {
    if (get().isBusy) return;
    set({ isBusy: true });
    try {
      const picked = await pickBackup();
      if (!picked) return; // user cancelled the system picker
      const result = parseBackupText(picked.text);
      if (!result.ok) {
        set({
          error: {
            title: 'Cannot import this file',
            message: result.issues.slice(0, 6).join('\n'),
          },
        });
        return;
      }
      set({
        preview: { fileName: picked.name, ...result },
        plan: null,
      });
    } catch (error) {
      set({
        error: {
          title: 'Import failed',
          message: error?.message ?? 'The file could not be read.',
        },
      });
    } finally {
      set({ isBusy: false });
    }
  },

  cancelImport() {
    set({ preview: null, plan: null, currentSnapshot: null });
  },

  /** Move from the preview into conflict review. */
  async beginMerge() {
    const { preview } = get();
    if (!preview || get().isBusy) return;
    set({ isBusy: true });
    try {
      const currentSnapshot = await readSnapshot();
      set({
        currentSnapshot,
        plan: buildMergePlan(preview.data, currentSnapshot),
      });
    } catch (error) {
      set({
        error: {
          title: 'Could not review the merge',
          message: error?.message ?? 'Please try again.',
        },
      });
    } finally {
      set({ isBusy: false });
    }
  },

  backFromMerge() {
    set({ plan: null, currentSnapshot: null });
  },

  resolveConflict(key, resolution) {
    const { plan } = get();
    if (!plan) return;
    set({ plan: resolveGroup(plan, key, resolution) });
  },

  async confirmMerge() {
    const { plan, currentSnapshot, preview } = get();
    if (!plan || !currentSnapshot || get().isBusy) return;
    const writes = compileMergeWrites(plan);
    const projection = projectMergeResult(currentSnapshot, writes);
    if (projection.issues.length > 0) {
      set({
        error: {
          title: 'Merge would create invalid data',
          message: projection.issues.slice(0, 6).join('\n'),
        },
      });
      return;
    }
    set({ isBusy: true });
    try {
      await applyMerge(writes);
      const added = plan.counts.new;
      const replaced = plan.groups.filter(
        (group) => group.state === 'conflict' && group.resolution === 'replace',
      ).length;
      await finish(
        `Merged ${preview.fileName}: ${added} new, ${replaced} replaced.`,
      );
    } catch (error) {
      showToast('The merge could not be applied — nothing was changed', 'error');
      set({
        error: { title: 'Merge failed', message: error?.message ?? 'Please try again.' },
      });
    } finally {
      set({ isBusy: false });
    }
  },

  /**
   * Destructive path: save a recovery backup of the CURRENT data first —
   * if that save fails or is cancelled the restore never starts.
   */
  async performFullRestore() {
    const { preview, isBusy } = get();
    if (!preview || isBusy) return;
    set({ isBusy: true });
    try {
      const snapshot = await readSnapshot();
      const recovery = serializeSnapshot(snapshot, {
        appVersion: Constants.expoConfig?.version ?? null,
        createdAt: nowIso(),
      });
      try {
        await saveBackup(
          stringifyBackup(recovery),
          buildBackupFileName(todayIso(), '-Recovery'),
        );
      } catch (error) {
        set({
          error: {
            title: 'Restore cancelled',
            message:
              'The recovery backup could not be saved, so nothing was replaced. ' +
              (error?.message ?? 'Please try again.'),
          },
        });
        return;
      }
      await restoreAll(preview.data);
      await finish(`Restored ${preview.fileName}.`);
    } catch (error) {
      showToast('The restore failed — your previous data is still intact', 'error');
      set({ error: { title: 'Restore failed', message: error?.message ?? 'Please try again.' } });
    } finally {
      set({ isBusy: false });
    }
  },
}));

/** Reload every data store, re-arm notifications, and toast the result. */
async function finish(message) {
  useSettingsStore.getState().loadSettings();
  useBudgetsStore.getState().load();
  useTagsStore.getState().load();
  useCalendarStore.getState().load();
  useReportsStore.getState().load();
  const detail = useBudgetDetailStore.getState();
  if (detail.budgetId) await detail.load(detail.budgetId);
  try {
    await useRemindersStore.getState().resyncOnLaunch();
  } catch {
    // Notification resync failures must not undo a good data import; the
    // next launch resyncs again.
  }
  useBackupStore.getState().cancelImport();
  showToast(message, 'success');
}
