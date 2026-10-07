import { migration as initial } from './001_initial';
import { migration as rebuildLegacy } from './002_rebuild_legacy';
import { migration as remindersAndRepayments } from './003_reminders_and_repayments';

/**
 * Append-only list. Never edit a shipped migration — add a new one so existing
 * installs upgrade instead of re-running old statements.
 */
export const migrations = [initial, rebuildLegacy, remindersAndRepayments];

export const LATEST_VERSION = migrations.reduce(
  (highest, entry) => Math.max(highest, entry.version),
  0,
);