// All monetary values are persisted and passed around as integer *minor units*
// (e.g. centavos) so that no floating point rounding error can ever corrupt a
// balance. Conversion to a human readable string only happens at the edges.

export const CURRENCIES = {
  PHP: { code: 'PHP', symbol: '₱', position: 'prefix', minorUnits: 2, groupSeparator: ',', decimalSeparator: '.' },
  USD: { code: 'USD', symbol: '$', position: 'prefix', minorUnits: 2, groupSeparator: ',', decimalSeparator: '.' },
  EUR: { code: 'EUR', symbol: '€', position: 'suffix', minorUnits: 2, groupSeparator: ',', decimalSeparator: '.' },
  GBP: { code: 'GBP', symbol: '£', position: 'prefix', minorUnits: 2, groupSeparator: ',', decimalSeparator: '.' },
  JPY: { code: 'JPY', symbol: '¥', position: 'prefix', minorUnits: 0, groupSeparator: ',', decimalSeparator: '.' },
};

export const DEFAULT_CURRENCY = 'PHP';

export function getCurrency(code) {
  return CURRENCIES[code] ?? CURRENCIES[DEFAULT_CURRENCY];
}

export function isSupportedCurrency(code) {
  return Object.hasOwn(CURRENCIES, code);
}

/**
 * Convert a user-entered major-unit value into integer minor units.
 * Accepts numbers or keypad strings such as "1,250.75".
 */
export function toMinor(amount, currency = DEFAULT_CURRENCY) {
  const { minorUnits } = getCurrency(currency);
  const cleaned = typeof amount === 'string' ? amount.replace(/[^0-9.-]/g, '') : amount;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10 ** minorUnits);
}

export function fromMinor(minorUnits, currency = DEFAULT_CURRENCY) {
  const { minorUnits: precision } = getCurrency(currency);
  return minorUnits / 10 ** precision;
}

/**
 * Keep only what an amount field may contain: digits and at most one decimal
 * point, never more fraction digits than the currency has. The separator is
 * kept while typing ('12.' stays '12.') so entry is not fought at every
 * keystroke. Paste is cleaned the same way as typing.
 */
export function sanitizeAmount(text, decimalPlaces = 2) {
  const raw = String(text ?? '').replace(/[^0-9.]/g, '');
  const dot = raw.indexOf('.');
  if (dot === -1) return raw;

  const whole = raw.slice(0, dot);
  // A second '.' is a mistake, not extra digits: the first one is the point.
  const fraction = raw.slice(dot + 1).split('.')[0];
  if (decimalPlaces <= 0) return whole;
  return `${whole}.${fraction.slice(0, decimalPlaces)}`;
}

function groupThousands(digits, separator) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Format integer minor units as a display string. Never throws, never relies
 * on Intl being present in the Hermes runtime.
 */
export function formatCurrency(minorUnits, options = {}) {
  const { currency = DEFAULT_CURRENCY, showSign = false, hideDecimals = false } = options;
  const config = getCurrency(currency);

  const safe = Number.isFinite(minorUnits) ? Math.trunc(minorUnits) : 0;
  const isNegative = safe < 0;
  const absolute = Math.abs(safe);
  const divisor = 10 ** config.minorUnits;

  const whole = groupThousands(String(Math.floor(absolute / divisor)), config.groupSeparator);
  let body = whole;

  if (config.minorUnits > 0 && !hideDecimals) {
    const fraction = String(absolute % divisor).padStart(config.minorUnits, '0');
    body += `${config.decimalSeparator}${fraction}`;
  }

  const symbol = `${config.symbol}`;
  const amount = config.position === 'suffix' ? `${body}${symbol}` : `${symbol}${body}`;

  if (isNegative) return `-${amount}`;
  if (showSign && safe > 0) return `+${amount}`;
  return amount;
}

/** Format a signed delta, used for income (+), expense (-) and transfer rows. */
export function formatSignedAmount(minorUnits, options = {}) {
  return formatCurrency(Math.abs(minorUnits), { ...options, showSign: minorUnits > 0 });
}