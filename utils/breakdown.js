/**
 * Pure business rules for transaction breakdowns (sub-transactions). The
 * repository calls these before touching storage, and the form calls them for
 * instant feedback — both read the same rules, so the authoritative check can
 * never disagree with what the UI showed.
 *
 * A breakdown is a list of signed, ordered items that belong to one parent
 * transaction. The parent's amount is always the signed sum of its items:
 * a zero total is valid, a negative total is not, and individual items may be
 * negative (discounts/adjustments) without changing the parent's type.
 */

/** Signed sum of the breakdown items, in integer minor units. */
export function computeBreakdownTotal(items) {
  return (items ?? []).reduce((total, item) => total + item.amount, 0);
}

/** Trim descriptions and drop nothing else; the repository stores what this returns. */
export function normalizeBreakdownItems(items) {
  return (items ?? []).map((item) => ({
    id: item.id,
    description: String(item.description ?? '').trim(),
    amount: item.amount,
  }));
}

/**
 * Validate a normalized, ordered item list. Returns an error message or null.
 * Order is never validated for uniqueness beyond position assignment in the
 * repository: reordering must not change the total, only the persisted
 * position of the same items.
 */
export function breakdownValidationError(items) {
  if (items.length === 0) return null;
  for (const item of items) {
    if (!item.description) return 'Every breakdown item needs a description.';
    if (!Number.isInteger(item.amount)) {
      return 'Breakdown amounts must be whole minor units.';
    }
  }
  if (computeBreakdownTotal(items) < 0) {
    return 'The breakdown total cannot be negative.';
  }
  return null;
}

/**
 * Build the complete child set for storage from a validated, ordered item
 * list: stable ids (reuse the incoming one, mint a new one otherwise) and a
 * persisted 0-based position. Duplicate flows pass items without ids so every
 * copy mints fresh ones.
 */
export function prepareBreakdownRows(items, { createId, timestamp }) {
  return items.map((item, index) => ({
    id: item.id ?? createId('subtx'),
    description: item.description,
    amount: item.amount,
    position: index,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}
