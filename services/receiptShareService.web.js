/**
 * Web build of the receipt share service: receiving Android shares is a
 * native-only capability, so every entry point reports unsupported/no-op
 * and expo-file-system plus the expo-sharing receiver stay out of the web
 * bundle. Mirrors the fileService.web.js adapter convention.
 */

export const receiptShareService = { supported: false };

export async function collectSharedReceipt() {
  return { text: '', imageUri: null, mimeType: null };
}

export async function stageSharedImage() {
  return null;
}

export function removeStagedFile() {
  // No temporary files exist on web.
}
