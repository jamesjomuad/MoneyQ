import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';
import { normalizeFolderColor } from './budgetRepository';

/**
 * Budget folders are a persistent, purely organizational layer: they group
 * budgets by category (years, trips, business) and nothing else. A folder
 * never owns transactions, never changes any amount, and no summary figure is
 * computed on it. Each budget belongs to at most one folder, or to none.
 */

/** Names follow the same shape as tags: trimmed, bounded, no silent clones. */
function validateName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('A folder needs a name.');
  if (trimmed.length > 40) throw new Error('Folder names must be 40 characters or fewer.');
  return trimmed;
}

/** Case-insensitive clash check, ignoring the row being edited. */
async function findClash(trimmed, exceptId = null) {
  const folders = await storage.listFolders();
  const needle = trimmed.toLowerCase();
  return folders.find((folder) => folder.id !== exceptId && folder.name.toLowerCase() === needle) ?? null;
}

export async function getFolders() {
  return storage.listFolders();
}

export async function getFolder(id) {
  return storage.getFolder(id);
}

/** How many budgets currently sit inside a folder (for lists and warnings). */
export async function countBudgetsInFolder(folderId) {
  const budgets = await storage.listBudgets();
  return budgets.filter((budget) => (budget.folder_id ?? null) === folderId).length;
}

export async function createFolder({ name, color = null } = {}) {
  const trimmed = validateName(name);
  const clash = await findClash(trimmed);
  if (clash) throw new Error(`A folder named "${clash.name}" already exists.`);

  // New folders join at the end of the user's current order.
  const folders = await storage.listFolders();
  const position = folders.reduce((highest, folder) => Math.max(highest, folder.position + 1), 0);

  const id = createId('folder');
  const timestamp = nowIso();
  await storage.insertFolder({
    id,
    name: trimmed,
    color: normalizeFolderColor(color),
    position,
    created_at: timestamp,
    updated_at: timestamp,
  });

  return getFolder(id);
}

/** Renames and/or recolors a folder. Reordering is a position-only update. */
export async function updateFolder(id, { name, color, position } = {}) {
  const current = await getFolder(id);
  if (!current) throw new Error('That folder no longer exists.');

  const nextName = name === undefined ? current.name : validateName(name);
  if (nextName !== current.name) {
    const clash = await findClash(nextName, id);
    if (clash) throw new Error(`A folder named "${clash.name}" already exists.`);
  }

  await storage.updateFolder({
    id,
    name: nextName,
    color:
      color === undefined
        ? current.color ?? null
        : normalizeFolderColor(color),
    position: position === undefined ? current.position : Math.max(0, Math.trunc(Number(position) || 0)),
    updated_at: nowIso(),
  });

  return getFolder(id);
}

/**
 * Moves a folder to a new slot among the others (0-based, clamped), shifting
 * the rest so positions stay a contiguous 0..n-1 order.
 */
export async function reorderFolder(id, targetIndex) {
  const folders = await storage.listFolders();
  const from = folders.findIndex((folder) => folder.id === id);
  if (from < 0) throw new Error('That folder no longer exists.');

  const to = Math.min(Math.max(0, Math.trunc(Number(targetIndex) || 0)), folders.length - 1);
  if (to === from) return getFolder(id);

  const ordered = [...folders];
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);

  const timestamp = nowIso();
  for (const [index, folder] of ordered.entries()) {
    if (folder.position === index) continue;
    await storage.updateFolder({ ...folder, position: index, updated_at: timestamp });
  }

  return getFolder(id);
}

/**
 * Deletes a folder, never the data inside it: every budget still in the folder
 * is archived first (soft-deleted, ids and records untouched), then the folder
 * row goes. One transaction, so a failure can never drop the folder before its
 * budgets are archived, nor archive half of them. The foreign key then nulls
 * the archived budgets' `folder_id` (the memory adapter mirrors it), which is
 * exactly the "original folder is gone" case the Archive screen restores to the
 * root list. Already-archived budgets in the folder are left alone.
 */
export async function deleteFolder(id) {
  const timestamp = nowIso();

  await storage.beginTransaction();
  try {
    await storage.archiveBudgetsInFolder(id, timestamp, timestamp);
    await storage.deleteFolder(id);
    await storage.commitTransaction();
  } catch (error) {
    await storage.rollbackTransaction();
    throw error;
  }
}
