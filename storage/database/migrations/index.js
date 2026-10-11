import { migration as initial } from './001_initial';
import { migration as rebuildLegacy } from './002_rebuild_legacy';
import { migration as reminders } from './003_reminders';
import { migration as budgetColor } from './004_budget_color';
import { migration as paymentStatus } from './005_payment_status';
import { migration as reminderNotes } from './006_reminder_notes';
import { migration as reminderIndependent } from './007_reminder_independent';

/**
 * Append-only list. Never edit a shipped migration — add a new one so existing
 * installs upgrade instead of re-running old statements.
 */
export const migrations = [
  initial,
  rebuildLegacy,
  reminders,
  budgetColor,
  paymentStatus,
  reminderNotes,
  reminderIndependent,
];

export const LATEST_VERSION = migrations.reduce(
  (highest, entry) => Math.max(highest, entry.version),
  0,
);