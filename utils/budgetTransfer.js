/**
 * Single-budget transfer format (`budgetarian-budget`, version 1).
 *
 * One budget and everything it owns, in one JSON file: its period, its
 * transactions, their breakdown items, the tag definitions those transactions
 * reference, the reminders attached to them, and portable receipt images. It
 * deliberately contains no folders, accounts, other budgets, or global
 * settings — a budget file is not a backup.
 *
 * The module is pure: parsing, validation and import planning never touch
 * storage or files. The repository supplies existing names and tags, and the
 * service supplies the file bytes, so the same rules run on device and in the
 * verification scripts.
 *
 * Attachments travel as base64 with a MIME type. A stored path is never
 * exported: the importer writes the bytes into its own receipts folder and
 * stores the new path it created, so a tampered file can never point the app
 * at an arbitrary path on disk.
 */

import { TRANSACTION_TYPES } from '../constants/finance';
import { computeBreakdownTotal, isHhMm, isIsoCalendarDate } from './breakdown';
import { CURRENCIES } from './currency';
import { createId, nowIso } from './id';
import { PAYMENT_STATUSES } from './paymentStatus';
import { REMINDER_STATUSES, buildRemindAt } from './reminders';

export const BUDGET_TRANSFER_FORMAT = 'budgetarian-budget';
export const BUDGET_TRANSFER_FORMAT_VERSION = 1;

/** Same ceiling as a full backup: a budget file is never a data dump. */
export const MAX_BUDGET_TRANSFER_CHARACTERS = 20_000_000;

/** One receipt image, and the whole set, stay inside these bounds. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024;

export const ATTACHMENT_MIME_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

const EXTENSION_MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_BUDGET_NAME = 120;
const MAX_TAG_NAME = 40;

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function lowerName(value) {
  return text(value).trim().toLocaleLowerCase();
}

function normalizeColor(value, warnings, label) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && HEX_COLOR.test(value)) return value.toUpperCase();
  warnings.push(`${label} had an unrecognized colour and will use the default.`);
  return null;
}

function isFlag(value) {
  return value === true || value === 1 || value === '1';
}

function base64Bytes(value) {
  const textValue = text(value).replace(/\s/g, '');
  if (!textValue) return 0;
  const padding = textValue.endsWith('==') ? 2 : textValue.endsWith('=') ? 1 : 0;
  return Math.floor((textValue.length * 3) / 4) - padding;
}

function isBase64(value) {
  const textValue = text(value).replace(/\s/g, '');
  if (!textValue || textValue.length % 4 === 1) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(textValue);
}

/** File extension for a receipt path, keyed off the MIME allowlist. */
export function extensionForMimeType(mimeType) {
  return ATTACHMENT_MIME_EXTENSIONS[mimeType] ?? null;
}

/** MIME type for a stored `receipts/<name>.<ext>` path, or null. */
export function mimeTypeForReceiptPath(path) {
  const match = /\.([a-z0-9]+)$/i.exec(text(path));
  return match ? EXTENSION_MIME_TYPES[match[1].toLowerCase()] ?? null : null;
}

/** `Budgetarian-<Budget>-YYYY-MM-DD.json`, safe for a document provider. */
export function buildBudgetTransferFileName(budgetName, todayIso) {
  const base =
    text(budgetName)
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'Budget';
  return `Budgetarian-${base}-${todayIso}.json`;
}

/**
 * A name that does not collide with existing budgets. Budgets may share a
 * name in the database, but an import should be identifiable in the list, so
 * the first duplicate becomes "(Imported)" and later ones count up.
 */
export function uniqueBudgetName(name, existingNames = []) {
  const base = text(name).trim();
  const taken = new Set(existingNames.map(lowerName));
  if (!taken.has(lowerName(base))) return base;

  let candidate = `${base} (Imported)`;
  let index = 2;
  while (taken.has(lowerName(candidate))) {
    candidate = `${base} (Imported ${index})`;
    index += 1;
  }
  return candidate;
}

/**
 * Project stored rows into the portable envelope. `source.attachments` must
 * already carry `mime_type` and base64 `data`; the repository never does file
 * IO, so the service fills those in first.
 */
export function serializeBudgetTransfer(source, options = {}) {
  const { budget, transactions = [], breakdownItems = [], tags = [], reminders = [], attachments = [] } =
    source;

  return {
    format: BUDGET_TRANSFER_FORMAT,
    formatVersion: BUDGET_TRANSFER_FORMAT_VERSION,
    createdAt: options.createdAt ?? nowIso(),
    app: {
      name: 'Budgetarian',
      version: options.appVersion ?? null,
    },
    budget: {
      name: budget.name,
      start_date: budget.start_date,
      end_date: budget.end_date,
      color: budget.color ?? null,
    },
    settings: {
      currency: options.currency ?? null,
    },
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      emoji: tag.emoji ?? null,
      color: tag.color ?? null,
    })),
    transactions: transactions.map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      tag_id: row.tag_id ?? null,
      description: row.description ?? '',
      transaction_date: row.transaction_date,
      payment_status: row.payment_status ?? null,
      has_breakdown: row.has_breakdown ? 1 : 0,
      payment_due_date: row.payment_due_date ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    })),
    breakdownItems: breakdownItems.map((row) => ({
      id: row.id,
      transaction_id: row.transaction_id,
      description: row.description,
      amount: row.amount,
      position: row.position ?? 0,
      purchase_date: row.purchase_date ?? null,
      purchase_time: row.purchase_time ?? null,
      notes: row.notes ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    })),
    reminders: reminders.map((row) => ({
      id: row.id,
      transaction_id: row.transaction_id,
      enabled: row.enabled ? 1 : 0,
      status: row.status ?? 'active',
      remind_date: row.remind_date,
      remind_time: row.remind_time,
      notes: row.notes ?? '',
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    })),
    attachments: attachments.map((row) => ({
      id: row.id,
      transaction_id: row.transaction_id,
      mime_type: row.mime_type,
      data: row.data,
    })),
  };
}

export function stringifyBudgetTransfer(envelope) {
  return JSON.stringify(envelope, null, 2);
}

/** Parse text and validate it. Returns a validation result either way. */
export function parseBudgetTransferText(rawText) {
  const raw = String(rawText ?? '');
  if (!raw.trim()) {
    return { ok: false, issues: ['The file is empty.'], warnings: [] };
  }
  if (raw.length > MAX_BUDGET_TRANSFER_CHARACTERS) {
    return {
      ok: false,
      issues: ['This budget file is too large to import.'],
      warnings: [],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      issues: ['This file is not valid JSON.'],
      warnings: [],
    };
  }

  return validateBudgetTransfer(parsed);
}

/**
 * Validate a parsed envelope without touching storage. Every issue is
 * collected so the preview can explain everything wrong at once instead of
 * making the user fix one thing per attempt.
 */
export function validateBudgetTransfer(parsed) {
  const issues = [];
  const warnings = [];

  if (!isObject(parsed)) {
    return { ok: false, issues: ['This file is not a Budgetarian budget file.'], warnings };
  }
  if (parsed.format !== BUDGET_TRANSFER_FORMAT) {
    return { ok: false, issues: ['This file is not a Budgetarian budget file.'], warnings };
  }

  const version = Number(parsed.formatVersion);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, issues: ['The file is missing a valid format version.'], warnings };
  }
  if (version > BUDGET_TRANSFER_FORMAT_VERSION) {
    return {
      ok: false,
      issues: ['This budget was exported by a newer version of Budgetarian. Update the app to import it.'],
      warnings,
    };
  }

  const rawBudget = isObject(parsed.budget) ? parsed.budget : null;
  if (!rawBudget) issues.push('The file has no budget details.');

  const budgetName = text(rawBudget?.name).trim();
  if (!budgetName) issues.push('The budget name is missing.');
  else if (budgetName.length > MAX_BUDGET_NAME) {
    issues.push(`The budget name is longer than ${MAX_BUDGET_NAME} characters.`);
  }

  if (!isIsoCalendarDate(rawBudget?.start_date)) {
    issues.push('The budget start date is not a real calendar date (YYYY-MM-DD).');
  }
  if (!isIsoCalendarDate(rawBudget?.end_date)) {
    issues.push('The budget end date is not a real calendar date (YYYY-MM-DD).');
  }
  if (
    isIsoCalendarDate(rawBudget?.start_date) &&
    isIsoCalendarDate(rawBudget?.end_date) &&
    rawBudget.start_date > rawBudget.end_date
  ) {
    issues.push('The budget end date is before its start date.');
  }

  const currency = isObject(parsed.settings) ? text(parsed.settings.currency) : '';
  let validCurrency = null;
  if (currency) {
    if (Object.prototype.hasOwnProperty.call(CURRENCIES, currency)) validCurrency = currency;
    else warnings.push(`The exported currency "${currency}" is not supported here and was ignored.`);
  }

  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : null;
  const rawTransactions = Array.isArray(parsed.transactions) ? parsed.transactions : null;
  const rawBreakdown = Array.isArray(parsed.breakdownItems) ? parsed.breakdownItems : null;
  const rawReminders = Array.isArray(parsed.reminders) ? parsed.reminders : null;
  const rawAttachments = Array.isArray(parsed.attachments) ? parsed.attachments : null;

  if (!rawTags) issues.push('The file has no tag list.');
  if (!rawTransactions) issues.push('The file has no transaction list.');
  if (!rawBreakdown) issues.push('The file has no breakdown item list.');
  if (!rawReminders) issues.push('The file has no reminder list.');
  if (!rawAttachments) issues.push('The file has no attachment list.');

  if (issues.length > 0) {
    return { ok: false, issues, warnings };
  }

  const nowStamp = typeof parsed.createdAt === 'string' ? parsed.createdAt : nowIso();

  // --- tags -----------------------------------------------------------
  const tagIds = new Set();
  const tagNames = new Set();
  const tags = [];
  for (const raw of rawTags) {
    if (!isObject(raw)) {
      issues.push('A tag entry is not an object.');
      continue;
    }
    const id = text(raw.id).trim();
    if (!id) {
      issues.push('A tag is missing its id.');
      continue;
    }
    if (tagIds.has(id)) {
      issues.push(`The tag id "${id}" appears more than once.`);
      continue;
    }
    tagIds.add(id);

    const name = text(raw.name).trim();
    if (!name) {
      issues.push(`Tag "${id}" has no name.`);
      continue;
    }
    if (name.length > MAX_TAG_NAME) {
      issues.push(`Tag "${name}" is longer than ${MAX_TAG_NAME} characters.`);
      continue;
    }
    const key = lowerName(name);
    if (tagNames.has(key)) {
      issues.push(`The tag name "${name}" appears more than once.`);
      continue;
    }
    tagNames.add(key);

    tags.push({
      id,
      name,
      emoji: text(raw.emoji).trim() || '🏷️',
      color: normalizeColor(raw.color, warnings, `Tag "${name}"`),
    });
  }

  // --- transactions ---------------------------------------------------
  const transactionIds = new Set();
  const transactions = [];
  for (const raw of rawTransactions) {
    if (!isObject(raw)) {
      issues.push('A transaction entry is not an object.');
      continue;
    }
    const id = text(raw.id).trim();
    if (!id) {
      issues.push('A transaction is missing its id.');
      continue;
    }
    if (transactionIds.has(id)) {
      issues.push(`The transaction id "${id}" appears more than once.`);
      continue;
    }
    transactionIds.add(id);

    const type = text(raw.type);
    if (!TRANSACTION_TYPES.includes(type)) {
      issues.push(`Transaction "${id}" has an unknown type.`);
      continue;
    }
    if (type === 'transfer' || raw.account_id != null || raw.to_account_id != null) {
      issues.push(
        'This file contains a transfer or linked account. Single-budget files cannot carry accounts.',
      );
      continue;
    }

    if (!Number.isInteger(raw.amount) || raw.amount < 0) {
      issues.push(`Transaction "${id}" has an invalid amount.`);
      continue;
    }

    if (!isIsoCalendarDate(raw.transaction_date)) {
      issues.push(`Transaction "${id}" has an invalid date.`);
      continue;
    }

    const tagId = raw.tag_id == null ? null : text(raw.tag_id);
    if (tagId && !tagIds.has(tagId)) {
      issues.push(`Transaction "${id}" references a tag that is not in the file.`);
      continue;
    }

    if (typeof raw.description !== 'string') {
      issues.push(`Transaction "${id}" has an invalid description.`);
      continue;
    }

    const hasBreakdown = isFlag(raw.has_breakdown);
    if (!hasBreakdown && raw.amount <= 0) {
      issues.push(`Transaction "${id}" must have a positive amount.`);
      continue;
    }

    let paymentStatus = null;
    if (raw.payment_status != null && raw.payment_status !== '') {
      if (!PAYMENT_STATUSES.includes(raw.payment_status)) {
        issues.push(`Transaction "${id}" has an invalid payment status.`);
        continue;
      }
      paymentStatus = raw.payment_status;
    } else {
      paymentStatus = 'paid';
    }

    let dueDate = raw.payment_due_date ?? null;
    if (dueDate === '') dueDate = null;
    if (dueDate != null && !isIsoCalendarDate(dueDate)) {
      issues.push(`Transaction "${id}" has an invalid payment due date.`);
      continue;
    }

    transactions.push({
      id,
      type,
      amount: raw.amount,
      tag_id: tagId,
      description: raw.description,
      transaction_date: raw.transaction_date,
      payment_status: paymentStatus,
      has_breakdown: hasBreakdown ? 1 : 0,
      payment_due_date: dueDate,
      created_at: text(raw.created_at) || nowStamp,
      updated_at: text(raw.updated_at) || nowStamp,
    });
  }

  // --- breakdown items ------------------------------------------------
  const itemIds = new Set();
  const itemsByTransaction = new Map();
  const breakdownItems = [];
  for (const raw of rawBreakdown) {
    if (!isObject(raw)) {
      issues.push('A breakdown item is not an object.');
      continue;
    }
    const id = text(raw.id).trim();
    if (!id) {
      issues.push('A breakdown item is missing its id.');
      continue;
    }
    if (itemIds.has(id)) {
      issues.push(`The breakdown item id "${id}" appears more than once.`);
      continue;
    }
    itemIds.add(id);

    const transactionId = text(raw.transaction_id).trim();
    if (!transactionIds.has(transactionId)) {
      issues.push(`Breakdown item "${id}" references a transaction that is not in the file.`);
      continue;
    }
    if (!Number.isInteger(raw.amount)) {
      issues.push(`Breakdown item "${id}" has an invalid amount.`);
      continue;
    }
    const description = text(raw.description).trim();
    if (!description) {
      issues.push(`Breakdown item "${id}" has no description.`);
      continue;
    }
    const purchaseDate = raw.purchase_date ?? null;
    if (purchaseDate != null && purchaseDate !== '' && !isIsoCalendarDate(purchaseDate)) {
      issues.push(`Breakdown item "${id}" has an invalid purchase date.`);
      continue;
    }
    const purchaseTime = raw.purchase_time ?? null;
    if (purchaseTime != null && purchaseTime !== '' && !isHhMm(purchaseTime)) {
      issues.push(`Breakdown item "${id}" has an invalid purchase time.`);
      continue;
    }

    const item = {
      id,
      transaction_id: transactionId,
      description,
      amount: raw.amount,
      position: Number.isInteger(raw.position) ? raw.position : 0,
      purchase_date: purchaseDate || null,
      purchase_time: purchaseTime || null,
      notes: raw.notes == null ? null : text(raw.notes),
      created_at: text(raw.created_at) || nowStamp,
      updated_at: text(raw.updated_at) || nowStamp,
    };
    breakdownItems.push(item);
    const group = itemsByTransaction.get(transactionId) ?? [];
    group.push(item);
    itemsByTransaction.set(transactionId, group);
  }

  for (const transaction of transactions) {
    const items = itemsByTransaction.get(transaction.id) ?? [];
    if (items.length > 0 && !transaction.has_breakdown) {
      transaction.has_breakdown = 1;
      warnings.push(`Transaction "${transaction.description || transaction.id}" had breakdown items and was marked as a breakdown.`);
    }
    if (transaction.has_breakdown) {
      if (items.length === 0) {
        issues.push(`Transaction "${transaction.description || transaction.id}" is marked as a breakdown but has no items.`);
        continue;
      }
      const total = computeBreakdownTotal(items);
      if (total < 0) {
        issues.push(`The breakdown for "${transaction.description || transaction.id}" totals below zero.`);
      } else if (total !== transaction.amount) {
        issues.push(`The breakdown for "${transaction.description || transaction.id}" does not add up to its amount.`);
      }
    }
  }

  // --- reminders ------------------------------------------------------
  const reminderIds = new Set();
  const reminders = [];
  for (const raw of rawReminders) {
    if (!isObject(raw)) {
      issues.push('A reminder entry is not an object.');
      continue;
    }
    const id = text(raw.id).trim();
    if (!id) {
      issues.push('A reminder is missing its id.');
      continue;
    }
    if (reminderIds.has(id)) {
      issues.push(`The reminder id "${id}" appears more than once.`);
      continue;
    }
    reminderIds.add(id);

    const transactionId = text(raw.transaction_id).trim();
    if (!transactionIds.has(transactionId)) {
      issues.push(`Reminder "${id}" is not linked to a transaction in this file.`);
      continue;
    }
    if (!isIsoCalendarDate(raw.remind_date)) {
      issues.push(`Reminder "${id}" has an invalid date.`);
      continue;
    }
    if (!isHhMm(raw.remind_time)) {
      issues.push(`Reminder "${id}" has an invalid time.`);
      continue;
    }
    if (buildRemindAt(raw.remind_date, raw.remind_time) == null) {
      issues.push(`Reminder "${id}" has a date or time that cannot be scheduled.`);
      continue;
    }
    const status = REMINDER_STATUSES.includes(raw.status) ? raw.status : 'active';

    reminders.push({
      id,
      transaction_id: transactionId,
      enabled: isFlag(raw.enabled) ? 1 : 0,
      status,
      remind_date: raw.remind_date,
      remind_time: raw.remind_time,
      notes: text(raw.notes),
      created_at: text(raw.created_at) || nowStamp,
      updated_at: text(raw.updated_at) || nowStamp,
    });
  }

  // --- attachments ----------------------------------------------------
  const attachmentIds = new Set();
  const attachments = [];
  let totalAttachmentBytes = 0;
  for (const raw of rawAttachments) {
    if (!isObject(raw)) {
      issues.push('An attachment entry is not an object.');
      continue;
    }
    const id = text(raw.id).trim();
    if (!id) {
      issues.push('An attachment is missing its id.');
      continue;
    }
    if (attachmentIds.has(id)) {
      issues.push(`The attachment id "${id}" appears more than once.`);
      continue;
    }
    attachmentIds.add(id);

    const transactionId = text(raw.transaction_id).trim();
    if (!transactionIds.has(transactionId)) {
      issues.push(`Attachment "${id}" is not linked to a transaction in this file.`);
      continue;
    }
    const mimeType = text(raw.mime_type);
    if (!ATTACHMENT_MIME_EXTENSIONS[mimeType]) {
      issues.push(`Attachment "${id}" has an unsupported image type.`);
      continue;
    }
    if (!isBase64(raw.data)) {
      issues.push(`Attachment "${id}" is not valid base64 image data.`);
      continue;
    }
    const bytes = base64Bytes(raw.data);
    if (bytes <= 0) {
      issues.push(`Attachment "${id}" is empty.`);
      continue;
    }
    if (bytes > MAX_ATTACHMENT_BYTES) {
      issues.push(`Attachment "${id}" is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`);
      continue;
    }
    totalAttachmentBytes += bytes;
    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      issues.push(
        `The receipt images are larger than ${MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)} MB in total.`,
      );
      break;
    }

    attachments.push({
      id,
      transaction_id: transactionId,
      mime_type: mimeType,
      data: text(raw.data).replace(/\s/g, ''),
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues, warnings };
  }

  return {
    ok: true,
    issues: [],
    warnings,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
    appVersion: isObject(parsed.app) ? text(parsed.app.version) || null : null,
    data: {
      budget: {
        name: budgetName,
        start_date: rawBudget.start_date,
        end_date: rawBudget.end_date,
        color: normalizeColor(rawBudget.color, warnings, 'The budget colour'),
      },
      settings: { currency: validCurrency },
      tags,
      transactions,
      breakdownItems,
      reminders,
      attachments,
    },
    counts: {
      transactions: transactions.length,
      breakdownItems: breakdownItems.length,
      tags: tags.length,
      reminders: reminders.length,
      activeReminders: reminders.filter((row) => row.enabled && row.status === 'active').length,
      attachments: attachments.length,
    },
  };
}

/**
 * Turn validated file data into fresh rows for storage. Every id is minted
 * here, every reference is remapped through the maps built alongside it, and
 * existing tags are reused by name so the file cannot create a second "Food"
 * tag. The caller supplies the destination folder; this module never reads
 * storage.
 */
export function planBudgetImport(validated, options = {}) {
  if (!validated?.ok) throw new Error('The budget file must be validated before it can be imported.');

  const data = validated.data;
  const makeId = options.createId ?? createId;
  const timestamp = options.timestamp ?? nowIso();
  const folderId = options.folderId ?? null;
  const existingTags = options.existingTags ?? [];
  const existingBudgetNames = options.existingBudgetNames ?? [];
  const targetCurrency = options.targetCurrency ?? null;

  const warnings = [...(validated.warnings ?? [])];
  const activeTagByName = new Map();
  const everyTagName = new Set();
  for (const tag of existingTags) {
    const key = lowerName(tag.name);
    everyTagName.add(key);
    if (!tag.archived) activeTagByName.set(key, tag);
  }

  const sourceTagToId = new Map();
  const newTags = [];
  for (const tag of data.tags) {
    const key = lowerName(tag.name);
    const existing = activeTagByName.get(key);
    if (existing) {
      sourceTagToId.set(tag.id, existing.id);
      continue;
    }

    let finalName = tag.name;
    if (everyTagName.has(key)) {
      finalName = `${tag.name} (Imported)`;
      let index = 2;
      while (everyTagName.has(lowerName(finalName))) {
        finalName = `${tag.name} (Imported ${index})`;
        index += 1;
      }
      warnings.push(
        `Tag "${tag.name}" already exists in the archive; the imported tag is named "${finalName}".`,
      );
    }

    const id = makeId('tag');
    sourceTagToId.set(tag.id, id);
    everyTagName.add(lowerName(finalName));
    newTags.push({
      id,
      name: finalName,
      emoji: tag.emoji,
      color: tag.color,
      is_default: 0,
      archived: 0,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  const budgetName = uniqueBudgetName(data.budget.name, existingBudgetNames);
  if (budgetName !== data.budget.name) {
    warnings.push(`Renamed to "${budgetName}" because a budget with that name already exists.`);
  }

  const exportedCurrency = data.settings?.currency ?? null;
  if (exportedCurrency && targetCurrency && exportedCurrency !== targetCurrency) {
    warnings.push(
      `This budget was exported in ${exportedCurrency}; your app uses ${targetCurrency}. Amounts are unchanged.`,
    );
  }

  const budget = {
    id: makeId('budget'),
    name: budgetName,
    start_date: data.budget.start_date,
    end_date: data.budget.end_date,
    color: data.budget.color,
    folder_id: folderId,
    position: 0,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  };

  const sourceTransactionToId = new Map();
  const transactions = data.transactions.map((row) => {
    const id = makeId('tx');
    sourceTransactionToId.set(row.id, id);
    return {
      id,
      budget_id: budget.id,
      type: row.type,
      amount: row.amount,
      tag_id: row.tag_id ? sourceTagToId.get(row.tag_id) ?? null : null,
      account_id: null,
      to_account_id: null,
      description: row.description,
      transaction_date: row.transaction_date,
      payment_status: row.payment_status,
      has_breakdown: row.has_breakdown,
      payment_due_date: row.payment_due_date,
      created_at: row.created_at ?? timestamp,
      updated_at: row.updated_at ?? timestamp,
    };
  });

  const positions = new Map();
  const breakdownItems = data.breakdownItems.map((row) => {
    const transactionId = sourceTransactionToId.get(row.transaction_id);
    const position = positions.get(transactionId) ?? 0;
    positions.set(transactionId, position + 1);
    return {
      id: makeId('subtx'),
      transaction_id: transactionId,
      description: row.description,
      amount: row.amount,
      position,
      purchase_date: row.purchase_date,
      purchase_time: row.purchase_time,
      notes: row.notes,
      created_at: row.created_at ?? timestamp,
      updated_at: row.updated_at ?? timestamp,
    };
  });

  const reminders = data.reminders.map((row) => ({
    id: makeId('rem'),
    transaction_id: sourceTransactionToId.get(row.transaction_id),
    enabled: row.enabled,
    status: row.status,
    remind_date: row.remind_date,
    remind_time: row.remind_time,
    remind_at: buildRemindAt(row.remind_date, row.remind_time),
    notification_id: null,
    notes: row.notes,
    created_at: row.created_at ?? timestamp,
    updated_at: row.updated_at ?? timestamp,
  }));

  const attachments = data.attachments.map((row) => ({
    id: makeId('att'),
    source_id: row.id,
    transaction_id: sourceTransactionToId.get(row.transaction_id),
    mime_type: row.mime_type,
    data: row.data,
  }));

  return {
    budget,
    tags: newTags,
    transactions,
    breakdownItems,
    reminders,
    attachments,
    warnings,
    budgetName,
    sourceBudgetName: data.budget.name,
    counts: {
      transactions: transactions.length,
      breakdownItems: breakdownItems.length,
      tags: newTags.length,
      reminders: reminders.length,
      attachments: attachments.length,
    },
  };
}
