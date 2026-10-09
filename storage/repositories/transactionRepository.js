import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';

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

const SEARCH_RESULT_LIMIT = 30;

/**
 * Case-insensitive substring search across every budget, on transaction
 * descriptions and tag names. Rows come back newest first and carry an
 * embedded `tag` object (or null) so result lists can render without a
 * second query.
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
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('Enter an amount greater than zero.');
  }
  if (type !== 'transfer' && !input.tagId) {
    throw new Error('Choose a tag for this transaction.');
  }

  await storage.insertTransaction({
    id,
    budget_id: input.budgetId,
    type,
    amount: input.amount,
    tag_id: input.tagId ?? null,
    account_id: input.accountId ?? null,
    to_account_id: input.toAccountId ?? null,
    description: input.description ?? null,
    transaction_date: input.date ?? '',
    created_at: timestamp,
    updated_at: timestamp,
  });

  return storage.getTransaction(id);
}

export async function updateTransaction(id, input) {
  const existing = await storage.getTransaction(id);
  if (!existing) throw new Error('That transaction no longer exists.');

  const type = input.type === undefined ? existing.type : input.type;
  const amount = input.amount === undefined ? existing.amount : input.amount;
  const tagId = input.tagId === undefined ? existing.tag_id : input.tagId;
  const description =
    input.description === undefined ? existing.description : input.description;
  const date = input.date === undefined ? existing.transaction_date : input.date;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Enter an amount greater than zero.');
  }
  if (type !== 'transfer' && !tagId) {
    throw new Error('Choose a tag for this transaction.');
  }

  await storage.updateTransaction({
    id,
    type,
    amount,
    tag_id: tagId || null,
    description: description || null,
    transaction_date: date,
    updated_at: nowIso(),
  });

  return storage.getTransaction(id);
}

export async function deleteTransaction(id) {
  return storage.deleteTransaction(id);
}
