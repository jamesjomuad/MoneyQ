/**
 * Web storage entry point.
 *
 * Swaps SQLite for the in-memory adapter so the browser is a fast, dependency
 * free UI/UX harness. The API is identical to `adapter.js`, so repositories,
 * stores and screens are shared verbatim with the native build.
 */

import { createMemoryAdapter } from './memoryAdapter';

const memory = createMemoryAdapter({ seedDemo: true });

export const storage = memory;

export async function initStorage() {
  return { source: memory.source, schemaVersion: await memory.getSchemaVersion() };
}