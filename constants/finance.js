export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'];

export const TRANSACTION_TYPE_LABELS = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
};

/**
 * Repayments describe money that is owed rather than new money movement:
 * `owed_to_me` is a receivable (someone pays the user back), `owed_by_me` is
 * a payable (the user owes someone). A NULL direction means the transaction is
 * not a repayment at all.
 */
export const REPAYMENT_DIRECTIONS = ['owed_to_me', 'owed_by_me'];

export const REPAYMENT_DIRECTION_LABELS = {
  none: 'Not a repayment',
  owed_to_me: 'Owed to me',
  owed_by_me: 'I owe',
};

export const REPAYMENT_STATUSES = ['pending', 'paid'];

export const REPAYMENT_STATUS_LABELS = {
  pending: 'Payment Pending',
  paid: 'Paid',
};

export const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'credit_card', 'savings'];

export const ACCOUNT_TYPE_LABELS = {
  cash: 'Cash',
  bank: 'Bank',
  ewallet: 'E-Wallet',
  credit_card: 'Credit Card',
  savings: 'Savings',
};

/**
 * The default tag library. Tags are a single reusable library rather than
 * something each budget owns, so these seed once and apply everywhere.
 */
export const DEFAULT_TAGS = [
  { key: 'household', name: 'Household', emoji: '🏠', color: '#0F6B4B' },
  { key: 'car', name: 'Car', emoji: '🚗', color: '#1F5FA8' },
  { key: 'daily-expenses', name: 'Daily Expenses', emoji: '🛒', color: '#A96600' },
  { key: 'work', name: 'Work', emoji: '💼', color: '#6B3FA0' },
  { key: 'travel', name: 'Travel', emoji: '✈️', color: '#0F7A8C' },
  { key: 'education', name: 'Education', emoji: '🎓', color: '#8C2F5C' },
];

/**
 * A small fixed set for picking a tag icon. Deliberately a fixed list rather
 * than an icon browser, so adding a tag stays a single-tap decision.
 */
export const TAG_EMOJI_CHOICES = [
  '🏠', '🚗', '🛒', '💼', '✈️', '🎓',
  '🍔', '☕️', '💡', '🎮', '🎬', '🎵',
  '🏥', '💊', '🎁', '🐾', '👶', '🧾',
  '💰', '📦', '🛠️', '🚲', '🏋️', '🏷️',
];

export const DEFAULT_TAG_EMOJI = '🏷️';