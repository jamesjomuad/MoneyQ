import { computeSpendByTag, computeTotals } from './calculations';
import {
  addDaysIso,
  addMonths,
  currentMonthKey,
  formatDate,
  formatDateRange,
  formatMonth,
  isWithin,
  monthRange,
  parseIsoDate,
  toIsoDate,
} from './dates';

/**
 * Report period maths lives here so the Reports store and charts all read
 * from one set of rules. Dates are local 'YYYY-MM-DD' strings via
 * utils/dates.js — never toISOString(), which would shift days.
 */
export const REPORT_PERIODS = [
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'allTime', label: 'All Time' },
];

/** Inclusive storage bounds plus a display label for one report filter. */
export function periodRange(filter) {
  const now = new Date();

  if (filter === 'lastMonth') {
    const monthKey = addMonths(currentMonthKey(), -1);
    const { start, end } = monthRange(monthKey);
    return { start, end, label: formatMonth(monthKey) };
  }

  if (filter === 'thisYear') {
    const year = now.getFullYear();
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: String(year),
    };
  }

  if (filter === 'allTime') {
    return { start: '0000-01-01', end: '9999-12-31', label: 'All time' };
  }

  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);
  return { start, end, label: formatMonth(monthKey) };
}

/** 'YYYY-MM' keys covering a range, capped at the current month. */
function monthKeysBetween(startIso, endIso) {
  const startKey = String(startIso).slice(0, 7);
  const endKey = String(endIso).slice(0, 7);
  const thisMonthKey = toIsoDate(new Date()).slice(0, 7);
  const lastRelevant = endKey < thisMonthKey ? endKey : thisMonthKey;

  const keys = [];
  let key = startKey;
  while (key <= lastRelevant) {
    keys.push(key);
    key = addMonths(key, 1);
  }
  return keys.length > 0 ? keys : [startKey];
}

/**
 * Groups for the income-vs-expense bars. 'thisYear' becomes one grouped
 * pair of bars per month (through the current month); every other filter
 * collapses to a single pair. Transfers never count, because
 * computeTotals only reads income and expense rows.
 */
export function buildBarGroups(transactions, filter) {
  if (filter !== 'thisYear') {
    const { income, expense } = computeTotals(transactions);
    return [{ label: periodRange(filter).label, income, expense }];
  }

  const byMonth = new Map();
  for (const transaction of transactions) {
    const key = String(transaction.transaction_date).slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(transaction);
  }

  return monthKeysBetween(periodRange(filter).start, periodRange(filter).end).map((key) => {
    const totals = computeTotals(byMonth.get(key) ?? []);
    return { label: formatMonth(key, { style: 'short' }).slice(0, 3), income: totals.income, expense: totals.expense };
  });
}

/**
 * Expense share per tag for the pie: only tags with spend appear, sorted
 * highest first, each carrying a percent of total expenses (0..100).
 */
export function buildTagSlices(transactions, tags) {
  const rows = computeSpendByTag(transactions, tags)
    .filter((row) => row.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  const total = rows.reduce((sum, row) => sum + row.spent, 0);

  return rows.map((row) => ({
    ...row,
    percent: total > 0 ? (row.spent / total) * 100 : 0,
  }));
}

/** Percent label: whole numbers above 10%, one decimal below so slivers stay visible. */
export function formatPercent(percent) {
  if (!Number.isFinite(percent) || percent <= 0) return '0%';
  if (percent >= 10) return `${Math.round(percent)}%`;
  return `${percent.toFixed(1)}%`;
}

export const TREND_VIEWS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const WEEK_BAR_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Inclusive range for the expenses-over-time chart. `offset` is whole view
 * units back from the current one (0 = current); positive offsets would be
 * future periods and are clamped away — the chart never browses forward of
 * today. Weeks start on Monday, local dates only.
 */
export function trendRange(view, offset = 0) {
  const clamped = Math.min(offset, 0);
  const now = new Date();

  if (view === 'monthly') {
    const monthKey = addMonths(currentMonthKey(), clamped);
    const { start, end } = monthRange(monthKey);
    return { view, start, end, label: formatMonth(monthKey) };
  }

  if (view === 'yearly') {
    const year = now.getFullYear() + clamped;
    return {
      view,
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: String(year),
    };
  }

  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const start = addDaysIso(toIsoDate(monday), clamped * 7);
  const end = addDaysIso(start, 6);
  return { view, start, end, label: formatDateRange(start, end) };
}

/**
 * Expense totals per day (weekly/monthly) or per month (yearly) for one
 * trend range. Every expense row is counted exactly once by its local
 * transaction_date; income and transfers are skipped. Periods with no spend
 * still appear with amount 0 so gaps stay visible.
 */
export function buildTrendBuckets(view, range, transactions) {
  const dayTotals = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const iso = String(transaction.transaction_date);
    if (!isWithin(iso, range.start, range.end)) continue;
    dayTotals.set(iso, (dayTotals.get(iso) ?? 0) + transaction.amount);
  }

  if (view === 'yearly') {
    const year = range.start.slice(0, 4);
    const monthTotals = new Map();
    for (const [iso, amount] of dayTotals) {
      const key = iso.slice(0, 7);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + amount);
    }
    return Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, '0')}`;
      return {
        id: key,
        shortLabel: formatMonth(key, { style: 'short' }).slice(0, 3),
        periodLabel: formatMonth(key),
        amount: monthTotals.get(key) ?? 0,
      };
    });
  }

  if (view === 'monthly') {
    const days = parseIsoDate(range.end).getDate();
    return Array.from({ length: days }, (_, index) => {
      const iso = addDaysIso(range.start, index);
      return {
        id: iso,
        shortLabel: String(parseIsoDate(iso).getDate()),
        periodLabel: formatDate(iso),
        amount: dayTotals.get(iso) ?? 0,
      };
    });
  }

  return Array.from({ length: 7 }, (_, index) => {
    const iso = addDaysIso(range.start, index);
    return {
      id: iso,
      shortLabel: WEEK_BAR_LABELS[index],
      periodLabel: `${WEEK_BAR_LABELS[index]}, ${formatDate(iso)}`,
      amount: dayTotals.get(iso) ?? 0,
    };
  });
}
