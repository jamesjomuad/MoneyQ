import { computeBudgetBalance } from './calculations';
import { derivePaymentEventStatus } from './paymentStatus';

/**
 * What Home's Needs Attention list may contain. Both rules read money that has
 * actually moved or a due date that has actually passed — never how much of a
 * budget period has elapsed. A Budget holds transactions rather than capping
 * them, so spending ahead of received income is the only financial condition a
 * budget can raise.
 *
 * `budget.income` counts received money only (see `computeTotals`), so unpaid
 * income cannot make a budget look safer than it is. Archived budgets never
 * reach these rules: `getBudgets` returns active rows only.
 */
export function attentionBudgets(budgets = []) {
  return budgets
    .map((budget) => ({
      budget,
      remaining: computeBudgetBalance(budget.income ?? 0, budget.spent ?? 0),
    }))
    .filter((row) => (row.budget.income ?? 0) > 0 && row.remaining < 0)
    .sort((a, b) => a.remaining - b.remaining);
}

/**
 * An unpaid payment whose due date has passed. Upcoming and due-today
 * payments are reminders of what is next, not alarms; the due-date read that
 * feeds this list reaches back a month so an overdue row stays in view.
 */
export function overduePayments(payments = [], todayIso) {
  return payments
    .filter((entry) => derivePaymentEventStatus(entry, todayIso) === 'overdue')
    .sort((a, b) => a.payment_due_date.localeCompare(b.payment_due_date));
}
