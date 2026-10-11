import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';
import {
  REMINDER_STATUSES,
  buildRemindAt,
  reminderValidationError,
} from '../../utils/reminders';

/**
 * Reminder persistence and business rules. A reminder is an independent row
 * that may optionally belong to a transaction (`transaction_id`, nullable):
 * one transaction can own several reminders, and a reminder without a link is
 * a standalone one. The row — enabled flag, lifecycle status, local date,
 * local time, exact instant — is the source of truth; the OS notification is
 * only how the reminder is delivered, so `notification_id` is written after
 * the device accepts a schedule and cleared whenever it is cancelled.
 *
 * Validation lives here (not in the UI and not in the adapter), so every
 * screen shares the same rule: an armed reminder needs a real date, a real
 * time, and — when either is being changed — an instant that has not passed.
 */
export async function getReminders() {
  return storage.listReminders();
}

export async function getReminder(id) {
  return storage.getReminder(id);
}

export async function getReminderForTransaction(transactionId) {
  return storage.getReminderByTransaction(transactionId);
}

/**
 * Creates a reminder — standalone when no transaction is given. Saving first
 * (before any scheduling) means the record survives even if the device later
 * refuses to arm a notification.
 */
export async function createReminder({ transactionId = null, date, time, notes = '' }) {
  await assertTransactionExists(transactionId);

  const error = reminderValidationError(date, time);
  if (error) throw new Error(error);
  const remindAt = buildRemindAt(date, time);

  const id = createId('rem');
  const timestamp = nowIso();
  await storage.insertReminder({
    id,
    transaction_id: transactionId,
    enabled: 1,
    status: 'active',
    remind_date: date,
    remind_time: time,
    remind_at: remindAt,
    notification_id: null,
    notes: String(notes ?? '').trim(),
    created_at: timestamp,
    updated_at: timestamp,
  });
  return storage.getReminder(id);
}

/**
 * Updates a reminder's schedule, notes and optional transaction link. A date
 * or time that changes must be in the future; re-saving an overdue reminder
 * untouched is allowed, so the form never traps the user on a past instant.
 * The lifecycle status is not touched here — completing is its own action.
 */
export async function updateReminder(id, { transactionId, date, time, notes }) {
  const existing = await storage.getReminder(id);
  if (!existing) throw new Error('That reminder no longer exists.');

  const nextTransactionId = transactionId === undefined ? existing.transaction_id : transactionId;
  await assertTransactionExists(nextTransactionId);

  const nextDate = date ?? existing.remind_date;
  const nextTime = time ?? existing.remind_time;
  const scheduleChanged = nextDate !== existing.remind_date || nextTime !== existing.remind_time;
  if (scheduleChanged) {
    const error = reminderValidationError(nextDate, nextTime);
    if (error) throw new Error(error);
  }
  const remindAt = buildRemindAt(nextDate, nextTime);
  if (!remindAt) throw new Error('Pick a reminder date.');

  await storage.updateReminder({
    ...existing,
    transaction_id: nextTransactionId,
    remind_date: nextDate,
    remind_time: nextTime,
    remind_at: remindAt,
    notes: notes === undefined ? undefined : String(notes ?? '').trim(),
    updated_at: nowIso(),
  });
  return storage.getReminder(id);
}

/** Moves a reminder through its lifecycle: 'active' or 'completed'. */
export async function setReminderStatus(id, status) {
  if (!REMINDER_STATUSES.includes(status)) {
    throw new Error('Unknown reminder status.');
  }
  const existing = await storage.getReminder(id);
  if (!existing) throw new Error('That reminder no longer exists.');

  await storage.updateReminder({
    ...existing,
    status,
    updated_at: nowIso(),
  });
  return storage.getReminder(id);
}

export async function completeReminder(id) {
  return setReminderStatus(id, 'completed');
}

export async function deleteReminder(id) {
  return storage.deleteReminder(id);
}

/** Removes every reminder linked to a budget's transactions. */
export async function deleteRemindersForBudget(budgetId) {
  return storage.deleteRemindersForBudget(budgetId);
}

/**
 * Creates or updates the reminder for a transaction, as driven by the
 * transaction form's "Set Reminder" switch. Disabling keeps the row (with its
 * date and time) so switching it back on restores the previous choice instead
 * of starting from scratch. When a transaction owns several reminders, the
 * oldest one — the one the form hydrated — is the one managed here.
 */
export async function saveReminder({ transactionId, enabled, date, time, notes, notificationId = null }) {
  if (!transactionId) throw new Error('A reminder needs a transaction.');
  const existing = await storage.getReminderByTransaction(transactionId);
  const timestamp = nowIso();
  // Notes are optional free text: '' means none, and leaving `notes` out of
  // the call entirely keeps what the row already holds (a reminder can be
  // re-scheduled or disabled without losing its note). Leading/trailing
  // whitespace is trimmed away when a value is supplied.
  const nextNotes =
    notes === undefined ? existing?.notes ?? '' : String(notes ?? '').trim();

  if (!enabled) {
    if (!existing) return null;
    await storage.updateReminder({
      ...existing,
      enabled: 0,
      notification_id: null,
      notes: nextNotes,
      updated_at: timestamp,
    });
    return storage.getReminderByTransaction(transactionId);
  }

  const error = reminderValidationError(date, time);
  if (error) throw new Error(error);
  const remindAt = buildRemindAt(date, time);

  if (existing) {
    await storage.updateReminder({
      ...existing,
      enabled: 1,
      remind_date: date,
      remind_time: time,
      remind_at: remindAt,
      notification_id: notificationId,
      notes: nextNotes,
      updated_at: timestamp,
    });
    return storage.getReminderByTransaction(transactionId);
  }

  const id = createId('rem');
  await storage.insertReminder({
    id,
    transaction_id: transactionId,
    enabled: 1,
    status: 'active',
    remind_date: date,
    remind_time: time,
    remind_at: remindAt,
    notification_id: notificationId,
    notes: nextNotes,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return storage.getReminderByTransaction(transactionId);
}

/**
 * Records which OS notification a reminder currently owns, so a later edit
 * or a deletion can cancel exactly that one. The payload is built from
 * the reminder's own columns only: callers may hold a row joined with its
 * transaction, and those extra fields must not leak into storage.
 */
export async function saveReminderNotification(reminder, notificationId) {
  // No `notes` or `status` key: both adapters treat an omitted value as "keep
  // what the row holds", so writing the OS id can never blank a user's note
  // or reset the lifecycle status.
  await storage.updateReminder({
    id: reminder.id,
    enabled: reminder.enabled,
    status: reminder.status,
    remind_date: reminder.remind_date,
    remind_time: reminder.remind_time,
    remind_at: reminder.remind_at,
    notification_id: notificationId ?? null,
    updated_at: nowIso(),
  });
  return storage.getReminder(reminder.id);
}

/** A linked reminder must name a transaction that still exists. */
async function assertTransactionExists(transactionId) {
  if (transactionId == null) return;
  const transaction = await storage.getTransaction(transactionId);
  if (!transaction) throw new Error('That transaction no longer exists.');
}
