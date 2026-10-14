/**
 * Backup export/import: serialization envelope, validation, and the merge
 * planner. Pure logic only — no storage, no React Native. Money stays in
 * integer minor units and dates stay in their local `YYYY-MM-DD` form; a
 * backup never shifts a day across time zones.
 *
 * The envelope is versioned so future app releases can read older files:
 * `MIGRATIONS` maps "upgrade from version N" steps, and anything newer
 * than what this build understands is rejected with a clear message.
 */

import { ACCOUNT_TYPES, DEFAULT_TAG_EMOJI, TRANSACTION_TYPES } from '../constants/finance';
import { computeBreakdownTotal, isHhMm, isIsoCalendarDate } from './breakdown';
import { isHexColor } from './colors';
import { CURRENCIES, formatCurrency } from './currency';
import { nowIso } from './id';
import { PAYMENT_STATUSES } from './paymentStatus';
import { buildRemindAt, REMINDER_STATUSES } from './reminders';

export const BACKUP_FORMAT = 'moneyq-backup';
export const BACKUP_FORMAT_VERSION = 1;

/** Refuse absurd inputs before even attempting JSON.parse. */
const MAX_BACKUP_CHARACTERS = 20_000_000;

/**
 * Upgrade steps keyed by the version they migrate FROM. Adding support for
 * format v2 later means appending `{ 1: (data) => v2Shape }` here; the
 * envelope check then walks a v1 file up to the current version.
 */
const MIGRATIONS = {};

/**
 * `theme` mirrors THEME_PREFERENCES in settingsRepository. Re-declared here
 * because importing the repository would drag the storage singleton (and
 * expo-sqlite) into this pure module — and into `npm run verify:db`.
 */
const THEME_VALUES = ['system', 'light', 'dark', 'moneyq'];

/** Column whitelist per entity, in a fixed order for stable output. */
const ENTITY_COLUMNS = {
  accounts: ['id', 'name', 'type', 'initial_balance', 'archived', 'created_at', 'updated_at'],
  folders: ['id', 'name', 'color', 'position', 'created_at', 'updated_at'],
  budgets: ['id', 'name', 'start_date', 'end_date', 'color', 'folder_id', 'created_at', 'updated_at'],
  tags: [
    'id',
    'name',
    'emoji',
    'color',
    'is_default',
    'archived',
    'created_at',
    'updated_at',
  ],
  transactions: [
    'id',
    'budget_id',
    'type',
    'amount',
    'tag_id',
    'account_id',
    'to_account_id',
    'description',
    'transaction_date',
    'payment_status',
    'has_breakdown',
    'payment_due_date',
    'created_at',
    'updated_at',
  ],
  subTransactions: [
    'id',
    'transaction_id',
    'description',
    'amount',
    'position',
    'created_at',
    'updated_at',
    'purchase_date',
    'purchase_time',
    'notes',
  ],
  reminders: [
    'id',
    'transaction_id',
    'enabled',
    'status',
    'remind_date',
    'remind_time',
    'remind_at',
    'notification_id',
    'notes',
    'created_at',
    'updated_at',
  ],
};

const ROW_ENTITIES = Object.keys(ENTITY_COLUMNS);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Project a row onto its whitelist (dropping derived joins), null-filling. */
export function normalizeRows(rows, entity) {
  const columns = ENTITY_COLUMNS[entity];
  if (!Array.isArray(rows) || !columns) return [];
  return rows
    .filter(isPlainObject)
    .map((row) => {
      const out = {};
      for (const column of columns) out[column] = row[column] ?? null;
      return out;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** Deterministic JSON with sorted object keys (arrays keep their order). */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function toIsoFileNameDate(todayIso) {
  return isIsoCalendarDate(todayIso) ? todayIso : todayIso.slice(0, 10);
}

/** `Budgetarian-Backup-2026-10-12.json` / `Budgetarian-Backup-Recovery-2026-10-12.json`. */
export function buildBackupFileName(todayIso, suffix = '') {
  return `Budgetarian-Backup${suffix}-${toIsoFileNameDate(todayIso)}.json`;
}

/** Build the full envelope object from a storage snapshot. */
export function serializeSnapshot(snapshot, { appVersion = null, createdAt = nowIso() } = {}) {
  const data = { settings: { ...(snapshot.settings ?? {}) } };
  for (const entity of ROW_ENTITIES) data[entity] = normalizeRows(snapshot[entity], entity);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    app: { name: 'Budgetarian', version: appVersion },
    data,
  };
}

export function stringifyBackup(envelope) {
  return JSON.stringify(envelope, null, 2);
}

/** Parse + validate a backup file's text in one call. */
export function parseBackupText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, issues: ['The file is empty.'], warnings: [] };
  }
  if (text.length > MAX_BACKUP_CHARACTERS) {
    return {
      ok: false,
      issues: ['The file is far too large to be a Budgetarian backup.'],
      warnings: [],
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, issues: ['The file is not valid JSON.'], warnings: [] };
  }
  return validateBackup(parsed);
}

function isParseableDate(value) {
  if (typeof value !== 'string' || value === '') return false;
  return !Number.isNaN(Date.parse(value));
}

function coerceFlag(value, issues, warnings, label, rowId) {
  if (value === 0 || value === 1) return value;
  if (value === null || value === undefined) return 0;
  warnings.push(`${label} on ${rowId} was not 0 or 1; stored as ${value ? 1 : 0}.`);
  return value ? 1 : 0;
}

function coerceTimestamp(value, warnings, label, rowId, fallbackStamp, field) {
  if (isParseableDate(value)) return value;
  warnings.push(`${label} ${field} was not a readable date; stamped ${fallbackStamp.slice(0, 10)}.`);
  return fallbackStamp;
}

function coerceText(value, fallback, warnings, label, rowId, field) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  warnings.push(`${label} ${field} was not text; converted to a string.`);
  return String(value);
}

function coerceHexColor(value, warnings, label, rowId) {
  if (value === null || value === undefined) return null;
  if (isHexColor(value)) return value.toUpperCase();
  warnings.push(`${label} had an invalid colour and reverted to the theme default.`);
  return null;
}

/**
 * Full validation of a parsed backup envelope. Returns either
 * `{ ok:true, data, warnings, counts }` with normalized rows ready for
 * preview/merge/restore, or `{ ok:false, issues, warnings }`.
 */
export function validateBackup(parsed, { nowStamp = nowIso() } = {}) {
  const issues = [];
  const warnings = [];
  const fail = (message) => ({ ok: false, issues: [message], warnings: [] });

  if (!isPlainObject(parsed)) return fail('This file is not a Budgetarian backup.');
  if (parsed.format !== BACKUP_FORMAT) {
    return fail(
      `This file is not a Budgetarian backup (found format "${String(parsed.format ?? 'missing')}").`,
    );
  }
  if (!Number.isInteger(parsed.formatVersion) || parsed.formatVersion <= 0) {
    return fail('The backup version is missing or unreadable.');
  }
  if (parsed.formatVersion > BACKUP_FORMAT_VERSION) {
    return fail(
      `This backup was created by a newer version of Budgetarian (backup format v${parsed.formatVersion}). ` +
        'Update Budgetarian before importing it.',
    );
  }
  for (let version = parsed.formatVersion; version < BACKUP_FORMAT_VERSION; version += 1) {
    const step = MIGRATIONS[version];
    if (!step) return fail(`There is no upgrade path from backup format v${version}.`);
    // steps would transform the data shape here; none exist at v1.
  }
  if (!isPlainObject(parsed.data)) return fail('The backup contains no data section.');

  const data = parsed.data;
  const missingSection = (key, { optional = false, label } = {}) => {
    if (Array.isArray(data[key]) || (optional && (data[key] === undefined || data[key] === null))) {
      return data[key] ?? [];
    }
    if (optional) {
      warnings.push(`${label} section was missing and was treated as empty.`);
      return [];
    }
    issues.push(`The backup is missing its ${label} section.`);
    return [];
  };

  // ---- accounts -------------------------------------------------------
  const accounts = [];
  const accountIds = new Set();
  const seenAccountIds = new Set();
  for (const row of missingSection('accounts', { label: 'accounts' })) {
    if (!isPlainObject(row)) {
      issues.push('An account entry is not an object.');
      continue;
    }
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : null;
    if (!id || seenAccountIds.has(id)) {
      issues.push(`An account has a missing or duplicate id ("${String(row.id)}").`);
      continue;
    }
    seenAccountIds.add(id);
    accounts.push({
      id,
      name: coerceText(row.name, 'Account', warnings, `Account ${id}`, id, 'name'),
      type: ACCOUNT_TYPES.includes(row.type)
        ? row.type
        : (warnings.push(`Account ${id} had an unknown type; defaulted to cash.`), 'cash'),
      initial_balance: Number.isInteger(row.initial_balance)
        ? row.initial_balance
        : row.initial_balance === null || row.initial_balance === undefined
          ? 0
          : (() => {
              warnings.push(`Account ${id} had a non-integer balance; set to 0.`);
              return 0;
            })(),
      archived: coerceFlag(row.archived, issues, warnings, `Account ${id}`, id),
      created_at: coerceTimestamp(row.created_at, warnings, `Account ${id}`, id, nowStamp, 'created_at'),
      updated_at: coerceTimestamp(row.updated_at, warnings, `Account ${id}`, id, nowStamp, 'updated_at'),
    });
    accountIds.add(id);
  }

  // ---- folders --------------------------------------------------------
  // Optional section: backups written before budget folders existed simply
  // omit it (same precedent as `subTransactions` below).
  if (data.folders === undefined || data.folders === null) {
    warnings.push('This backup predates budget folders; it was read without any.');
  }
  const folders = [];
  const folderIds = new Set();
  const seenFolderIds = new Set();
  for (const row of missingSection('folders', { optional: true, label: 'budget folders' })) {
    if (!isPlainObject(row)) {
      issues.push('A budget folder entry is not an object.');
      continue;
    }
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : null;
    if (!id || seenFolderIds.has(id)) {
      issues.push(`A budget folder has a missing or duplicate id ("${String(row.id)}").`);
      continue;
    }
    seenFolderIds.add(id);
    folders.push({
      id,
      name: coerceText(row.name, 'Budget folder', warnings, `Budget folder ${id}`, id, 'name'),
      color: coerceHexColor(row.color, warnings, `Budget folder ${id}`, id),
      position: Number.isInteger(row.position) && row.position >= 0
        ? row.position
        : row.position === null || row.position === undefined
          ? 0
          : (() => {
              warnings.push(`Budget folder ${id} had a non-numeric position; set to 0.`);
              return 0;
            })(),
      created_at: coerceTimestamp(row.created_at, warnings, `Budget folder ${id}`, id, nowStamp, 'created_at'),
      updated_at: coerceTimestamp(row.updated_at, warnings, `Budget folder ${id}`, id, nowStamp, 'updated_at'),
    });
    folderIds.add(id);
  }

  // ---- budgets --------------------------------------------------------
  const budgets = [];
  const budgetIds = new Set();
  const seenBudgetIds = new Set();
  for (const row of missingSection('budgets', { label: 'budgets' })) {
    if (!isPlainObject(row)) {
      issues.push('A budget entry is not an object.');
      continue;
    }
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : null;
    if (!id || seenBudgetIds.has(id)) {
      issues.push(`A budget has a missing or duplicate id ("${String(row.id)}").`);
      continue;
    }
    seenBudgetIds.add(id);
    if (!isIsoCalendarDate(row.start_date))
      issues.push(`Budget ${id} has an invalid start date ("${String(row.start_date)}").`);
    if (!isIsoCalendarDate(row.end_date))
      issues.push(`Budget ${id} has an invalid end date ("${String(row.end_date)}").`);
    budgets.push({
      id,
      name: coerceText(row.name, 'Budget', warnings, `Budget ${id}`, id, 'name'),
      start_date: row.start_date,
      end_date: row.end_date,
      color: coerceHexColor(row.color, warnings, `Budget ${id}`, id),
      folder_id:
        row.folder_id === null || row.folder_id === undefined
          ? null
          : folderIds.has(row.folder_id)
            ? row.folder_id
            : (warnings.push(`Budget ${id} referenced budget folder "${String(row.folder_id)}" which is not in the backup; left ungrouped.`), null),
      created_at: coerceTimestamp(row.created_at, warnings, `Budget ${id}`, id, nowStamp, 'created_at'),
      updated_at: coerceTimestamp(row.updated_at, warnings, `Budget ${id}`, id, nowStamp, 'updated_at'),
    });
    budgetIds.add(id);
  }

  // ---- tags -----------------------------------------------------------
  const tags = [];
  const tagIds = new Set();
  const seenTagIds = new Set();
  const seenTagNames = new Set();
  for (const row of missingSection('tags', { label: 'tags' })) {
    if (!isPlainObject(row)) {
      issues.push('A tag entry is not an object.');
      continue;
    }
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : null;
    if (!id || seenTagIds.has(id)) {
      issues.push(`A tag has a missing or duplicate id ("${String(row.id)}").`);
      continue;
    }
    seenTagIds.add(id);
    const name =
      typeof row.name === 'string' && row.name.trim() !== '' ? row.name.trim() : null;
    if (!name) {
      issues.push(`Tag ${id} has no name.`);
      continue;
    }
    const nameKey = name.toLowerCase();
    if (seenTagNames.has(nameKey)) {
      issues.push(`Two tags share the name "${name}" (id ${id}).`);
      continue;
    }
    seenTagNames.add(nameKey);
    tags.push({
      id,
      name,
      emoji:
        typeof row.emoji === 'string' && row.emoji !== '' ? row.emoji : DEFAULT_TAG_EMOJI,
      color: coerceHexColor(row.color, warnings, `Tag ${id}`, id),
      is_default: coerceFlag(row.is_default, issues, warnings, `Tag ${id}`, id),
      archived: coerceFlag(row.archived, issues, warnings, `Tag ${id}`, id),
      created_at: coerceTimestamp(row.created_at, warnings, `Tag ${id}`, id, nowStamp, 'created_at'),
      updated_at: coerceTimestamp(row.updated_at, warnings, `Tag ${id}`, id, nowStamp, 'updated_at'),
    });
    tagIds.add(id);
  }

  // ---- transactions ---------------------------------------------------
  const transactions = [];
  const txIds = new Set();
  const seenTxIds = new Set();
  const legacySubMissing =
    data.subTransactions === undefined || data.subTransactions === null;
  if (legacySubMissing) {
    warnings.push('This backup predates breakdown items; it was read without any.');
  }
  for (const row of missingSection('transactions', { label: 'transactions' })) {
    if (!isPlainObject(row)) {
      issues.push('A transaction entry is not an object.');
      continue;
    }
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : null;
    if (!id || seenTxIds.has(id)) {
      issues.push(`A transaction has a missing or duplicate id ("${String(row.id)}").`);
      continue;
    }
    seenTxIds.add(id);
    const label = `Transaction ${id}`;
    if (!TRANSACTION_TYPES.includes(row.type)) {
      issues.push(`${label} has an unknown type ("${String(row.type)}").`);
      continue;
    }
    if (!Number.isInteger(row.amount) || row.amount < 0) {
      issues.push(`${label} has an invalid amount (${String(row.amount)}).`);
      continue;
    }
    if (!budgetIds.has(row.budget_id)) {
      issues.push(`${label} references budget "${String(row.budget_id)}" which is not in the backup.`);
      continue;
    }
    if (row.tag_id != null && row.tag_id !== '' && !tagIds.has(row.tag_id)) {
      issues.push(`${label} references tag "${String(row.tag_id)}" which is not in the backup.`);
      continue;
    }
    if (row.account_id != null && row.account_id !== '' && !accountIds.has(row.account_id)) {
      issues.push(`${label} references account "${String(row.account_id)}" which is not in the backup.`);
      continue;
    }
    if (!isIsoCalendarDate(row.transaction_date)) {
      issues.push(`${label} has an invalid date ("${String(row.transaction_date)}").`);
      continue;
    }
    if (row.payment_due_date != null && row.payment_due_date !== '' &&
        !isIsoCalendarDate(row.payment_due_date)) {
      issues.push(`${label} has an invalid due date ("${String(row.payment_due_date)}").`);
      continue;
    }
    let paymentStatus = null;
    if (row.type === 'expense') {
      paymentStatus = PAYMENT_STATUSES.includes(row.payment_status) ? row.payment_status : 'paid';
    } else if (row.payment_status != null && row.payment_status !== '') {
      warnings.push(`${label} is ${row.type} but carried a payment status; it was cleared.`);
    }
    let accountId = row.account_id || null;
    let toAccountId = row.to_account_id || null;
    let hasBreakdown = coerceFlag(row.has_breakdown, issues, warnings, label, id);
    if (row.type === 'transfer') {
      if (!accountId || !toAccountId || accountId === toAccountId ||
          !accountIds.has(accountId) ||
          (toAccountId && !accountIds.has(toAccountId))) {
        issues.push(`${label} is a transfer without two different known accounts.`);
        continue;
      }
      if (hasBreakdown) {
        warnings.push(`${label} is a transfer; its breakdown flag was removed (items are rejected below).`);
        hasBreakdown = 0;
      }
    } else {
      if (toAccountId != null) {
        warnings.push(`${label} is not a transfer; its destination account was cleared.`);
        toAccountId = null;
      }
      if (accountId != null && !accountIds.has(accountId)) {
        issues.push(`${label} references account "${String(accountId)}" which is not in the backup.`);
        continue;
      }
      if (!hasBreakdown && row.amount <= 0) {
        issues.push(`${label} has an invalid amount (${String(row.amount)}).`);
        continue;
      }
    }
    transactions.push({
      id,
      budget_id: row.budget_id,
      type: row.type,
      amount: row.amount,
      tag_id: row.tag_id || null,
      account_id: accountId,
      to_account_id: toAccountId,
      description: coerceText(row.description, null, warnings, label, id, 'description'),
      transaction_date: row.transaction_date,
      payment_status: paymentStatus,
      has_breakdown: hasBreakdown,
      payment_due_date: row.payment_due_date || null,
      // receipt_path is deliberately not carried over: receipt image files
      // live only on this device and never travel inside a JSON backup, so
      // a restored transaction must not reference a file that is not there.
      created_at: coerceTimestamp(row.created_at, warnings, label, id, nowStamp, 'created_at'),
      updated_at: coerceTimestamp(row.updated_at, warnings, label, id, nowStamp, 'updated_at'),
    });
    txIds.add(id);
  }

  // ---- sub transactions (breakdown items) ------------------------------
  const subTransactions = [];
  const seenSubIds = new Set();
  for (const row of missingSection('subTransactions', {
    optional: true,
    label: 'breakdown items',
  })) {
    if (!isPlainObject(row)) {
      issues.push('A breakdown item is not an object.');
      continue;
    }
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : null;
    if (!id || seenSubIds.has(id)) {
      issues.push(`A breakdown item has a missing or duplicate id ("${String(row.id)}").`);
      continue;
    }
    seenSubIds.add(id);
    const label = `Breakdown item ${id}`;
    if (!txIds.has(row.transaction_id)) {
      issues.push(`${label} references transaction "${String(row.transaction_id)}" which is not in the backup.`);
      continue;
    }
    if (typeof row.description !== 'string' || row.description.trim() === '') {
      issues.push(`${label} has no description.`);
      continue;
    }
    if (!Number.isInteger(row.amount)) {
      issues.push(`${label} has an invalid amount (${String(row.amount)}).`);
      continue;
    }
    if (row.purchase_date != null && row.purchase_date !== '' &&
        !isIsoCalendarDate(row.purchase_date)) {
      issues.push(`${label} has an invalid purchase date ("${String(row.purchase_date)}").`);
      continue;
    }
    if (row.purchase_time != null && row.purchase_time !== '' && !isHhMm(row.purchase_time)) {
      issues.push(`${label} has an invalid purchase time ("${String(row.purchase_time)}").`);
      continue;
    }
    subTransactions.push({
      id,
      transaction_id: row.transaction_id,
      description: row.description.trim(),
      amount: row.amount,
      position: Number.isInteger(row.position)
        ? row.position
        : (warnings.push(`${label} had no usable position; it was re-ordered.`), 0),
      created_at: coerceTimestamp(row.created_at, warnings, label, id, nowStamp, 'created_at'),
      updated_at: coerceTimestamp(row.updated_at, warnings, label, id, nowStamp, 'updated_at'),
      purchase_date: row.purchase_date || null,
      purchase_time: row.purchase_time || null,
      notes: typeof row.notes === 'string' ? row.notes : null,
    });
  }

  // Re-index positions per parent, deterministic (position, id) order.
  const itemsByParent = new Map();
  for (const item of subTransactions) {
    const list = itemsByParent.get(item.transaction_id) ?? [];
    list.push(item);
    itemsByParent.set(item.transaction_id, list);
  }
  for (const list of itemsByParent.values()) {
    list.sort(
      (a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id)),
    );
    list.forEach((item, index) => {
      item.position = index;
    });
  }

  // ---- breakdown consistency -------------------------------------------
  const txById = new Map(transactions.map((tx) => [tx.id, tx]));
  for (const tx of transactions) {
    const items = itemsByParent.get(tx.id) ?? [];
    if (tx.type === 'transfer') {
      if (items.length > 0) {
        issues.push(`Transaction ${tx.id} is a transfer but carries breakdown items.`);
      }
      continue;
    }
    if (items.length === 0) {
      if (tx.has_breakdown) {
        warnings.push(
          `Transaction ${tx.id} was marked as a breakdown but has no items; the flag was cleared.`,
        );
        tx.has_breakdown = 0;
      }
      if (tx.amount <= 0) {
        issues.push(`Transaction ${tx.id} has an invalid amount (${String(tx.amount)}).`);
      }
      continue;
    }
    if (!tx.has_breakdown) {
      warnings.push(`Transaction ${tx.id} carries breakdown items; it was marked as a breakdown.`);
      tx.has_breakdown = 1;
    }
    const total = computeBreakdownTotal(items);
    if (total < 0) {
      issues.push(
        `Breakdown items for "${tx.description || tx.id}" (${tx.transaction_date}) total a negative amount.`,
      );
    } else if (total !== tx.amount) {
      issues.push(
        `Breakdown items for "${tx.description || tx.id}" (${tx.transaction_date}) total ${total} ` +
          `but the transaction says ${tx.amount}.`,
      );
    }
  }

  // ---- reminders ---------------------------------------------------------
  const reminders = [];
  const seenReminderIds = new Set();
  for (const row of missingSection('reminders', { label: 'reminders' })) {
    if (!isPlainObject(row)) {
      issues.push('A reminder entry is not an object.');
      continue;
    }
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : null;
    if (!id || seenReminderIds.has(id)) {
      issues.push(`A reminder has a missing or duplicate id ("${String(row.id)}").`);
      continue;
    }
    seenReminderIds.add(id);
    const label = `Reminder ${id}`;
    if (row.transaction_id != null && row.transaction_id !== '' && !txIds.has(row.transaction_id)) {
      issues.push(`${label} references transaction "${String(row.transaction_id)}" which is not in the backup.`);
      continue;
    }
    if (!isIsoCalendarDate(row.remind_date)) {
      issues.push(`${label} has an invalid date ("${String(row.remind_date)}").`);
      continue;
    }
    if (!isHhMm(row.remind_time)) {
      issues.push(`${label} has an invalid time ("${String(row.remind_time)}").`);
      continue;
    }
    reminders.push({
      id,
      transaction_id: row.transaction_id || null,
      enabled: coerceFlag(row.enabled, issues, warnings, label, id),
      status: REMINDER_STATUSES.includes(row.status)
        ? row.status
        : (warnings.push(`${label} had an unknown status; treated as active.`), 'active'),
      remind_date: row.remind_date,
      remind_time: row.remind_time,
      // Always rebuilt from the local date + time so the instant means the
      // same wall-clock moment on THIS device; OS notification ids from the
      // old phone are meaningless here — resync re-arms everything.
      remind_at: buildRemindAt(row.remind_date, row.remind_time),
      notification_id: null,
      notes: typeof row.notes === 'string' ? row.notes : '',
      created_at: coerceTimestamp(row.created_at, warnings, label, id, nowStamp, 'created_at'),
      updated_at: coerceTimestamp(row.updated_at, warnings, label, id, nowStamp, 'updated_at'),
    });
  }

  // ---- settings ----------------------------------------------------------
  const settings = {};
  if (data.settings === undefined || data.settings === null) {
    warnings.push('This backup has no settings section; preferences were left as-is.');
  } else if (!isPlainObject(data.settings)) {
    issues.push('The settings section is not an object.');
  } else {
    for (const [key, rawValue] of Object.entries(data.settings)) {
      if (rawValue === null || rawValue === undefined) continue;
      if (typeof rawValue === 'object') {
        warnings.push(`Setting "${key}" holds a structured value that cannot be stored; skipped.`);
        continue;
      }
      settings[key] = String(rawValue);
    }
    if ('currency' in settings && !Object.hasOwn(CURRENCIES, settings.currency)) {
      warnings.push(`Setting "currency" ("${settings.currency}") is not a known currency; dropped.`);
      delete settings.currency;
    }
    if ('theme' in settings && !THEME_VALUES.includes(settings.theme)) {
      warnings.push(`Setting "theme" ("${settings.theme}") is not a known appearance; dropped.`);
      delete settings.theme;
    }
    if ('pinned_budgets' in settings) {
      try {
        const pins = JSON.parse(settings.pinned_budgets);
        if (!Array.isArray(pins)) throw new Error('not an array');
        const kept = [];
        const dropped = [];
        for (const pin of pins) {
          if (typeof pin !== 'string' || pin === '') {
            dropped.push(String(pin));
          } else if (budgetIds.has(pin)) {
            if (!kept.includes(pin)) kept.push(pin);
          } else {
            dropped.push(pin);
          }
        }
        if (dropped.length > 0) {
          warnings.push(
            `Pinned-budget list referenced ${dropped.length} unknown budget(s); those pins were dropped.`,
          );
        }
        settings.pinned_budgets = JSON.stringify(kept);
      } catch {
        warnings.push('The pinned-budgets setting was unreadable and has been dropped.');
        delete settings.pinned_budgets;
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues, warnings };

  const normalized = { accounts, folders, budgets, tags, transactions, subTransactions, reminders, settings };
  return {
    ok: true,
    data: normalized,
    warnings,
    counts: previewCounts(normalized),
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
    appVersion: isPlainObject(parsed.app) ? parsed.app.version ?? null : null,
  };
}

/** Summary numbers for the import preview screen. */
export function previewCounts(data) {
  return {
    accounts: data.accounts.length,
    folders: data.folders.length,
    budgets: data.budgets.length,
    tags: data.tags.length,
    transactions: data.transactions.length,
    breakdownTransactions: data.transactions.filter((tx) => tx.has_breakdown).length,
    breakdownItems: data.subTransactions.length,
    reminders: data.reminders.length,
    activeReminders: data.reminders.filter((r) => r.enabled === 1 && r.status !== 'completed')
      .length,
    settingsKeys: Object.keys(data.settings).length,
  };
}

// =========================================================================
// Merge planning
// =========================================================================

const MERGE_ROW_KINDS = ['accounts', 'folders', 'budgets', 'tags', 'transactions', 'reminders'];

/**
 * Row equality used by the merge planner. Reminders drop their volatile
 * columns (rebaked remind_at, cleared notification id) from the comparison;
 * breakdown items participate with their stable content.
 */
function sameRow(kind, incoming, existing) {
  if (kind === 'transactions') return stableStringify(incoming) === stableStringify(existing);
  if (kind === 'reminders') {
    const strip = ({ remind_at, notification_id, ...rest }) => rest;
    return stableStringify(strip(incoming)) === stableStringify(strip(existing));
  }
  return stableStringify(incoming) === stableStringify(existing);
}

/**
 * Compare a validated backup against the current database, row by row, and
 * produce a review plan. Every incoming record is one group; a transaction
 * plus its breakdown items is a single group that moves together.
 */
export function buildMergePlan(backupData, currentData) {
  const groups = [];
  const counts = { new: 0, identical: 0, conflict: 0 };

  const currentItemsByParent = new Map();
  for (const item of normalizeRows(currentData.subTransactions, 'subTransactions')) {
    const list = currentItemsByParent.get(item.transaction_id) ?? [];
    list.push(item);
    currentItemsByParent.set(item.transaction_id, list);
  }
  for (const list of currentItemsByParent.values()) {
    list.sort((a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id)));
  }

  for (const kind of MERGE_ROW_KINDS) {
    const incoming = normalizeRows(backupData[kind], kind);
    const existing = normalizeRows(currentData[kind], kind);
    const existingById = new Map(existing.map((row) => [String(row.id), row]));
    const incomingItems =
      kind === 'transactions' ? groupItemsByParent(backupData.subTransactions) : null;
    for (const row of incoming) {
      const prior = existingById.get(String(row.id)) ?? null;
      let state;
      if (!prior) {
        state = 'new';
      } else {
        const rowMatch = sameRow(kind, row, prior);
        const itemsMatch =
          !incomingItems ||
          stableStringify(incomingItems.get(row.id) ?? []) ===
            stableStringify(currentItemsByParent.get(row.id) ?? []);
        state = rowMatch && itemsMatch ? 'identical' : 'conflict';
      }
      counts[state] += 1;
      groups.push({
        key: `${kind}:${row.id}`,
        kind,
        id: row.id,
        state,
        resolution: state === 'conflict' ? 'keep' : null,
        incoming: row,
        existing: prior,
        items: incomingItems?.get(row.id) ?? [],
        existingItems: kind === 'transactions' ? currentItemsByParent.get(row.id) ?? [] : [],
      });
    }
  }

  const currentSettings = { ...(currentData.settings ?? {}) };
  for (const [key, value] of Object.entries(backupData.settings ?? {})) {
    const prior = Object.hasOwn(currentSettings, key) ? currentSettings[key] : undefined;
    const state = prior === undefined ? 'new' : String(prior) === String(value) ? 'identical' : 'conflict';
    counts[state] += 1;
    groups.push({
      key: `settings:${key}`,
      kind: 'settings',
      id: key,
      state,
      resolution: state === 'conflict' ? 'keep' : null,
      incoming: { key, value },
      existing: prior === undefined ? null : { key, value: prior },
      items: [],
      existingItems: [],
    });
  }

  return { groups, counts };
}

function groupItemsByParent(items) {
  const map = new Map();
  for (const item of normalizeRows(items, 'subTransactions')) {
    const list = map.get(item.transaction_id) ?? [];
    list.push(item);
    map.set(item.transaction_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id)));
  }
  return map;
}

/** Human label for a conflict row in the review UI. */
export function describeConflict(group, { currency }) {
  const row = group.incoming;
  switch (group.kind) {
    case 'budgets':
      return { title: row.name, detail: `${row.start_date} → ${row.end_date}` };
    case 'folders':
      return { title: row.name, detail: 'Budget folder' };
    case 'tags':
      return { title: `${row.emoji ?? ''} ${row.name}`.trim(), detail: 'Tag' };
    case 'transactions': {
      const amount = formatCurrency(Number(row.amount), { currency });
      return { title: row.description || row.type, detail: `${row.transaction_date} · ${amount}` };
    }
    case 'reminders':
      return { title: row.notes || 'Reminder', detail: `${row.remind_date} ${row.remind_time}` };
    case 'accounts':
      return { title: row.name, detail: row.type };
    case 'settings':
      return { title: row.key, detail: `imported value: ${row.value}` };
    default:
      return { title: String(row?.id ?? group.key), detail: group.kind };
  }
}

/** Switch one conflict group's resolution. */
export function resolveGroup(plan, key, resolution) {
  return {
    ...plan,
    groups: plan.groups.map((group) =>
      group.key === key && group.state === 'conflict' ? { ...group, resolution } : group,
    ),
  };
}

/**
 * Translate a decided plan into the exact ordered writes for the adapter.
 * Parents before children; replacing a transaction updates the parent in
 * place and swaps its children — it never deletes the parent, so current
 * reminders keep valid links.
 */
export function compileMergeWrites(plan) {
  const writes = [];
  const byKind = (kind) => plan.groups.filter((group) => group.kind === kind);

  for (const group of byKind('accounts')) {
    if (group.state === 'new') writes.push({ op: 'insertAccount', row: group.incoming });
    else if (group.state === 'conflict' && group.resolution === 'replace')
      writes.push({ op: 'replaceAccount', row: group.incoming });
  }
  for (const group of byKind('folders')) {
    if (group.state === 'new') writes.push({ op: 'insertFolder', row: group.incoming });
    else if (group.state === 'conflict' && group.resolution === 'replace')
      writes.push({ op: 'replaceFolder', row: group.incoming });
  }
  for (const group of byKind('budgets')) {
    if (group.state === 'new') writes.push({ op: 'insertBudget', row: group.incoming });
    else if (group.state === 'conflict' && group.resolution === 'replace')
      writes.push({ op: 'replaceBudget', row: group.incoming });
  }
  for (const group of byKind('tags')) {
    if (group.state === 'new') writes.push({ op: 'insertTag', row: group.incoming });
    else if (group.state === 'conflict' && group.resolution === 'replace')
      writes.push({ op: 'replaceTag', row: group.incoming });
  }
  for (const group of byKind('transactions')) {
    if (group.state === 'new') {
      writes.push({ op: 'insertTransaction', row: group.incoming });
      for (const item of group.items) writes.push({ op: 'insertSubTransaction', row: item });
    } else if (group.state === 'conflict' && group.resolution === 'replace') {
      writes.push({ op: 'replaceTransaction', row: group.incoming });
      writes.push({ op: 'clearSubTransactions', transactionId: group.id });
      for (const item of group.items) writes.push({ op: 'insertSubTransaction', row: item });
    }
  }
  for (const group of byKind('reminders')) {
    if (group.state === 'new') writes.push({ op: 'insertReminder', row: group.incoming });
    else if (group.state === 'conflict' && group.resolution === 'replace')
      writes.push({ op: 'replaceReminder', row: group.incoming });
  }
  for (const group of byKind('settings')) {
    if (group.state === 'new' || (group.state === 'conflict' && group.resolution === 'replace')) {
      writes.push({ op: 'setSetting', key: group.incoming.key, value: group.incoming.value });
    }
  }
  return writes;
}

/**
 * Project what the database WOULD contain after a merge, without writing
 * anything, and re-validate that shape. Used as the commit gate: a merge
 * that would create invalid data is aborted before its first write.
 */
export function projectMergeResult(currentData, writes) {
  const projected = {
    accounts: normalizeRows(currentData.accounts, 'accounts').map((row) => ({ ...row })),
    folders: normalizeRows(currentData.folders, 'folders').map((row) => ({ ...row })),
    budgets: normalizeRows(currentData.budgets, 'budgets').map((row) => ({ ...row })),
    tags: normalizeRows(currentData.tags, 'tags').map((row) => ({ ...row })),
    transactions: normalizeRows(currentData.transactions, 'transactions').map((row) => ({ ...row })),
    subTransactions: normalizeRows(currentData.subTransactions, 'subTransactions').map((row) => ({
      ...row,
    })),
    reminders: normalizeRows(currentData.reminders, 'reminders').map((row) => ({ ...row })),
    settings: { ...(currentData.settings ?? {}) },
  };
  const byId = (list, id) => list.find((row) => String(row.id) === String(id));

  for (const write of writes) {
    switch (write.op) {
      case 'insertAccount':
        projected.accounts.push({ ...write.row });
        break;
      case 'replaceAccount':
        Object.assign(byId(projected.accounts, write.row.id) ?? {}, write.row);
        break;
      case 'insertFolder':
        projected.folders.push({ ...write.row });
        break;
      case 'replaceFolder':
        Object.assign(byId(projected.folders, write.row.id) ?? {}, write.row);
        break;
      case 'insertBudget':
        projected.budgets.push({ ...write.row });
        break;
      case 'replaceBudget':
        Object.assign(byId(projected.budgets, write.row.id) ?? {}, write.row);
        break;
      case 'insertTag':
        projected.tags.push({ ...write.row });
        break;
      case 'replaceTag':
        Object.assign(byId(projected.tags, write.row.id) ?? {}, write.row);
        break;
      case 'insertTransaction':
        projected.transactions.push({ ...write.row });
        break;
      case 'replaceTransaction':
        Object.assign(byId(projected.transactions, write.row.id) ?? {}, write.row);
        break;
      case 'clearSubTransactions':
        projected.subTransactions = projected.subTransactions.filter(
          (item) => String(item.transaction_id) !== String(write.transactionId),
        );
        break;
      case 'insertSubTransaction':
        projected.subTransactions.push({ ...write.row });
        break;
      case 'insertReminder':
        projected.reminders.push({ ...write.row });
        break;
      case 'replaceReminder':
        Object.assign(byId(projected.reminders, write.row.id) ?? {}, write.row);
        break;
      case 'setSetting':
        projected.settings[write.key] = write.value;
        break;
      default:
        break;
    }
  }

  const result = validateBackup({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    data: projected,
  });
  if (!result.ok) return { data: projected, issues: result.issues };
  return { data: projected, issues: [], warnings: result.warnings };
}
