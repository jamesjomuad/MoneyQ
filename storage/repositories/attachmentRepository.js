/**
 * Attachment rules live here; adapters only translate them. An attachment
 * is one image file belonging to one transaction: the row stores only a
 * document-relative reference (`receipts/<name>.<ext>`) and the bytes are
 * managed by services/receiptFiles.js. Deleting a transaction cascades its
 * attachment rows (mirrored by both adapters); the files themselves are
 * removed by the store, which owns the "row first, file second" order so a
 * failed delete can never leave a reference pointing at nothing.
 */
import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';

/**
 * Reference rule: the path must name a plain file inside the app's own
 * receipts folder. Absolute URIs, cache paths and traversal are rejected
 * so a stored row can never point outside app-managed storage.
 */
const ATTACHMENT_PATH_RE = /^receipts\/[\w.-]+$/;

function resolveAttachmentPath(value) {
  const text = String(value ?? '').trim();
  if (!ATTACHMENT_PATH_RE.test(text)) {
    throw new Error('The receipt reference is not valid.');
  }
  return text;
}

/**
 * Links an already-persisted image file to a saved transaction. Throws if
 * the parent is gone (the file it was about to reference is then the
 * caller's orphan to clean up). Returns the stored row.
 */
export async function createAttachment({ transactionId, path }) {
  const parent = await storage.getTransaction(transactionId);
  if (!parent) {
    throw new Error('That transaction no longer exists.');
  }
  const timestamp = nowIso();
  const row = {
    id: createId('att'),
    transaction_id: transactionId,
    path: resolveAttachmentPath(path),
    created_at: timestamp,
    updated_at: timestamp,
  };
  await storage.insertAttachment(row);
  return row;
}

/** Images of one transaction, oldest first. */
export async function getAttachments(transactionId) {
  return storage.listAttachmentsByTransaction(transactionId);
}

export async function getAttachment(id) {
  return storage.getAttachment(id);
}

/**
 * Removes one attachment row and returns it (or null when it was already
 * gone) so the caller can delete the file only after the reference is
 * provably dropped — the reverse order would strand a broken reference on
 * a failed delete.
 */
export async function removeAttachment(id) {
  const row = await storage.getAttachment(id);
  if (!row) return null;
  await storage.deleteAttachment(id);
  return row;
}

/**
 * Drops every attachment row of a transaction and returns their paths for
 * file cleanup — used before a rewrite and by transaction deletion,
 * mirroring the FK cascade.
 */
export async function removeAttachmentsForTransaction(transactionId) {
  const rows = await storage.listAttachmentsByTransaction(transactionId);
  if (rows.length > 0) {
    await storage.deleteAttachmentsForTransaction(transactionId);
  }
  return rows;
}
