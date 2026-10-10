/**
 * Every financial calculation lives here so no screen re-implements business
 * rules. All amounts are integer minor units.
 *
 * Core rule: transfers move money between accounts and must never affect
 * income, expenses, or total assets. A Budget has no spending limit, so there
 * is no overspend state anywhere in this module: "spent" is always just the
 * expense transactions recorded against it.
 */

export function computeTotals(transactions) {
  let income = 0;
  let expense = 0;

  for (const transaction of transactions) {
    if (transaction.type === 'income') income += transaction.amount;
    else if (transaction.type === 'expense') expense += transaction.amount;
  }

  return {
    income,
    expense,
    remaining: income - expense,
    transactionCount: transactions.length,
  };
}

/**
 * Folder balance for one budget period: what it brought in minus what it spent,
 * in the same minor units as everything else. Negative is valid and simply
 * means the period spent more than it earned.
 */
export function computeBudgetBalance(income = 0, spent = 0) {
  return income - spent;
}

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

/**
 * Expense spend per tag, keyed by tag id. Only expenses count, so income and
 * transfers never inflate a tag's total.
 */
export function computeSpendByTag(transactions, tags = []) {
  const totals = new Map();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    if (!transaction.tag_id) continue;
    totals.set(transaction.tag_id, (totals.get(transaction.tag_id) ?? 0) + transaction.amount);
  }

  return tags.map((tag) => ({
    tag,
    spent: totals.get(tag.id) ?? 0,
  }));
}

/**
 * Per-tag budget breakdown in one pass: signed amount, expense amount, and
 * each tag's expense share of the budget's total expenses. Income counts as a
 * positive signed amount, expense counts as a negative signed amount and also
 * contributes to its expense share, and transfers never count — the same
 * transfer rule as computeTotals. `computeSpendByTag` stays expense-only for
 * reports. A zero total expense, missing tag reference, or tag with no
 * transactions safely produces 0%.
 */
export function computeTagExpenseBreakdown(transactions, tags = [], totalExpense = 0) {
  const signedTotals = new Map();
  const expenseTotals = new Map();

  for (const transaction of transactions) {
    if (!transaction.tag_id) continue;

    if (transaction.type === 'income') {
      signedTotals.set(transaction.tag_id, (signedTotals.get(transaction.tag_id) ?? 0) + transaction.amount);
    } else if (transaction.type === 'expense') {
      const current = expenseTotals.get(transaction.tag_id) ?? 0;
      expenseTotals.set(transaction.tag_id, current + transaction.amount);
      signedTotals.set(transaction.tag_id, (signedTotals.get(transaction.tag_id) ?? 0) - transaction.amount);
    }
  }

  return tags.map((tag) => {
    const expense = expenseTotals.get(tag.id) ?? 0;
    return {
      tag,
      spent: signedTotals.get(tag.id) ?? 0,
      expense,
      expensePercent: totalExpense > 0 ? (expense / totalExpense) * 100 : 0,
    };
  });
}

/**
 * Ids of every tag actually referenced by a transaction in the given set,
 * across income and expense alike. Used to hide tags a budget never touches:
 * membership here is decided by real transaction references, never by whether
 * a tag merely exists in the global library. Transactions with no tag, or with
 * a tag that no longer resolves, contribute nothing and can't crash a lookup.
 */
export function collectUsedTagIds(transactions) {
  const ids = new Set();

  for (const transaction of transactions) {
    if (transaction.tag_id) ids.add(transaction.tag_id);
  }

  return ids;
}

/** Groups transactions by date, preserving the order they were passed in. */
export function groupByDate(transactions) {
  const groups = new Map();

  for (const transaction of transactions) {
    const key = transaction.transaction_date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(transaction);
  }

  return Array.from(groups, ([date, items]) => ({ date, items }));
}

export function sumAmounts(items, selectAmount = (item) => item.amount) {
  return items.reduce((total, item) => total + selectAmount(item), 0);
}