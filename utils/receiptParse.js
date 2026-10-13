import { parseFlexibleDate } from './dates';

/**
 * Deterministic, conservative text parsing for receipts shared into the app
 * (Android share → receipt import → transaction form). No OCR, no AI, no
 * network: only what the shared text itself states can be extracted.
 *
 * Shared text is untrusted content. Nothing here ever interprets it as an
 * instruction — it is scanned for a money amount, a calendar date, and the
 * remaining lines are preserved verbatim for the Description field.
 *
 * Confidence rules:
 *   - An amount must either sit on a labeled line (amount/total/paid…) or
 *     carry a currency marker. The first number on a line is never assumed
 *     to be the amount. Balance/fee/reference lines are excluded.
 *   - A date must be a real calendar day with an explicit year. Numeric
 *     day/month pairs where both parts are ≤ 12 are genuinely ambiguous and
 *     are refused rather than guessed.
 *   - Two different believable values of the same kind = ambiguity: the
 *     field stays empty and the source lines remain in the notes.
 */

/** Free-text cap kept out of paranoia: pastes can be huge, receipts are not. */
const NOTES_LIMIT = 2000;

const AMOUNT_LABEL = /\b(amount paid|total amount|grand total|net amount|amount|total|amt|paid|payment)\b/i;
const AMOUNT_EXCLUDE = /\b(balance|fee|charges?|tax|vat|change|cashback|discount|voucher|points|reference|ref\b|transaction id|txn|trace id|serial|limit)\b/i;
const CURRENCY_SYMBOL = /(?:₱|\$|€|£|¥)/;
const CURRENCY_WORD = /\b(?:PHP|Php|php|Peso|Pesos)\b/;

// Grouped thousands ('1,250') or up to two decimal places ('1,250.75'). The
// guards keep fragments of dates (13/10/2026), times and long id runs out.
const NUMBER_IN_TEXT =
  /(?<![\dA-Za-z.,\-/])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\dA-Za-z/])/g;

// A number sitting directly against a currency symbol/code — strongest money
// evidence there is. Prefix and suffix forms both.
const MARKED_AMOUNT =
  /(?:₱|\$|€|£|¥|\bPHP\b|\bPhp\b)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\dA-Za-z/])|(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s?(?:₱|\$|€|£|¥|\bPHP\b|\bPhp\b)/g;

const DATE_LABEL = /\b(date|datetime|date\/time|date & time|transaction date|trans date|date of)\b/i;
const DATE_EXCLUDE = /\b(expir\w*|valid\w*|due|born|birth|licence|license)\b/i;
const ISO_LIKE = /\b(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\b/;
const DMY_OR_MDY = /\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\b/;
const DAY_MONTH_NAME = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/;
const MONTH_NAME_DAY = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/;

function normalizeNumber(raw) {
  const digits = String(raw).replace(/,/g, '');
  // Guard against ids that slipped the boundary lookarounds (long digit runs).
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(digits)) return null;
  return digits;
}

function centsOf(value) {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Candidate money values on one line: [{ value, tier, lineIndex }]. */
function amountCandidatesFromLine(line, lineIndex) {
  if (AMOUNT_EXCLUDE.test(line)) return [];
  const labeled = AMOUNT_LABEL.test(line);
  const marked = CURRENCY_SYMBOL.test(line) || CURRENCY_WORD.test(line);
  if (!labeled && !marked) return [];

  // Currency-marked numbers carry the strongest evidence. All of them on a
  // line must agree, or the line says nothing we can trust.
  const markedRaw = [...line.matchAll(MARKED_AMOUNT)].map((m) => normalizeNumber(m[1] ?? m[2])).filter(Boolean);
  if (markedRaw.length > 0) {
    const distinct = [...new Set(markedRaw.map(centsOf))];
    if (distinct.length !== 1) return [];
    return [{ value: markedRaw[0], tier: labeled ? 1 : 2, lineIndex }];
  }

  if (!labeled) return [];

  // Labeled but unmarked: the amount in e-wallet formats sits at the end of
  // the line ('Amount: 1,250.00'). The last guarded number is the safest pick.
  const matches = [...line.matchAll(NUMBER_IN_TEXT)];
  if (matches.length === 0) return [];
  const value = normalizeNumber(matches[matches.length - 1][1]);
  return value ? [{ value, tier: 1, lineIndex }] : [];
}

/** Candidate ISO dates on one line, validated through the app's date rules. */
function dateCandidatesFromLine(line, lineIndex) {
  if (DATE_EXCLUDE.test(line)) return [];
  const tier = DATE_LABEL.test(line) ? 1 : 2;
  const isoValues = [];

  const iso = line.match(ISO_LIKE);
  if (iso) {
    const resolved = parseFlexibleDate(`${iso[1]}-${iso[2]}-${iso[3]}`);
    if (resolved) isoValues.push(resolved);
  }

  const numeric = line.match(DMY_OR_MDY);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    // One part above 12 is the only way to tell day from month; both being
    // ≤ 12 is exactly the ambiguity this parser must refuse.
    let day = 0;
    let month = 0;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      day = second;
      month = first;
    }
    if (month >= 1 && month <= 12 && day >= 1) {
      const resolved = parseFlexibleDate(`${year}-${month}-${day}`);
      if (resolved) isoValues.push(resolved);
    }
  }

  const dayFirst = line.match(DAY_MONTH_NAME);
  if (dayFirst) {
    const resolved = parseFlexibleDate(`${dayFirst[1]} ${dayFirst[2]}, ${dayFirst[3]}`);
    if (resolved) isoValues.push(resolved);
  }

  const monthFirst = line.match(MONTH_NAME_DAY);
  if (monthFirst) {
    const resolved = parseFlexibleDate(`${monthFirst[1]} ${monthFirst[2]}, ${monthFirst[3]}`);
    if (resolved) isoValues.push(resolved);
  }

  return [...new Set(isoValues)].map((value) => ({ value, tier, lineIndex }));
}

/**
 * Pick one value from candidates. Identity is decided by a key function
 * ('100' and '100.00' are the same money). All candidates agreeing wins
 * outright; otherwise the labeled tier decides if it agrees among itself;
 * anything left is ambiguous and yields null.
 */
function chooseConfident(candidates, keyOf) {
  const distinct = new Set(candidates.map(keyOf));
  if (distinct.size === 0) return null;
  if (distinct.size === 1) return candidates[0].value;

  const tierOne = candidates.filter((candidate) => candidate.tier === 1);
  const tierOneKeys = new Set(tierOne.map(keyOf));
  if (tierOne.length > 0 && tierOneKeys.size === 1) return tierOne[0].value;

  return null;
}

function buildNotes(lines, consumed) {
  const kept = lines
    .map((line, index) => (consumed.has(index) ? null : line.replace(/\s+$/, '')))
    .filter((line) => line !== null);

  // Trim blank edges and collapse blank runs to a single line break.
  while (kept.length > 0 && kept[0].trim() === '') kept.shift();
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  const collapsed = [];
  for (const line of kept) {
    if (line.trim() === '' && (collapsed.length === 0 || collapsed[collapsed.length - 1] === '')) continue;
    collapsed.push(line);
  }

  const joined = collapsed.join('\n');
  return joined.length > NOTES_LIMIT ? `${joined.slice(0, NOTES_LIMIT)}…` : joined;
}

/**
 * Parse receipt text shared from an e-wallet.
 * Returns { amount, date, notes }:
 *   amount — major-unit decimal string ('1250.75') or null
 *   date   — local 'YYYY-MM-DD' string or null
 *   notes  — the shared text minus lines whose value was used elsewhere, '' when nothing remains
 */
export function parseReceiptText(text) {
  const raw = String(text ?? '');
  if (!raw.trim()) return { amount: null, date: null, notes: '' };

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const amountCandidates = [];
  const dateCandidates = [];
  lines.forEach((line, index) => {
    amountCandidates.push(...amountCandidatesFromLine(line, index));
    dateCandidates.push(...dateCandidatesFromLine(line, index));
  });

  const amount = chooseConfident(amountCandidates, (c) => centsOf(c.value));
  const date = chooseConfident(dateCandidates, (c) => c.value);

  // Lines that supplied the chosen value are consumed (their information now
  // lives in its own field); every other line is preserved verbatim.
  const consumed = new Set();
  if (amount !== null) {
    const cents = centsOf(amount);
    amountCandidates
      .filter((candidate) => centsOf(candidate.value) === cents)
      .forEach((candidate) => consumed.add(candidate.lineIndex));
  }
  if (date !== null) {
    dateCandidates
      .filter((candidate) => candidate.value === date)
      .forEach((candidate) => consumed.add(candidate.lineIndex));
  }

  return { amount, date, notes: buildNotes(lines, consumed) };
}
