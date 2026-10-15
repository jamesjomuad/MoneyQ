/**
 * Web stand-in for the OCR service. ML Kit is Android/iOS-only, so the
 * browser preview reports recognition as unavailable (mirrors the
 * fileService/receiptShareService pattern). Importing nothing keeps the
 * native binding entirely out of the web bundle.
 */

export const ocrService = { supported: false };

export function isOcrAvailable() {
  return false;
}

export async function recognizeReceiptLines() {
  return [];
}
