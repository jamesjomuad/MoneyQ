export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'];

export const TRANSACTION_TYPE_LABELS = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
};

export const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'credit_card', 'savings'];

export const ACCOUNT_TYPE_LABELS = {
  cash: 'Cash',
  bank: 'Bank',
  ewallet: 'E-Wallet',
  credit_card: 'Credit Card',
  savings: 'Savings',
};

export const BUDGET_PERIODS = ['monthly'];

export const BUDGET_STATUS = {
  ok: 'ok',
  warning: 'warning',
  over: 'over',
};

export const BUDGET_WARNING_RATIO = 0.8;

export const DEFAULT_CATEGORIES = [
  { key: 'food', name: 'Food', color: '#B3261E', icon: 'restaurant' },
  { key: 'transportation', name: 'Transportation', color: '#1F5FA8', icon: 'directions_bus' },
  { key: 'utilities', name: 'Utilities', color: '#A96600', icon: 'bolt' },
  { key: 'shopping', name: 'Shopping', color: '#6B3FA0', icon: 'shopping_bag' },
  { key: 'entertainment', name: 'Entertainment', color: '#8C2F5C', icon: 'movie' },
  { key: 'health', name: 'Health', color: '#0F7A8C', icon: 'medical_services' },
  { key: 'education', name: 'Education', color: '#5C6B62', icon: 'school' },
  { key: 'bills', name: 'Bills', color: '#7A5C1F', icon: 'receipt_long' },
  { key: 'other', name: 'Other', color: '#8D9A92', icon: 'category' },
];