/**
 * Receipt attachments — the persistence behind shared e-wallet receipts.
 *
 *   `transactions` gains `receipt_path`: NULL, or a path relative to the
 *     app's document directory (`receipts/<unique name>.<ext>`) pointing at
 *     the permanent copy of a shared receipt image. Only the reference is
 *     stored here — the bytes live as files managed by
 *     services/receiptFiles.js, never in the database and never in the
 *     cache directory, so the attachment survives restarts and cache
 *     cleanups. A plain ADD COLUMN leaves every existing row (all of them
 *     receipt-less so far) untouched.
 */
export const migration = {
  version: 13,
  name: 'receipt_path',

  async up(db) {
    await db.execAsync(`
      ALTER TABLE transactions ADD COLUMN receipt_path TEXT;
    `);
  },
};
