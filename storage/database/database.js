import * as SQLite from 'expo-sqlite';

import { LATEST_VERSION, migrations } from './migrations';

export const DATABASE_NAME = 'moneyq.db';

let connectionPromise = null;

export function getDatabase() {
  if (!connectionPromise) {
    connectionPromise = openAndMigrate().catch((error) => {
      // Allow a later attempt to retry instead of caching the failure forever.
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}

async function openAndMigrate() {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await runMigrations(db);
  return db;
}

/**
 * Applies every migration newer than the database's stored PRAGMA user_version.
 * Each migration is applied inside a transaction so a failure leaves the
 * database on the last fully applied version rather than half migrated.
 */
export async function runMigrations(db) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync('PRAGMA user_version');
  const fromVersion = row?.user_version ?? 0;

  if (fromVersion >= LATEST_VERSION) {
    return { fromVersion, toVersion: fromVersion, applied: [] };
  }

  const pending = migrations
    .filter((entry) => entry.version > fromVersion)
    .sort((a, b) => a.version - b.version);

  const applied = [];

  for (const entry of pending) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await entry.up(txn);
      // user_version accepts no bound parameters, and the value is a validated
      // integer taken from our own migration list.
      await txn.execAsync(`PRAGMA user_version = ${Number(entry.version)}`);
    });
    applied.push(entry.version);
  }

  return { fromVersion, toVersion: LATEST_VERSION, applied };
}

export async function getSchemaVersion() {
  const db = await getDatabase();
  const row = await db.getFirstAsync('PRAGMA user_version');
  return row?.user_version ?? 0;
}