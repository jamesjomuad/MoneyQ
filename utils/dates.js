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