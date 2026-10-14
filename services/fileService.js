/**
 * Native file plumbing for backups: write a JSON string to the cache and
 * hand it to the platform share sheet (the user picks the real destination
 * — Files, Drive, wherever), and pick a .json file with the system picker.
 *
 * The web build resolves to fileService.web.js instead, which reports the
 * feature unsupported rather than pulling expo-file-system into the bundle.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const fileService = { supported: true };

function isPickerCancelled(error) {
  return /picker was cancelled/i.test(String(error?.message ?? error));
}

/**
 * Real "Save to" flow on top of expo-file-system's SAF support: the system
 * folder picker (OPEN_DOCUMENT_TREE) returns a Directory the app holds a
 * persistable READ+WRITE grant for, and `createFile` asks the document
 * provider to create the backup file inside it — giving back a real
 * document:// URI that `write()` can fill. Never `new File(dir, name)` +
 * create/write here: File.create() rejects SAF content:// URIs by design.
 * Resolves null when the user cancels the picker.
 */
export async function saveBackupToUserFile(json, fileName) {
  const safeName = String(fileName).replace(/[^A-Za-z0-9._-]/g, '-');
  let directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (isPickerCancelled(error)) return null;
    throw error;
  }
  if (!directory) return null;

  // Same backup twice a day would collide; SAF createFile does not overwrite.
  const existing = directory.list().find((entry) => entry.name === safeName);
  if (existing && !(existing instanceof Directory)) existing.delete();

  const file = directory.createFile(safeName, 'application/json');
  file.write(json);
  return { name: file.name || safeName, size: file.size };
}

/** Write to cache, then open the platform save/share UI on the file. */
export async function saveBackup(json, fileName) {
  const safeName = String(fileName).replace(/[^A-Za-z0-9._-]/g, '-');
  const file = new File(Paths.cache, safeName);
  file.create({ overwrite: true });
  file.write(json);
  if (!(await Sharing.isAvailableAsync())) {
    file.delete();
    throw new Error('No share target is available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'Save your Budgetarian backup',
    mimeType: 'application/json',
    UTI: 'public.json',
  });
  return { name: safeName, size: file.size };
}

/**
 * System file picker → backup text, or null when the user cancels.
 *
 * Uses expo-file-system's own picker instead of expo-document-picker: on
 * Android it opens ACTION_OPEN_DOCUMENT and immediately takes a persistable
 * READ grant on the picked content:// URI (FilePickerContract.kt), and the
 * File it hands back is bound to that URI — `text()` reads it through the
 * content resolver without relying on the document picker's cache-copy
 * contract, which is not always honored for expo-file-system's path
 * permission checks (the "Missing 'READ' permission" import failure).
 */
export async function pickBackup() {
  const { result, canceled } = await File.pickFileAsync({
    mimeTypes: ['application/json'],
    multipleFiles: false,
  });
  if (canceled || !result) return null;
  const text = await result.text();
  return { name: result.name || 'backup.json', text };
}

/**
 * System image picker for receipt attachments, or null when the user cancels.
 * Same expo-file-system picker rationale as `pickBackup`: the File objects
 * returned on Android carry persistable READ grants, so `persistReceipt`
 * can copy each one into app storage straight away. Resolves an array of
 * URIs (never an empty array).
 */
export async function pickImagesAsync() {
  const { result, canceled } = await File.pickFileAsync({
    mimeTypes: ['image/*'],
    multipleFiles: true,
  });
  if (canceled || !result) return null;
  return result.map((file) => file.uri);
}
