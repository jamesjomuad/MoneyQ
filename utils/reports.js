import { computeSpendByTag, computeTotals } from './calculations';
import {
  addDaysIso,
  addMonths,
  currentMonthKey,
  daysInclusive,
  formatDate,
  formatMonth,
  formatShortDate,
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
  { value: 'custom', label: 'Custom' },
];

/** Inclusive storage bounds plus a display label for one report filter. */
export function periodRange(filter, custom = null) {
  const now = new Date();

  if (filter === 'custom') {
    const rawStart = custom?.start ?? `${now.getFullYear()}-01-01`;
    const rawEnd = custom?.end ?? toIsoDate(now);
    const start = rawStart <= rawEnd ? rawStart : rawEnd;
    const end = rawStart <= rawEnd ? rawEnd : rawStart;
    return { start, end, label: `${formatShortDate(start)} – ${formatShortDate(end)}` };
  }

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
export function buildBarGroups(transactions, filter, period = null) {
  if (filter !== 'thisYear') {
    const { income, expense } = computeTotals(transactions);
    return [{ label: (period ?? periodRange(filter)).label, income, expense }];
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

/**
 * View granularity for the expenses-over-time chart, anchored to the page's
 * period filter so the screen needs only one filter control. Custom ranges
 * pick their own granularity from the span: daily up to ~6 weeks, monthly
 * up to ~2 years, yearly beyond.
 */
export function trendForFilter(filter, period = null) {
  if (filter === 'lastMonth') return { view: 'monthly', offset: -1 };
  if (filter === 'thisYear') return { view: 'yearly', offset: 0 };
  if (filter === 'custom') {
    const range = period ?? periodRange('custom');
    const days = daysInclusive(range.start, range.end);
    const view = days <= 45 ? 'monthly' : days <= 750 ? 'months' : 'allTime';
    return { view, offset: 0, range };
  }
  return { view: 'monthly', offset: 0 };
}

/**
 * Inclusive range for the expenses-over-time chart. `offset` is whole view
 * units back from the current one (0 = current); positive offsets would be
 * future periods and are clamped away — the chart never browses forward of
 * today. Custom ranges skip this entirely and use the filter's own bounds.
 */
export function trendRange(view, offset = 0) {
  const clamped = Math.min(offset, 0);
  const now = new Date();

  if (view === 'allTime') {
    return { view, start: '0000-01-01', end: toIsoDate(now), label: 'All time' };
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

  const monthKey = addMonths(currentMonthKey(), clamped);
  const { start, end } = monthRange(monthKey);
  return { view, start, end, label: formatMonth(monthKey) };
}

/**
 * Expense totals per day (monthly), per calendar month (yearly/months), or
 * per calendar year (allTime) for one trend range. Every expense row is
 * counted exactly once by its local transaction_date; income and transfers
 * are skipped. Periods with no spend still appear with amount 0 so gaps
 * stay visible.
 */
export function buildTrendBuckets(view, range, transactions) {
  const dayTotals = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const iso = String(transaction.transaction_date);
    if (!isWithin(iso, range.start, range.end)) continue;
    dayTotals.set(iso, (dayTotals.get(iso) ?? 0) + transaction.amount);
  }

  if (view === 'allTime' || view === 'yearly' || view === 'months') {
    const keyLength = view === 'allTime' ? 4 : 7;
    const periodTotals = new Map();
    for (const [iso, amount] of dayTotals) {
      const key = iso.slice(0, keyLength);
      periodTotals.set(key, (periodTotals.get(key) ?? 0) + amount);
    }

    if (view === 'allTime') {
      const years = Array.from(periodTotals.keys()).sort();
      if (years.length === 0) return [];
      const first = Number(years[0]);
      const last = Math.min(Number(years[years.length - 1]), new Date().getFullYear());
      return Array.from({ length: Math.max(last - first + 1, 0) }, (_, index) => {
        const label = String(first + index);
        return {
          id: label,
          shortLabel: label,
          periodLabel: label,
          amount: periodTotals.get(label) ?? 0,
        };
      });
    }

    if (view === 'months') {
      const keys = [];
      let key = range.start.slice(0, 7);
      const lastKey = range.end.slice(0, 7);
      while (key <= lastKey) {
        keys.push(key);
        key = addMonths(key, 1);
      }
      return keys.map((monthKey) => ({
        id: monthKey,
        shortLabel: formatMonth(monthKey, { style: 'short' }).slice(0, 3),
        periodLabel: formatMonth(monthKey),
        amount: periodTotals.get(monthKey) ?? 0,
      }));
    }

    const year = range.start.slice(0, 4);
    return Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, '0')}`;
      return {
        id: key,
        shortLabel: formatMonth(key, { style: 'short' }).slice(0, 3),
        periodLabel: formatMonth(key),
        amount: periodTotals.get(key) ?? 0,
      };
    });
  }

  const days = daysInclusive(range.start, range.end);
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
