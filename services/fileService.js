/**
 * Native file plumbing for backups: write a JSON string to the cache and
 * hand it to the platform share sheet (the user picks the real destination
 * — Files, Drive, wherever), and pick a .json file with the system picker.
 *
 * The web build resolves to fileService.web.js instead, which reports the
 * feature unsupported rather than pulling expo-file-system into the bundle.
 */

import * as DocumentPicker from 'expo-document-picker';
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
    dialogTitle: 'Save your MoneyQ backup',
    mimeType: 'application/json',
    UTI: 'public.json',
  });
  return { name: safeName, size: file.size };
}

/** System file picker → backup text, or null when the user cancels. */
export async function pickBackup() {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const text = await new File(asset.uri).text();
  return { name: asset.name || 'backup.json', text };
}
