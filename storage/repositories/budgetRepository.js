import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';

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

export async function createBudget({ name, startDate, endDate }) {
  const id = createId('budget');
  const timestamp = nowIso();

  await storage.insertBudget({
    id,
    name,
    start_date: startDate,
    end_date: endDate,
    created_at: timestamp,
    updated_at: timestamp,
  });

  return getBudget(id);
}

export async function updateBudget(id, { name, startDate, endDate }) {
  await storage.updateBudget({
    id,
    name,
    start_date: startDate,
    end_date: endDate,
    updated_at: nowIso(),
  });

  return getBudget(id);
}

/** Cascades to the budget's transactions; callers must confirm with the user. */
export async function deleteBudget(id) {
  return storage.deleteBudget(id);
}
