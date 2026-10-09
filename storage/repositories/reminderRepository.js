import { storage } from '../adapters/adapter';
import { createId, nowIso } from '../../utils/id';
import { buildRemindAt, reminderValidationError } from '../../utils/reminders';

/**
 * One optional reminder per transaction. The row — enabled flag, local date,
 * local time, exact instant — is the source of truth; the OS notification is
 * only how the reminder is delivered, so `notification_id` is written after
 * the device accepts a schedule and cleared whenever it is cancelled.
 *
 * Validation lives here (not in the UI and not in the adapter), so the form
 * and any future screen share the same rule: an enabled reminder needs a real
 * date, a real time, and an instant that has not passed.
 */
export async function getReminders() {
  return storage.listReminders();
}

export async function getReminderForTransaction(transactionId) {
  return storage.getReminderByTransaction(transactionId);
}

/**
 * Creates or updates the reminder for a transaction. Disabling keeps the row
 * (with its date and time) so switching it back on restores the previous
 * choice instead of starting from scratch.
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
 * Records which OS notification a reminder currently owns, so a later edit,
 * or a deletion can cancel exactly that one. The payload is built from
 * the reminder's own columns only: callers may hold a row joined with its
 * transaction, and those extra fields must not leak into storage.
 */
export async function saveReminderNotification(reminder, notificationId) {
  // No `notes` key: both adapters treat an omitted value as "keep what the
  // row holds", so writing the OS id can never blank a user's note.
  await storage.updateReminder({
    id: reminder.id,
    enabled: reminder.enabled,
    remind_date: reminder.remind_date,
    remind_time: reminder.remind_time,
    remind_at: reminder.remind_at,
    notification_id: notificationId ?? null,
    updated_at: nowIso(),
  });
  return storage.getReminderByTransaction(reminder.transaction_id);
}
