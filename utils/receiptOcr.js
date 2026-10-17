import {
  AMOUNT_EXCLUDE,
  NUMBER_IN_TEXT,
  centsOf,
  dateCandidatesFromLine,
  normalizeCurrencyMarks,
  normalizeNumber,
  parseReceiptText,
} from './receiptParse';

/**
 * Rules for the 'Recognized Text' chips shown over an OCR'd receipt.
 *
 * Pure and deterministic — no React, no storage: every recognized line
 * becomes a chip verbatim, and a chip only ever becomes a field value after
 * the SAME conservative money/date rules the shared-text parser uses say it
 * is safe. Ambiguity is refused, never guessed, and the original text of
 * every chip stays intact.
 */

/** Practical ceiling: real receipts are far below this, bad scans are capped. */
const CHIP_LIMIT = 80;

/**
 * One chip per recognized line, in the order the lines were read. The text is
 * kept verbatim apart from its surrounding whitespace: currency marks,
 * punctuation, inner spaces and reference numbers all survive, because a line
 * is only ever split where the recognizer itself ended it — never on a space,
 * a currency symbol or a run of spaces.
 *
 * Empty and whitespace-only lines are skipped, and so is anything holding no
 * letter or digit at all (scanner rail marks like '|' or '***'), since that is
 * noise rather than reading. Nothing else is dropped: a repeated line is still
 * a line the receipt printed, so it keeps its own chip like every other.
 */
export function buildChips(lines) {
  const chips = [];
  for (const raw of lines ?? []) {
    const text = String(raw ?? '').trim();
    if (!text) continue;
    if (!/[\p{L}\p{N}]/u.test(text)) continue;
    chips.push({ id: `chip_${chips.length}`, text });
    if (chips.length >= CHIP_LIMIT) break;
  }
  return chips;
}

/**
 * Is this chip a monetary amount? Reuses the receipt parser's guards: a
 * balance/fee/reference word rejects the line outright, the same boundary-
 * protected number matcher extracts candidates, and more than one distinct
 * value (or an id-length digit run) refuses rather than guesses.
 * Returns { ok, value } with value as a major-unit decimal string, or
 * { ok: false, reason } to explain the refusal in the UI.
 */
export function parseChipAmount(text) {
  const value = String(text ?? '');
  if (AMOUNT_EXCLUDE.test(value)) {
    return {
      ok: false,
      reason: 'This line is about a balance, fee or reference number — not an amount.',
    };
  }
  const matches = [...normalizeCurrencyMarks(value).matchAll(NUMBER_IN_TEXT)];
  if (matches.length === 0) {
    return { ok: false, reason: 'No usable number found in this text.' };
  }
  const normalized = matches.map((m) => normalizeNumber(m[1])).filter(Boolean);
  if (normalized.length === 0) {
    return { ok: false, reason: 'That number is too long to be money — it looks like an id.' };
  }
  const distinct = [...new Set(normalized.map(centsOf))];
  if (distinct.length > 1) {
    return { ok: false, reason: 'This line holds more than one number, so there is no clear amount.' };
  }
  if (distinct[0] === 0) {
    return { ok: false, reason: 'An amount of zero is not a transaction.' };
  }
  return { ok: true, value: normalized[0] };
}

/**
 * Is this chip a complete, unambiguous date? Validated by the parser's own
 * line scanner, which already refuses day/month pairs where both parts are
 * ≤ 12 and requires a real calendar day with an explicit year.
 */
export function parseChipDate(text) {
  const candidates = dateCandidatesFromLine(String(text ?? ''), 0);
  if (candidates.length === 0) {
    return { ok: false, reason: 'No complete date (day, month and year) found here.' };
  }
  const distinct = [...new Set(candidates.map((candidate) => candidate.value))];
  if (distinct.length > 1) {
    return { ok: false, reason: 'This line is ambiguous: more than one date fits it.' };
  }
  return { ok: true, value: distinct[0] };
}

const MERCHANT_LABEL = /\b(store|merchant|outlet|branch|paid\s+to|received\s+by)\b[:\s]/i;
const NON_MERCHANT =
  /\b(receipt|official|copy|thank|thanks|customer|cashier|teller|vat|tin|register|terminal|transaction)\b/i;

function looksLikeName(line) {
  const text = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 40) return false;
  if (/\d/.test(text)) return false;
  if (!/^[A-Za-z][A-Za-z\s&'.-]*$/.test(text)) return false;
  if (NON_MERCHANT.test(text)) return false;
  return text.split(' ').length <= 5;
}

/**
 * The one thing OCR may infer without an explicit money/date pattern: the
 * merchant name. Only confident sources qualify — a labeled
 * store/merchant/paid-to line, or exactly one name-like line among the first
 * three. Two plausible names means no guess.
 */
function merchantFromLines(lines) {
  for (const line of lines) {
    const labeled = String(line).match(MERCHANT_LABEL);
    if (!labeled) continue;
    const value = String(line)
      .slice(labeled.index + labeled[0].length)
      .replace(/^[:\s]+/, '')
      .trim();
    if (value.length >= 2 && value.length <= 40 && !NON_MERCHANT.test(value)) return value;
  }
  const nearTop = lines.slice(0, 3).filter(looksLikeName);
  if (nearTop.length === 1) return nearTop[0].replace(/\s+/g, ' ').trim();
  return null;
}

/**
 * Conservative automatic prefill for a whole scan. Amount and date come from
 * the proven parseReceiptText rules applied to the joined recognized lines —
 * never the notes body, and only when the parser itself is confident.
 * Description only ever comes from the merchant rule above.
 */
export function autoPrefill(lines) {
  const list = (lines ?? []).map((line) => String(line ?? ''));
  const text = list.join('\n');
  if (!text.trim()) return { amount: null, date: null, description: null };

  const parsed = parseReceiptText(text);
  return {
    amount: parsed.amount,
    date: parsed.date,
    description: merchantFromLines(list),
  };
}

/** Which chip supplied a prefilled amount? Matched by cents value, so
 *  '1,250.75' and 'PHP 1250.75' both point at the chip the user can see. */
export function findChipForAmount(chips, value) {
  if (!value) return null;
  const cents = centsOf(String(value));
  for (const chip of chips) {
    if (AMOUNT_EXCLUDE.test(chip.text)) continue;
    const numbers = [...normalizeCurrencyMarks(chip.text).matchAll(NUMBER_IN_TEXT)]
      .map((m) => normalizeNumber(m[1]))
      .filter(Boolean);
    if (numbers.some((n) => centsOf(n) === cents)) return chip.id;
  }
  return null;
}

/** Which chip shows this ISO date? Same line scanner the manual path uses. */
export function findChipForDate(chips, iso) {
  if (!iso) return null;
  for (const chip of chips) {
    const candidates = dateCandidatesFromLine(chip.text, 0);
    if (candidates.some((candidate) => candidate.value === iso)) return chip.id;
  }
  return null;
}

/** Which chip contains this description text (merchant name)? Case-insensitive. */
export function findChipForText(chips, value) {
  const needle = String(value ?? '').trim().toLowerCase();
  if (!needle) return null;
  const hit = chips.find((chip) => chip.text.toLowerCase().includes(needle));
  return hit ? hit.id : null;
}
