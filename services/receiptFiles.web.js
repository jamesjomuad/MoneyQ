/**
 * Web build of the receipt file service: receiving shares is unsupported
 * on web and the in-memory harness has no document directory, so nothing
 * here touches expo-file-system. Rows rendered on web never gain a receipt
 * reference (imports only happen on Android); any path that does show up
 * resolves to "no image" rather than crashing.
 */

export const RECEIPT_DIR = 'receipts';

export async function persistReceipt() {
  throw new Error('Receipt images are not supported on web.');
}

export async function readReceiptBase64() {
  return null;
}

export async function writeReceiptBase64() {
  throw new Error('Receipt images are not supported on web.');
}

export function receiptFileUri() {
  return null;
}

export function deleteReceiptFile() {}
