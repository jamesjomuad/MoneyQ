/**
 * File-level orchestration for single-budget export/import.
 *
 * The format itself lives in `utils/budgetTransfer.js` and the database work
 * in `storage/repositories/budgetTransferRepository.js`. This module only
 * joins them to the device: it reads receipt images out of app storage on
 * export, writes them back under fresh app-managed names on import, and hands
 * the JSON to the existing file service.
 *
 * Receipt files are written before the database transaction so every
 * attachment row can point at a file that already exists. If the transaction
 * fails, every file written for that import is deleted again — the repository
 * rolls the rows back, and this module removes the bytes.
 */

import Constants from 'expo-constants';

import { storage } from '../storage/adapters/adapter';
import {
  applyBudgetTransferImport,
  readBudgetImportContext,
  readBudgetTransferSource,
} from '../storage/repositories/budgetTransferRepository';
import {
  buildBudgetTransferFileName,
  extensionForMimeType,
  mimeTypeForReceiptPath,
  parseBudgetTransferText,
  planBudgetImport,
  serializeBudgetTransfer,
  stringifyBudgetTransfer,
} from '../utils/budgetTransfer';
import { todayIso } from '../utils/dates';
import { pickBackup, saveBackup, saveBackupToUserFile } from './fileService';
import { deleteReceiptFile, readReceiptBase64, writeReceiptBase64 } from './receiptFiles';

function appVersion() {
  return Constants.expoConfig?.version ?? null;
}

/**
 * Read one budget and package it. `destination` matches the backup screen:
 * `'save'` asks for a folder, `'share'` opens the share sheet.
 *
 * A receipt that cannot be read is reported as a warning and left out; the
 * rest of the file is still valid. A missing image never breaks the export.
 */
export async function exportBudgetTransfer(budgetId, destination = 'save') {
  const source = await readBudgetTransferSource(storage, budgetId);
  if (!source) {
    throw new Error('That budget could not be found. It may have been archived or deleted.');
  }

  const currency = await storage.getSetting('currency', null);
  const descriptionById = new Map(
    source.transactions.map((row) => [row.id, row.description?.trim() || 'a transaction']),
  );
  const warnings = [];
  const attachments = [];

  for (const row of source.attachments) {
    const mimeType = mimeTypeForReceiptPath(row.path);
    if (!mimeType) {
      warnings.push('A receipt image has an unknown file type and was left out.');
      continue;
    }
    const data = await readReceiptBase64(row.path);
    if (!data) {
      warnings.push(
        `The receipt for "${descriptionById.get(row.transaction_id) ?? 'a transaction'}" could not be read and was left out.`,
      );
      continue;
    }
    attachments.push({
      id: row.id,
      transaction_id: row.transaction_id,
      mime_type: mimeType,
      data,
    });
  }

  const envelope = serializeBudgetTransfer(
    { ...source, attachments },
    { currency, appVersion: appVersion() },
  );
  const json = stringifyBudgetTransfer(envelope);
  const fileName = buildBudgetTransferFileName(source.budget.name, todayIso());
  const saved =
    destination === 'share'
      ? await saveBackup(json, fileName)
      : await saveBackupToUserFile(json, fileName);

  return {
    fileName: saved?.name ?? fileName,
    saved: saved != null,
    warnings,
    counts: {
      transactions: source.transactions.length,
      breakdownItems: source.breakdownItems.length,
      tags: source.tags.length,
      reminders: source.reminders.length,
      attachments: attachments.length,
    },
  };
}

/**
 * Pick a budget file and validate it without touching the database. Returns
 * `null` when the user cancels the picker.
 */
export async function pickBudgetTransfer() {
  const picked = await pickBackup();
  if (!picked) return null;
  return { fileName: picked.name, validation: parseBudgetTransferText(picked.text) };
}

/**
 * Import an already validated file as a new, independent budget.
 *
 * `folderId` is resolved again here: a folder can be deleted while the preview
 * is open, and an import must never point at a folder that no longer exists.
 */
export async function importBudgetTransfer(validation, { folderId = null } = {}) {
  if (!validation?.ok) {
    throw new Error('The budget file has not been validated.');
  }

  let destinationFolderId = folderId ?? null;
  if (destinationFolderId) {
    const folder = await storage.getFolder(destinationFolderId);
    if (!folder) destinationFolderId = null;
  }

  const [context, currency] = await Promise.all([
    readBudgetImportContext(storage),
    storage.getSetting('currency', null),
  ]);
  const plan = planBudgetImport(validation, {
    existingTags: context.existingTags,
    existingBudgetNames: context.existingBudgetNames,
    targetCurrency: currency,
    folderId: destinationFolderId,
  });

  const writtenPaths = [];
  try {
    for (const attachment of plan.attachments) {
      const extension = extensionForMimeType(attachment.mime_type);
      if (!extension) {
        throw new Error('An imported receipt has an unsupported image type.');
      }
      const path = await writeReceiptBase64(attachment.data, extension);
      writtenPaths.push(path);
      attachment.path = path;
    }

    const budget = await applyBudgetTransferImport(storage, plan, {
      folderId: destinationFolderId,
    });

    return {
      budget,
      budgetName: budget.name,
      counts: plan.counts,
      warnings: plan.warnings,
    };
  } catch (error) {
    for (const path of writtenPaths) deleteReceiptFile(path);
    throw error;
  }
}
