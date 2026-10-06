/**
 * Native (Android/iOS) storage entry point.
 *
 * Resolved by Metro on native platforms; the web build picks
 * `adapter.web.js` instead, so `expo-sqlite` — and its alpha web worker —
 * never enters the browser bundle.
 */

import { getDatabase } from '../database/database';
import { createSqliteAdapter } from './sqliteAdapter';

const sqlite = createSqliteAdapter(getDatabase);

export const storage = sqlite;

/** Opens the database, runs pending migrations, reports what we are on. */
export async function initStorage() {
  await getDatabase();
  return { source: sqlite.source, schemaVersion: await sqlite.getSchemaVersion() };
}