import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Folder colors are optional: `null` means the budget keeps the theme-driven
 * folder colors. A chosen color is stored upper-case as a 6-digit hex string.
 */
export function normalizeFolderColor(color) {
  if (color == null || color === '') return null;
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
    throw new Error('Folder color must be a hex value like #FF9800.');
  }
  return color.toUpperCase();
}

/**
 * Budgets are period containers. There is no limit column: every figure the
 * UI shows as "spent" or "remaining" is derived from the transactions inside,
 * so it can never disagree with the transaction list.
 *
 * `folder_id` is the one exception to "budgets stand alone": an optional
 * reference to a budget folder, purely organizational — it changes nothing
 * about the money inside.
 */
export async function getBudgets() {
  return storage.listBudgets();
}

export async function getBudget(id) {
  return storage.getBudget(id);
}

/** A folder reference must point at a real folder; `null` means ungrouped. */
async function resolveFolderId(folderId) {
  if (folderId == null) return null;
  const folder = await storage.getFolder(folderId);
  if (!folder) throw new Error('That budget folder no longer exists.');
  return folder.id;
}

export async function createBudget({ name, startDate, endDate, color = null, folderId = null }) {
  const id = createId('budget');
  const timestamp = nowIso();

  await storage.insertBudget({
    id,
    name,
    start_date: startDate,
    end_date: endDate,
    color: normalizeFolderColor(color),
    folder_id: await resolveFolderId(folderId),
    created_at: timestamp,
    updated_at: timestamp,
  });

  return getBudget(id);
}

export async function updateBudget(id, { name, startDate, endDate, color = null, folderId }) {
  // `folderId === undefined` keeps the current assignment, so editors that
  // only touch the period or colors can never accidentally ungroup a budget.
  const current = await storage.getBudget(id);
  const nextFolderId =
    folderId === undefined ? (current?.folder_id ?? null) : await resolveFolderId(folderId);

  await storage.updateBudget({
    id,
    name,
    start_date: startDate,
    end_date: endDate,
    color: normalizeFolderColor(color),
    folder_id: nextFolderId,
    updated_at: nowIso(),
  });

  return getBudget(id);
}

/**
 * Moves one budget into a folder (or back to the root when `folderId` is
 * null). Touches only the folder assignment and `updated_at` — never the
 * budget's name, period, colors, transactions, or any derived figure.
 */
export async function setBudgetFolder(id, folderId = null) {
  const current = await storage.getBudget(id);
  if (!current) throw new Error('That budget no longer exists.');

  await storage.updateBudget({
    id,
    name: current.name,
    start_date: current.start_date,
    end_date: current.end_date,
    color: current.color ?? null,
    folder_id: await resolveFolderId(folderId),
    updated_at: nowIso(),
  });

  return getBudget(id);
}

/** Cascades to the budget's transactions; callers must confirm with the user. */
export async function deleteBudget(id) {
  return storage.deleteBudget(id);
}
