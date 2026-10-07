import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';
import { REPAYMENT_DIRECTIONS, REPAYMENT_STATUSES } from '../../constants/finance';
import { isValidLocalDate } from '../../utils/reminders';

export async function getTransactionsForBudget(budgetId) {
  return storage.listTransactionsByBudget(budgetId);
}

export async function getTransaction(id) {
  return storage.getTransaction(id);
}

/**
 * Repayments waiting to be settled across every budget, earliest due date
 * first. Used by the Home money-owed list.
 */
export async function getRepayments(status = 'pending') {
  return storage.listRepayments({ status });
}

/**
 * Repayment fields are derived from one another: no direction means the
 * entry is not a repayment at all (and carries no due date or status), while
 * a direction always needs a due date and starts out pending. Transfers move
 * money between accounts, so they can never be a repayment.
 */
function resolveRepayment(type, input, existing = {}) {
  const rawDirection = input.repaymentDirection === undefined
    ? existing.repayment_direction ?? null
    : input.repaymentDirection || null;
  const direction = type === 'transfer' ? null : rawDirection;

  if (direction && !REPAYMENT_DIRECTIONS.includes(direction)) {
    throw new Error('Choose whether the money is owed to you or by you.');
  }

  let dueDate = input.dueDate === undefined ? existing.due_date ?? null : input.dueDate || null;
  if (!direction) {
    return { direction: null, dueDate: null, status: null, paidAt: null };
  }
  if (!isValidLocalDate(dueDate)) throw new Error('Pick a due date for this repayment.');

  const previousDirection = existing.repayment_direction ?? null;
  const previousStatus = existing.repayment_status ?? null;
  const previousPaidAt = existing.paid_at ?? null;

  // Switching direction means a different obligation, so it starts over.
  const status = previousDirection === direction && previousStatus ? previousStatus : 'pending';
  const paidAt = status === 'paid' ? previousPaidAt ?? nowIso() : null;
  return { direction, dueDate, status, paidAt };
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

  const repayment = resolveRepayment(type, input);

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
    repayment_direction: repayment.direction,
    repayment_status: repayment.status,
    due_date: repayment.dueDate,
    paid_at: repayment.paidAt,
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

  const repayment = resolveRepayment(type, input, existing);

  await storage.updateTransaction({
    id,
    type,
    amount,
    tag_id: tagId || null,
    description: description || null,
    transaction_date: date,
    repayment_direction: repayment.direction,
    repayment_status: repayment.status,
    due_date: repayment.dueDate,
    paid_at: repayment.paidAt,
    updated_at: nowIso(),
  });

  return storage.getTransaction(id);
}

/**
 * Explicit settlement only: a due date that has passed never marks anything
 * paid by itself, so the recorded state can only change when the user says so.
 */
export async function setRepaymentStatus(id, status) {
  if (!REPAYMENT_STATUSES.includes(status)) {
    throw new Error('Unknown repayment status.');
  }
  const existing = await storage.getTransaction(id);
  if (!existing) throw new Error('That transaction no longer exists.');
  if (!existing.repayment_direction) {
    throw new Error('Only a repayment can be marked paid.');
  }

  await storage.updateTransaction({
    ...existing,
    repayment_status: status,
    paid_at: status === 'paid' ? nowIso() : null,
    updated_at: nowIso(),
  });

  return storage.getTransaction(id);
}

export async function deleteTransaction(id) {
  return storage.deleteTransaction(id);
}
