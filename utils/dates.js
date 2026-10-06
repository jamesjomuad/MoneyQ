const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTH_NAMES = MONTH_NAMES.map((month) => month.slice(0, 3));

/**
 * All dates are stored as local 'YYYY-MM-DD' strings. Using toISOString() here
 * would shift the day for anyone west of UTC, which is a real bug for a
 * budgeting app, so the parts are read from the local Date getters instead.
 */
export function toIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso() {
  return toIsoDate(new Date());
}

/** 'YYYY-MM' key identifying a calendar month. */
export function monthKeyOf(date = new Date()) {
  return toIsoDate(date).slice(0, 7);
}

export function currentMonthKey() {
  return monthKeyOf(new Date());
}

export function monthRange(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  return {
    start: toIsoDate(firstDay),
    end: toIsoDate(lastDay),
    days: lastDay.getDate(),
  };
}

export function addMonths(monthKey, delta) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return monthKeyOf(shifted);
}

export function isWithin(isoDate, start, end) {
  return isoDate >= start && isoDate <= end;
}

export function formatDate(isoDate, { style = 'medium' } = {}) {
  if (!isoDate) return '';
  const date = parseIsoDate(isoDate);
  const day = date.getDate();
  const month = style === 'short' ? SHORT_MONTH_NAMES[date.getMonth()] : MONTH_NAMES[date.getMonth()];
  if (style === 'short') return `${month} ${day}`;
  return `${month} ${day}, ${date.getFullYear()}`;
}

export function formatMonth(monthKey, { style = 'long' } = {}) {
  if (!monthKey) return '';
  const [year, month] = String(monthKey).split('-').map(Number);
  const name = style === 'short' ? SHORT_MONTH_NAMES[month - 1] : MONTH_NAMES[month - 1];
  return style === 'short' ? `${name} ${year}` : `${name} ${year}`;
}

export function toMonthKey(isoDate) {
  return String(isoDate).slice(0, 7);
}

/** 'Today', 'Yesterday' or a formatted date, for grouping transaction lists. */
export function dayLabel(isoDate, reference = new Date()) {
  if (isoDate === toIsoDate(reference)) return 'Today';
  const yesterday = new Date(reference);
  yesterday.setDate(reference.getDate() - 1);
  if (isoDate === toIsoDate(yesterday)) return 'Yesterday';
  return formatDate(isoDate);
}

/** 'Oct 1, 2026' */
export function formatShortDate(isoDate) {
  return formatDate(isoDate, { style: 'short' });
}

/** 'Oct 1 – Oct 31, 2026', falling back to two full dates across a year break. */
export function formatDateRange(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  const span = { month: 'short', day: 'numeric' };

  if (start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString(undefined, span)} – ${end.toLocaleDateString(undefined, { ...span, year: 'numeric' })}`;
  }

  return `${start.toLocaleDateString(undefined, { ...span, year: 'numeric' })} – ${end.toLocaleDateString(undefined, { ...span, year: 'numeric' })}`;
}

/**
 * A sensible default Budget for a given month offset from now:
 *   -1 -> last month, 0 -> this month, 1 -> next month
 */
export function suggestBudgetDates(offset = 0) {
  const monthKey = addMonths(currentMonthKey(), offset);
  const [year, month] = monthKey.split('-').map(Number);
  const { start, end } = monthRange(monthKey);

  return {
    name: `${MONTH_NAMES[month - 1]} ${year}`,
    startDate: start,
    endDate: end,
    monthKey,
  };
}

// Both full names and the three-letter abbreviations are accepted.
const MONTH_LOOKUP = new Map();
MONTH_NAMES.forEach((name, index) => {
  MONTH_LOOKUP.set(name.toLowerCase(), index + 1);
  MONTH_LOOKUP.set(name.slice(0, 3).toLowerCase(), index + 1);
});

/**
 * Lenient date parsing for text entry: accepts '2026-10-01', 'Oct 1, 2026',
 * '1 Oct 2026', 'Oct 1', 'today' and 'yesterday'. Returns null when the input
 * is not a real date, so validation stays in one place.
 */
export function parseFlexibleDate(input, reference = new Date()) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower === 'today') return toIsoDate(reference);
  if (lower === 'yesterday') {
    const yesterday = new Date(reference);
    yesterday.setDate(reference.getDate() - 1);
    return toIsoDate(yesterday);
  }

  const numeric = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (numeric) return fromParts(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));

  const withYear = raw.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[,\s]+(\d{4})$/);
  if (withYear) {
    const month = MONTH_LOOKUP.get(withYear[2].toLowerCase());
    if (month) return fromParts(Number(withYear[3]), month, Number(withYear[1]));
  }

  const monthFirst = raw.match(/^([A-Za-z]{3,9})[\s-]+(\d{1,2})[,\s]+(\d{4})$/);
  if (monthFirst) {
    const month = MONTH_LOOKUP.get(monthFirst[1].toLowerCase());
    if (month) return fromParts(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }

  const currentYear = reference.getFullYear();
  const noYear = raw.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})$/) ?? raw.match(/^([A-Za-z]{3,9})[\s-]+(\d{1,2})$/);
  if (noYear) {
    const month = MONTH_LOOKUP.get(noYear[2].toLowerCase()) ?? MONTH_LOOKUP.get(noYear[1].toLowerCase());
    const day = MONTH_LOOKUP.has(noYear[2].toLowerCase()) ? Number(noYear[1]) : Number(noYear[2]);
    if (month) return fromParts(currentYear, month, day);
  }

  return null;
}

function fromParts(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return toIsoDate(date);
}