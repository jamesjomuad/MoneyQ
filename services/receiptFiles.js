/**
 * Permanent receipt images (Android).
 *
 * A shared receipt starts life as a staged cache copy
 * (services/receiptShareService.js), which the OS is free to reclaim. When
 * the transaction is saved, the staged file is copied into the app's
 * document directory — storage the OS keeps — and the transaction row
 * stores only the document-relative path (`receipts/<name>.<ext>`), which
 * stays valid across restarts even if the sandbox's absolute location ever
 * changes. Nothing is uploaded: receipts stay on the device.
 *
 * The web build resolves to receiptFiles.web.js instead: share intake does
 * not exist there and the in-memory harness has no document directory, so
 * expo-file-system stays out of the web bundle.
 */

import { Directory, File, Paths } from 'expo-file-system';

import { createId } from '../utils/id';

export const RECEIPT_DIR = 'receipts';

// Keep in sync with resolveReceiptPath() in the transaction repository: a
// stored reference is only ever a plain file name inside this folder.
const RECEIPT_PATH_RE = /^receipts\/[\w.-]+$/;

function extensionFrom(uri) {
  const guess = /\.(png|jpe?g|webp|gif|bmp|heic|heif)(?=($|[?#]))/i.exec(String(uri ?? ''));
  if (!guess) return '.jpg';
  return guess[1].toLowerCase() === 'jpeg' ? '.jpg' : `.${guess[1].toLowerCase()}`;
}

/** A File handle for a stored reference, or null for anything malformed. */
function receiptFile(path) {
  if (!path || !RECEIPT_PATH_RE.test(path)) return null;
  try {
    return new File(`${Paths.document.uri}/${path}`);
  } catch {
    return null;
  }
}

/**
 * Copy a readable image (a staged cache copy, or any local URI) into the
 * receipts folder under a unique name. Resolves the document-relative path
 * to store on the transaction. Throws when the image cannot be saved, so
 * the caller can abort the save instead of writing a reference to a file
 * that does not exist.
 */
export async function persistReceipt(sourceUri) {
  if (!sourceUri) throw new Error('There is no receipt image to save.');
  const dir = new Directory(Paths.document, RECEIPT_DIR);
  dir.create({ intermediates: true, idempotent: true });
  const name = `${createId()}${extensionFrom(sourceUri)}`;
  const dest = new File(dir, name);
  const source = new File(sourceUri);
  try {
    await source.copy(dest, { overwrite: true });
  } catch {
    // SAF streams sometimes refuse a straight copy; read-through-then-write
    // is the documented fallback (same as the staging step).
    const bytes = await source.bytes();
    dest.create({ overwrite: true, intermediates: true });
    dest.write(bytes);
  }
  return `${RECEIPT_DIR}/${name}`;
}

/** Absolute file URI for rendering, or null when the file is (or reads as) gone. */
export function receiptFileUri(path) {
  const file = receiptFile(path);
  try {
    return file?.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Delete a stored receipt image. Never throws: a missing file is already
 * the desired end state, and each receipt file has a unique name, so no
 * other transaction can be referencing it.
 */
export function deleteReceiptFile(path) {
  const file = receiptFile(path);
  try {
    if (file?.exists) file.delete();
  } catch {
    // A leftover file is harmless; failing the caller over it is not.
  }
}
