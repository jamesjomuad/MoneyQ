import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';
import { defaultPaymentStatus, effectivePaymentStatus } from '../../utils/paymentStatus';
import {
  breakdownValidationError,
  computeBreakdownTotal,
  isIsoCalendarDate,
  normalizeBreakdownItems,
  prepareBreakdownRows,
} from '../../utils/breakdown';

export async function getTransactionsForBudget(budgetId) {
  return storage.listTransactionsByBudget(budgetId);
}

/** Inclusive 'YYYY-MM-DD' bounds; used by the calendar to load one month. */
export async function getTransactionsInRange(startIso, endIso) {
  return storage.listTransactionsInRange(startIso, endIso);
}

export async function getTransaction(id) {
  return storage.getTransaction(id);
}

/**
 * Breakdown items of one budget in a single read, grouped by parent id in
 * persisted order — list screens hydrate every count without one query per
 * transaction.
 */
export async function getSubTransactionsForBudget(budgetId) {
  const rows = await storage.listSubTransactionsByBudget(budgetId);
  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.transaction_id)) byParent.set(row.transaction_id, []);
    byParent.get(row.transaction_id).push(row);
  }
  return byParent;
}

/** One transaction's items in persisted order. */
export async function getSubTransactions(transactionId) {
  return storage.listSubTransactionsByParent(transactionId);
}

/**
 * Items of many parents in a single read, grouped by parent id in persisted
 * order — the Reports hydrator replaces its former one-query-per-row loop.
 */
export async function getSubTransactionsForParents(transactionIds) {
  const rows = await storage.listSubTransactionsForParents(transactionIds);
  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.transaction_id)) byParent.set(row.transaction_id, []);
    byParent.get(row.transaction_id).push(row);
  }
  return byParent;
}

/**
 * Purchase events for a date range: breakdown items whose own purchase_date
 * falls inside the bounds, joined with just enough parent context (type,
 * tag, budget, description) for the Calendar and the purchase-date reports.
 * These are never financial transactions — they are views of the parent's
 * already-counted amount.
 */
export async function getBreakdownItemsInRange(startIso, endIso) {
  return storage.listSubTransactionsInRange(startIso, endIso);
}

/** Parents due inside a date range — the Calendar's payment events. */
export async function getTransactionsByDueDateRange(startIso, endIso) {
  return storage.listTransactionsByDueDateRange(startIso, endIso);
}

/**
 * Payment due date rule: optional, date-only, and a real calendar day — the
 * repository never infers it from the budget end date and never stores a
 * time. Clearing (null, '' or undefined-to-null) removes the scheduled
 * payment event without touching the parent or its breakdown.
 */
function resolvePaymentDueDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!isIsoCalendarDate(text)) {
    throw new Error('Payment due date must be a real calendar date (YYYY-MM-DD).');
  }
  return text;
}

const SEARCH_RESULT_LIMIT = 30;

/**
 * Receipt attachment rule: the reference is either NULL or the
 * document-relative path of a file the app itself wrote into its receipts
 * folder (`receipts/<name>.<ext>` — see services/receiptFiles.js).
 * Absolute URIs, cache paths and traversal are rejected here so a stored
 * row can never point outside app-managed storage. An update that does not
 * mention the receipt keeps whatever the row already had.
 */
const RECEIPT_PATH_RE = /^receipts\/[\w.-]+$/;

function resolveReceiptPath(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!RECEIPT_PATH_RE.test(text)) {
    throw new Error('The receipt reference is not valid.');
  }
  return text;
}

/**
 * Payment status rules. Only expenses have one; income and transfers always
 * store NULL. A new expense defaults to 'paid' unless the caller says
 * otherwise, and an update that does not mention the status keeps whatever
 * the stored expense already had.
 */
function resolveNewPaymentStatus(type, requested) {
  if (type !== 'expense') return null;
  return defaultPaymentStatus(requested);
}

function resolveUpdatedPaymentStatus(type, existing, input) {
  if (type !== 'expense') return null;
  const requested = input.paymentStatus;
  if (requested === undefined || requested === null) {
    // Not mentioned: a stored expense keeps its status (missing or invalid
    // historical values read as 'paid'); an income/transfer becoming an
    // expense starts 'paid'.
    return existing.type === 'expense' ? effectivePaymentStatus(existing) : 'paid';
  }
  return defaultPaymentStatus(requested);
}

/**
 * Breakdown rules, resolved authoritatively here — never only in the UI.
 * Returns { hasBreakdown, items, amount } or throws:
 *
 *  - A breakdown belongs to income or expense only; transfers are excluded.
 *  - The parent amount is the signed sum of the items — the caller's amount
 *    is ignored while a breakdown is active, because the parent amount is
 *    read-only then.
 *  - A zero total is valid (empty breakdown included); a negative total is
 *    rejected outright, never clamped.
 *  - An edit that keeps a breakdown without resending its items re-reads the
 *    stored items, so metadata edits preserve the breakdown and its total.
 */
async function resolveBreakdown(type, existing, input) {
  const hasBreakdown =
    input.hasBreakdown === undefined ? Boolean(existing?.has_breakdown) : Boolean(input.hasBreakdown);

  if (!hasBreakdown) {
    if (input.subTransactions !== undefined && input.subTransactions.length > 0) {
      throw new Error('Only breakdown transactions can carry breakdown items.');
    }
    return { hasBreakdown: false, items: null, amount: undefined };
  }

  if (type === 'transfer') {
    throw new Error('Breakdowns are only available for income and expenses.');
  }

  let items;
  if (input.subTransactions === undefined && existing) {
    const stored = await storage.listSubTransactionsByParent(existing.id);
    items = normalizeBreakdownItems(stored);
  } else {
    items = normalizeBreakdownItems(input.subTransactions ?? []);
  }

  const error = breakdownValidationError(items);
  if (error) throw new Error(error);

  const total = computeBreakdownTotal(items);
  if (total < 0) throw new Error('The breakdown total cannot be negative.');

  return { hasBreakdown: true, items, amount: total };
}

/**
 * Writes one parent row plus its complete, ordered child set inside a single
 * SQL transaction. If any step fails the whole group rolls back, so a
 * breakdown can never end up half-written. The caller has already validated
 * and recomputed the parent amount. `rewriteChildren` clears and re-inserts
 * the items; a metadata-only save passes false so the stored breakdown is
 * preserved untouched.
 */
async function writeTransactionWithBreakdown({ id, existing, row, items, rewriteChildren }) {
  await storage.beginTransaction();
  try {
    if (existing) {
      await storage.updateTransaction(row);
      if (rewriteChildren) await storage.deleteSubTransactionsForParent(id);
    } else {
      await storage.insertTransaction(row);
    }
    if (rewriteChildren || !existing) {
      for (const item of items) {
        await storage.insertSubTransaction({
          id: item.id ?? createId('subtx'),
          transaction_id: id,
          description: item.description,
          amount: item.amount,
          position: item.position,
          purchase_date: item.purchase_date ?? null,
          purchase_time: item.purchase_time ?? null,
          notes: item.notes ?? null,
          created_at: item.created_at,
          updated_at: item.updated_at,
        });
      }
    }
    await storage.commitTransaction();
  } catch (error) {
    try {
      await storage.rollbackTransaction();
    } catch {
      // The engine already discarded the group (or the rollback itself
      // failed); the original error is the one callers need to see.
    }
    throw error;
  }
}

/**
 * Case-insensitive substring search across every budget, on transaction
 * descriptions, tag names, and breakdown item descriptions. A child match
 * returns its parent row (description, total, item count) — never the child
 * as its own result. Rows come back newest first and carry an embedded `tag`
 * object (or null) so result lists can render without a second query.
 */
export async function searchTransactions(query) {
  const term = (query ?? '').trim();
  if (term.length === 0) return [];
  const rows = await storage.searchTransactions(term, SEARCH_RESULT_LIMIT);
  return rows.map((row) => ({
    ...row,
    tag: row.tag_name
      ? { id: row.tag_id, name: row.tag_name, emoji: row.tag_emoji, color: row.tag_color }
      : null,
  }));
}

export async function createTransaction(input) {
  const id = createId('tx');
  const timestamp = nowIso();
  const type = input.type ?? 'expense';

  if (!input.budgetId) throw new Error('A transaction needs a budget.');

  const breakdown = await resolveBreakdown(type, null, input);

  let amount = input.amount;
  if (breakdown.hasBreakdown) {
    amount = breakdown.amount;
  } else if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Enter an amount greater than zero.');
  }
  if (type !== 'transfer' && !input.tagId) {
    throw new Error('Choose a tag for this transaction.');
  }

  const rows = breakdown.hasBreakdown
    ? prepareBreakdownRows(breakdown.items, { createId, timestamp })
    : [];

  await writeTransactionWithBreakdown({
    id,
    existing: null,
    row: {
      id,
      budget_id: input.budgetId,
      type,
      amount,
      tag_id: input.tagId ?? null,
      account_id: input.accountId ?? null,
      to_account_id: input.toAccountId ?? null,
      description: input.description ?? null,
      transaction_date: input.date ?? '',
      payment_status: resolveNewPaymentStatus(type, input.paymentStatus),
      has_breakdown: breakdown.hasBreakdown ? 1 : 0,
      payment_due_date: resolvePaymentDueDate(input.paymentDueDate),
      receipt_path: resolveReceiptPath(input.receiptPath),
      created_at: timestamp,
      updated_at: timestamp,
    },
    items: rows,
  });

  return storage.getTransaction(id);
}

export async function updateTransaction(id, input) {
  const existing = await storage.getTransaction(id);
  if (!existing) throw new Error('That transaction no longer exists.');

  const type = input.type === undefined ? existing.type : input.type;
  const tagId = input.tagId === undefined ? existing.tag_id : input.tagId;
  const description =
    input.description === undefined ? existing.description : input.description;
  const date = input.date === undefined ? existing.transaction_date : input.date;
  const paymentDueDate =
    input.paymentDueDate === undefined
      ? existing.payment_due_date ?? null
      : resolvePaymentDueDate(input.paymentDueDate);
  const receiptPath =
    input.receiptPath === undefined
      ? existing.receipt_path ?? null
      : resolveReceiptPath(input.receiptPath);

  const breakdown = await resolveBreakdown(type, existing, input);

  let amount = input.amount === undefined ? existing.amount : input.amount;
  if (breakdown.hasBreakdown) {
    // Read-only parent amount: the calculated total wins over anything sent.
    amount = breakdown.amount;
  } else if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Enter an amount greater than zero.');
  }
  if (type !== 'transfer' && !tagId) {
    throw new Error('Choose a tag for this transaction.');
  }

  const timestamp = nowIso();
  const rows = breakdown.hasBreakdown
    ? prepareBreakdownRows(breakdown.items, { createId, timestamp })
    : [];

  await writeTransactionWithBreakdown({
    id,
    existing,
    row: {
      id,
      type,
      amount,
      tag_id: tagId || null,
      description: description || null,
      transaction_date: date,
      payment_status: resolveUpdatedPaymentStatus(type, existing, input),
      has_breakdown: breakdown.hasBreakdown ? 1 : 0,
      payment_due_date: paymentDueDate,
      receipt_path: receiptPath,
      updated_at: timestamp,
    },
    // A metadata-only save (no breakdown mentioned) must not rewrite — or
    // wipe — the stored items; writeTransactionWithBreakdown only deletes
    // children when the breakdown is (re)written.
    items: breakdown.hasBreakdown ? rows : [],
    rewriteChildren: breakdown.hasBreakdown && input.subTransactions !== undefined,
  });

  return storage.getTransaction(id);
}

export async function deleteTransaction(id) {
  // SQLite cascades through the foreign key; the memory adapter mirrors the
  // cascade so no engine ever leaves orphan items behind.
  return storage.deleteTransaction(id);
}
