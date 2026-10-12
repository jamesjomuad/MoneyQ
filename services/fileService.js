/**
 * Native file plumbing for backups: write a JSON string to the cache and
 * hand it to the platform share sheet (the user picks the real destination
 * — Files, Drive, wherever), and pick a .json file with the system picker.
 *
 * The web build resolves to fileService.web.js instead, which reports the
 * feature unsupported rather than pulling expo-file-system into the bundle.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ResultCode, startActivityAsync } from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';

export const fileService = { supported: true };

/**
 * Real "Save to" dialog (Android SAF CREATE_DOCUMENT): the user picks the
 * folder, renames the file and the system creates it empty; we fill the
 * returned content:// URI with the backup JSON. Resolves null when the user
 * cancels the dialog.
 */
export async function saveBackupToUserFile(json, fileName) {
  const safeName = String(fileName).replace(/[^A-Za-z0-9._-]/g, '-');
  const result = await startActivityAsync('android.intent.action.CREATE_DOCUMENT', {
    type: 'application/json',
    extra: { 'android.intent.extra.TITLE': safeName },
  });
  if (result?.resultCode !== ResultCode.Success || !result?.data) return null;
  const file = new File(result.data);
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
