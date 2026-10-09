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
 * Planned-first: recording an expected expense should not imply it was paid.
 */
export function defaultPaymentStatus(value) {
  return isValidPaymentStatus(value) ? value : 'unpaid';
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
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
];
