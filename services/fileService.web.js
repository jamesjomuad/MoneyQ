/**
 * Web stand-in for the file service. The browser preview keeps its data in
 * memory anyway, and expo-file-system's web support is wasm-worker territory
 * — so export & import simply report as unavailable here (mirrors the
 * notifications pattern).
 */

export const fileService = { supported: false };

const UNSUPPORTED = 'Export & import are not available in the browser preview.';

export async function saveBackupToUserFile() {
  throw new Error(UNSUPPORTED);
}

export async function saveBackup() {
  throw new Error(UNSUPPORTED);
}

export async function pickBackup() {
  throw new Error(UNSUPPORTED);
}
