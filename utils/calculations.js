import { BUDGET_WARNING_RATIO, BUDGET_STATUS } from '../constants/finance';

/**
 * Every financial calculation lives here so that no screen ever re-implements
 * business rules. All amounts are integer minor units.
 *
 * Core rule: transfers move money between accounts and must never affect
 * income, expenses, or total assets.
 */

export function computeAccountBalance(account, transactions) {
  let balance = account?.initial_balance ?? 0;

  for (const transaction of transactions) {
    const isSource = transaction.account_id === account.id;
    const isDestination = transaction.type === 'transfer' && transaction.to_account_id === account.id;

    if (isSource) {
      if (transaction.type === 'income') balance += transaction.amount;
      else if (transaction.type === 'expense') balance -= transaction.amount;
      else if (transaction.type === 'transfer') balance -= transaction.amount;
    }

    if (isDestination) balance += transaction.amount;
  }

  return balance;
}

export function computeTotalAssets(accounts, transactions) {
  return accounts.reduce(
    (total, account) => total + computeAccountBalance(account, transactions),
    0,
  );
}

/** Income and expense totals. Transfers are deliberately excluded. */
export function computeTotals(transactions) {
  let income = 0;
  let expense = 0;

  for (const transaction of transactions) {
    if (transaction.type === 'income') income += transaction.amount;
    else if (transaction.type === 'expense') expense += transaction.amount;
  }

  return { income, expense, net: income - expense };
}

export function computeBudgetStatus({ amount, spent }) {
  const budget = amount ?? 0;
  const ratio = budget > 0 ? spent / budget : 0;

  let status = BUDGET_STATUS.ok;
  if (budget > 0 && spent > budget) status = BUDGET_STATUS.over;
  else if (ratio >= BUDGET_WARNING_RATIO) status = BUDGET_STATUS.warning;

  return {
    amount: budget,
    spent,
    remaining: budget - spent,
    ratio,
    percent: Math.round(ratio * 100),
    status,
  };
}

/** Expense spend per category, used by the budget screen and dashboard. */
export function computeSpendByCategory(transactions, categories = []) {
  const totals = new Map(categories.map((category) => [category.id, 0]));

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const key = transaction.category_id;
    totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
  }

  return categories
    .map((category) => ({ category, spent: totals.get(category.id) ?? 0 }))
    .sort((a, b) => b.spent - a.spent);
}

export function computeRemainingOverallBudget({ budgetAmount, spent }) {
  return Math.max(0, computeBudgetStatus({ amount: budgetAmount, spent }).remaining);
}

export function sumAmounts(items, selectAmount = (item) => item.amount) {
  return items.reduce((total, item) => total + selectAmount(item), 0);
}