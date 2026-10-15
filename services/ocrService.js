/**
 * On-device receipt OCR via Google ML Kit text recognition.
 *
 * The model ships inside the app: recognition happens locally on the copied
 * receipt image, with no camera permission, no network call, and nothing ever
 * uploaded. ML Kit is a legacy native module, though — it is missing entirely
 * from Expo Go, where the package's JS facade throws the moment any property
 * is touched. Callers must therefore probe isOcrAvailable() and degrade to a
 * clear 'unavailable' state instead of crashing or guessing.
 *
 * The web build resolves ocrService.web.js instead, keeping this module (and
 * the ML Kit binding) out of the web bundle entirely — same convention as
 * receiptShareService and fileService.
 */

import { Platform } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';

export const ocrService = {
  supported: Platform.OS === 'android' || Platform.OS === 'ios',
};

/**
 * Touching `recognize` on a non-linked native module throws the package's
 * linking error; in Expo Go that is exactly what happens. A successful
 * property read is the availability test.
 */
export function isOcrAvailable() {
  if (!ocrService.supported) return false;
  try {
    return typeof TextRecognition.recognize === 'function';
  } catch {
    return false;
  }
}

/**
 * Read every text line from a local image file. Prefers ML Kit's block/line
 * structure — it preserves the phrase boundaries receipts are built on, so a
 * line stays 'Amount: 1,250.00' instead of fragmenting into words. Falls back
 * to naive line splitting when a device returns only the flat text.
 *
 * Rejects when the image cannot be decoded, so callers can show a retry.
 */
export async function recognizeReceiptLines(imageUri) {
  if (!imageUri) return [];
  const result = await TextRecognition.recognize(imageUri);

  const lines = [];
  for (const block of Array.isArray(result?.blocks) ? result.blocks : []) {
    for (const line of Array.isArray(block?.lines) ? block.lines : []) {
      if (typeof line?.text === 'string' && line.text.trim() !== '') {
        lines.push(line.text);
      }
    }
  }
  if (lines.length > 0) return lines;

  return String(result?.text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
}
