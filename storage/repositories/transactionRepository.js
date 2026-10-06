import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';

export async function getTransactionsForBudget(budgetId) {
  return storage.listTransactionsByBudget(budgetId);
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

export async function deleteTransaction(id) {
  return storage.deleteTransaction(id);
}
