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
  const folder_id = await resolveFolderId(folderId);

  // New budgets join at the end of their scope's manual order (root list or
  // the chosen folder), mirroring how new folders append. Position only ever
  // orders the list; it carries no financial meaning.
  const all = await storage.listBudgets();
  const position = all
    .filter((budget) => (budget.folder_id ?? null) === folder_id)
    .reduce((highest, budget) => Math.max(highest, (budget.position ?? 0) + 1), 0);

  await storage.insertBudget({
    id,
    name,
    start_date: startDate,
    end_date: endDate,
    color: normalizeFolderColor(color),
    folder_id,
    position,
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
 * Its manual `position` rides along: inside the new scope it simply ranks
 * against that scope's own order (date tie-break on ties), and users can
 * drag it wherever they like there.
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

/**
 * Bulk variant of setBudgetFolder: one target-folder validation for the whole
 * selection, every reassignment inside a single SQL transaction. A failure
 * mid-loop rolls the whole move back rather than leaving half the selection
 * in the folder. Touches only the assignment and `updated_at`, exactly like
 * the single-budget move.
 */
export async function setBudgetsFolder(ids, folderId = null) {
  const nextFolderId = await resolveFolderId(folderId);
  const timestamp = nowIso();

  await storage.beginTransaction();
  try {
    for (const id of ids) {
      const current = await storage.getBudget(id);
      if (!current) throw new Error('That budget no longer exists.');
      await storage.updateBudget({
        id,
        name: current.name,
        start_date: current.start_date,
        end_date: current.end_date,
        color: current.color ?? null,
        folder_id: nextFolderId,
        updated_at: timestamp,
      });
    }
    await storage.commitTransaction();
  } catch (error) {
    await storage.rollbackTransaction();
    throw error;
  }

  return ids;
}

/** Cascades to the budget's transactions; callers must confirm with the user. */
export async function deleteBudget(id) {
  return storage.deleteBudget(id);
}

/**
 * Moves a budget to a new slot among its scope's siblings (0-based, clamped)
 * — root list or its folder, never across. The rest shift so each scope keeps
 * a contiguous 0..n-1 manual order. Order is the only thing this touches:
 * ids, folder assignments, periods, colors, and every transaction stay
 * exactly as they were.
 */
export async function reorderBudget(id, targetIndex) {
  const budgets = await storage.listBudgets();
  const moved = budgets.find((budget) => budget.id === id);
  if (!moved) throw new Error('That budget no longer exists.');

  // Siblings in display order (listBudgets already sorts by position, then
  // the historical date default within equal ranks).
  const scope = moved.folder_id ?? null;
  const siblings = budgets.filter((budget) => (budget.folder_id ?? null) === scope);
  const from = siblings.findIndex((budget) => budget.id === id);
  if (from < 0) return getBudget(id); // defensive: row vanished mid-read

  const to = Math.min(Math.max(0, Math.trunc(Number(targetIndex) || 0)), siblings.length - 1);
  if (to === from) return getBudget(id);

  const ordered = [...siblings];
  const [item] = ordered.splice(from, 1);
  ordered.splice(to, 0, item);

  const timestamp = nowIso();
  const entries = [];
  for (const [index, budget] of ordered.entries()) {
    if ((budget.position ?? 0) === index) continue;
    entries.push({ id: budget.id, position: index });
  }
  if (entries.length) await storage.updateBudgetPositions(entries, timestamp);

  return getBudget(id);
}
