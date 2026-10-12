/**
 * Payment status of an expense. It is deliberately separate from the
 * transaction `type`: an unpaid expense is still a recorded expense and
 * still counts toward every budget total. The status only answers "have I
 * handed the money over yet?".
 */
export const PAYMENT_STATUSES = ['unpaid', 'paid'];

export function isValidPaymentStatus(value) {
  return PAYMENT_STATUSES.includes(value);
}

/**
 * The status a NEW expense starts with when the caller does not choose one.
 * Paid-first: most recorded expenses are completed payments, so the default
 * should match the usual case while still allowing an expense to be marked
 * Unpaid.
 */
export function defaultPaymentStatus(value) {
  return isValidPaymentStatus(value) ? value : 'paid';
}

/**
 * How a stored row's status should be read. Missing or invalid values on an
 * expense fall back to 'paid' — transactions recorded before this field
 * existed behaved as paid (they moved money in every total), and nothing in
 * the UI may crash on an unexpected value. Income and transfers have no
 * payment status at all and return null.
 */
export function effectivePaymentStatus(row) {
  if (!row || row.type !== 'expense') return null;
  return isValidPaymentStatus(row.payment_status) ? row.payment_status : 'paid';
}

export const PAYMENT_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid', icon: 'clock' },
  { value: 'paid', label: 'Paid', icon: 'paid' },
];

/**
 * Payment events for the Calendar. A parent with a `payment_due_date` shows
 * one all-day event; its lifecycle label comes from the existing payment
 * status and the due date alone — never from the budget period or a child's
 * purchase date. Paid wins over everything: a paid commitment is 'Paid'
 * whether it settled early, on the day, or late.
 */
export const PAYMENT_EVENT_LABELS = {
  upcoming: 'Upcoming',
  dueToday: 'Due today',
  overdue: 'Overdue',
  paid: 'Paid',
};

/**
 * 'YYYY-MM-DD' comparison against a local today — ISO dates sort as strings,
 * and both sides are built by the same local-date rule, so no time zones are
 * involved. Returns null when the row has no due date or is not a financial
 * event the Calendar should surface.
 */
export function derivePaymentEventStatus(row, todayIso) {
  const due = row?.payment_due_date;
  if (!due) return null;
  if (row.type === 'expense' && effectivePaymentStatus(row) === 'paid') return 'paid';
  if (due < todayIso) return 'overdue';
  if (due === todayIso) return 'dueToday';
  return 'upcoming';
}
