/**
 * Share intake for e-wallet receipts (Android).
 *
 * expo-sharing's experimental receiving API reads the ACTION_SEND /
 * ACTION_SEND_MULTIPLE payload the OS delivered to the app, then clears it
 * so a later cold start never reuses stale content. Content URIs carry only
 * temporary read grants, so a shared image is copied into the app's own
 * cache folder before anything renders it — the copy survives for the whole
 * import flow regardless of what the source app does afterwards.
 *
 * The web build resolves to receiptShareService.web.js instead, which
 * reports the feature unsupported rather than pulling expo-file-system and
 * expo-sharing receivers into the bundle.
 */

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
} from 'expo-sharing';

import { createId } from '../utils/id';

export const receiptShareService = { supported: Platform.OS === 'android' };

const IMPORT_DIR = 'receipt-imports';

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

function extensionFor(mimeType, uri) {
  const known = EXT_BY_MIME[String(mimeType ?? '').toLowerCase()];
  if (known) return known;
  const guess = /\.(png|jpe?g|webp|gif|bmp|heic|heif)(?=($|[?#]))/i.exec(String(uri ?? ''));
  if (!guess) return '.jpg';
  return guess[1].toLowerCase() === 'jpeg' ? '.jpg' : `.${guess[1].toLowerCase()}`;
}

function collectText(payloads) {
  return payloads
    .filter(
      (payload) =>
        (payload.shareType === 'text' || payload.shareType === 'url') &&
        String(payload.value ?? '').trim() !== '',
    )
    .map((payload) => String(payload.value).trim())
    .join('\n\n');
}

function pickImageFromResolved(resolved) {
  for (const payload of resolved) {
    if (payload?.contentType === 'image' && payload.contentUri) {
      return { uri: payload.contentUri, mimeType: payload.contentMimeType ?? null };
    }
  }
  return null;
}

function pickImageFromRaw(payloads) {
  for (const payload of payloads) {
    if (payload?.shareType === 'image' && String(payload.value ?? '').trim() !== '') {
      return { uri: String(payload.value).trim(), mimeType: payload.mimeType ?? null };
    }
  }
  return null;
}

/**
 * Read and consume whatever the OS shared into the app right now.
 * Resolves { text, imageUri, mimeType }; every field may be empty — the
 * source app decides what accompanies a receipt (image, text, or both).
 */
export async function collectSharedReceipt() {
  if (!receiptShareService.supported) return { text: '', imageUri: null, mimeType: null };

  let raw = [];
  try {
    raw = getSharedPayloads();
  } catch {
    raw = [];
  }
  const text = collectText(raw);

  let image = null;
  try {
    image = pickImageFromResolved(await getResolvedSharedPayloadsAsync());
  } catch {
    image = null;
  }
  if (!image) image = pickImageFromRaw(raw);

  // The import flow works from the staged copy and the values read above,
  // so the system-side payload is dropped immediately: no stale reuse on
  // the next open of the app.
  try {
    clearSharedPayloads();
  } catch {
    // Best effort only.
  }

  return { text, imageUri: image?.uri ?? null, mimeType: image?.mimeType ?? null };
}

/**
 * Copy an incoming image (content:// or file://) into
 * <cache>/receipt-imports so it stays readable for the whole flow.
 * Resolves the local file URI, or null when the source cannot be read.
 */
export async function stageSharedImage(uri, mimeType) {
  if (!receiptShareService.supported || !uri) return null;
  const dir = new Directory(Paths.cache, IMPORT_DIR);
  const dest = new File(dir, `${createId()}${extensionFor(mimeType, uri)}`);
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch {
    return null;
  }
  const source = new File(uri);
  try {
    await source.copy(dest, { overwrite: true });
    return dest.uri;
  } catch {
    // SAF streams sometimes refuse a straight copy; read-through-then-write
    // is the documented fallback.
    try {
      const bytes = await source.bytes();
      dest.create({ overwrite: true, intermediates: true });
      dest.write(bytes);
      return dest.uri;
    } catch {
      return null;
    }
  }
}

/** Delete a staged import copy. Only touches files inside receipt-imports. */
export function removeStagedFile(uri) {
  if (!receiptShareService.supported || !uri) return;
  try {
    const file = new File(uri);
    if (file.uri.includes(`/${IMPORT_DIR}/`) && file.exists) file.delete();
  } catch {
    // Nothing we own is left to clean; cache gets trimmed by the OS anyway.
  }
}
