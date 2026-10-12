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

/**
 * Trim descriptions and notes and canonicalize the optional purchase
 * date/time; the repository stores what this returns. Empty strings become
 * null so a cleared note is really cleared everywhere.
 */
export function normalizeBreakdownItems(items) {
  return (items ?? []).map((item) => ({
    id: item.id,
    description: String(item.description ?? '').trim(),
    amount: item.amount,
    purchase_date: normalizeItemDate(item.purchase_date),
    purchase_time: normalizeItemTime(item.purchase_time),
    notes: String(item.notes ?? '').trim() || null,
  }));
}

/** 'YYYY-MM-DD' that names a real local day; anything else is not a date. */
export function isIsoCalendarDate(value) {
  const raw = String(value ?? '');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return (
    date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
  );
}

/** 24-hour 'HH:mm' — the same shape the app's time fields already store. */
export function isHhMm(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ''));
}

function normalizeItemDate(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizeItemTime(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
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
    if (item.purchase_date != null && !isIsoCalendarDate(item.purchase_date)) {
      return 'Breakdown purchase dates must be real calendar dates (YYYY-MM-DD).';
    }
    if (item.purchase_time != null && !isHhMm(item.purchase_time)) {
      return 'Breakdown purchase times must be 24-hour HH:mm.';
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
    purchase_date: item.purchase_date ?? null,
    purchase_time: item.purchase_time ?? null,
    notes: item.notes ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}
