import { parseReceiptText } from '../utils/receiptParse.js';
import { toMinor } from '../utils/currency.js';
import { parseFlexibleDate } from '../utils/dates.js';

/**
 * Deterministic checks for the shared-receipt parser: what may be prefilled
 * conservatively, what must stay ambiguous, and how notes are preserved.
 * Mirrors the check() tally style of verify-schema.mjs.
 */

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

console.log('receipt parser: amount rules');

const gcash = [
  'GCash',
  'Payment Successful',
  'Ref No: GC7842190345',
  'Amount: ₱1,250.00',
  'Date: 10/05/2026',
  'Load: ITIME',
  'Paid with: GCash Balance',
].join('\n');
const parsedGcash = parseReceiptText(gcash);
check(
  'labeled currency amount normalizes to a plain decimal',
  parsedGcash.amount === '1250.00',
  `got ${JSON.stringify(parsedGcash.amount)}`,
);
check(
  'prefilled amount lands exactly in minor units',
  toMinor(parsedGcash.amount, 'PHP') === 125000,
);
check(
  'ambiguous numeric date (both parts <= 12) is refused',
  parsedGcash.date === null,
  `got ${JSON.stringify(parsedGcash.date)}`,
);
check('reference line never becomes an amount', !parsedGcash.amount?.includes('7842190345'));
check('balance line is excluded from amounts', !parsedGcash.notes.includes('GCash Balance') || parsedGcash.amount === '1250.00');
check('unconsumed lines stay in notes', parsedGcash.notes.includes('Ref No: GC7842190345'));
check('the consumed amount line is removed from notes', !parsedGcash.notes.includes('₱1,250.00'));
check('the ambiguous date line is preserved in notes', parsedGcash.notes.includes('Date: 10/05/2026'));

const twoAmounts = parseReceiptText('Amount: 100\nTotal: 200');
check('two different labeled amounts stay ambiguous', twoAmounts.amount === null);
check('ambiguous amount lines both remain in notes', twoAmounts.notes.includes('Amount: 100') && twoAmounts.notes.includes('Total: 200'));

const agree = parseReceiptText('Total: ₱100\nAmount Paid: 100.00');
check('agreeing amounts (100 vs 100.00) resolve by cents', agree.amount !== null && toMinor(agree.amount, 'PHP') === 10000, `got ${JSON.stringify(agree.amount)}`);

const lone = parseReceiptText('₱500.00');
check('a lone currency-marked value is trusted', lone.amount === '500.00' && lone.notes === '');

const markedConflict = parseReceiptText('₱100 and ₱50');
check('two different marked numbers on one line are refused', markedConflict.amount === null);

const balance = parseReceiptText('Available Balance: ₱5,000.00');
check('a balance figure never prefills the amount', balance.amount === null && balance.notes.includes('₱5,000.00'));

const firstNumber = parseReceiptText('Total count 3 items cost ₱75.00');
check('the first number on a line is not assumed to be the amount', firstNumber.amount === '75' || firstNumber.amount === '75.00', `got ${JSON.stringify(firstNumber.amount)}`);

console.log('receipt parser: date rules');

const dated = parseReceiptText('Transaction Date: 2026-10-05\nAmount ₱45.00');
check('ISO date prefills exactly', dated.date === '2026-10-05', `got ${JSON.stringify(dated.date)}`);
check('ISO date round-trips through the app date rules', parseFlexibleDate(dated.date) === '2026-10-05');
check('consumed date and amount lines leave notes', !dated.notes.includes('2026-10-05') && !dated.notes.includes('45.00'));

const dayMonth = parseReceiptText('05 Oct 2026');
check('day + month name resolves with the app parser', dayMonth.date === '2026-10-05', `got ${JSON.stringify(dayMonth.date)}`);

const slashUnambiguous = parseReceiptText('Date: 13/10/2026');
check('13/10/2026 reads as day-first (only one part > 12)', slashUnambiguous.date === '2026-10-13', `got ${JSON.stringify(slashUnambiguous.date)}`);

const slashReversed = parseReceiptText('Date: 10/13/2026');
check('10/13/2026 reads as month-first', slashReversed.date === '2026-10-13', `got ${JSON.stringify(slashReversed.date)}`);

const expiry = parseReceiptText('Valid Until: 13/10/2026');
check('expiry dates are excluded', expiry.date === null && expiry.notes.includes('Valid Until'));

const bogus = parseReceiptText('Date: 2026-02-30');
check('a non-existent calendar day is refused', bogus.date === null);

console.log('receipt parser: notes and resilience');

const empty = parseReceiptText('');
check('empty text yields all-empty result', empty.amount === null && empty.date === null && empty.notes === '');
check('null-ish input never throws', parseReceiptText(null).notes === '' && parseReceiptText(undefined).amount === null);

const crlf = parseReceiptText('GCash\r\nAmount: ₱50.00\r\n\r\n\r\nThanks!');
check('CRLF normalizes and blank runs collapse', crlf.notes === 'GCash\n\nThanks!' && crlf.amount === '50.00', JSON.stringify(crlf.notes));

const huge = parseReceiptText(`Amount: 1\n${'x'.repeat(5000)}`);
check('notes are capped, never unbounded', huge.notes.length <= 2002);

console.log(`\n${passed}/${passed + failed} receipt parser checks passed`);
if (failed > 0) process.exit(1);
