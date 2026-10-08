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
 */
export async function getBudgets() {
  return storage.listBudgets();
}

export async function getBudget(id) {
  return storage.getBudget(id);
}

export async function createBudget({ name, startDate, endDate, color = null }) {
  const id = createId('budget');
  const timestamp = nowIso();

  await storage.insertBudget({
    id,
    name,
    start_date: startDate,
    end_date: endDate,
    color: normalizeFolderColor(color),
    created_at: timestamp,
    updated_at: timestamp,
  });

  return getBudget(id);
}

export async function updateBudget(id, { name, startDate, endDate, color = null }) {
  await storage.updateBudget({
    id,
    name,
    start_date: startDate,
    end_date: endDate,
    color: normalizeFolderColor(color),
    updated_at: nowIso(),
  });

  return getBudget(id);
}

/** Cascades to the budget's transactions; callers must confirm with the user. */
export async function deleteBudget(id) {
  return storage.deleteBudget(id);
}
