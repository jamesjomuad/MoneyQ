import { migration as initial } from './001_initial';

/**
 * Append-only list. Never edit a shipped migration — add a new one so existing
 * installs upgrade instead of re-running old statements.
 */
export const migrations = [initial];

export const LATEST_VERSION = migrations.reduce(
  (highest, entry) => Math.max(highest, entry.version),
  0,
);