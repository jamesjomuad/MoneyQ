/**
 * Pure reminder logic: turning a local date + time into one exact instant,
 * deciding whether it is still valid, and writing the notification copy.
 *
 * Nothing here talks to the device. The rule the whole feature rests on:
 * a reminder is stored as a *local* date and time ('2026-10-15', '09:00') and
 * converted to an ISO 8601 string that keeps the UTC offset that applies at
 * that moment ('2026-10-15T09:00:00+08:00'). It is never run through
 * toISOString() directly, which would silently restate a Manila morning as a
 * Manila-evening timestamp.
 */

import { formatCurrency } from './currency';
import { addDaysIso, formatDate, formatShortDate, formatTime, toIsoDate } from './dates';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_REMINDER_TIME = '09:00';

/** True for a real local 'YYYY-MM-DD' value such as '2026-10-15'. */
export function isValidLocalDate(date) {
  if (!ISO_DATE_PATTERN.test(String(date ?? ''))) return false;
  const parsed = new Date(`${date}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

/** True for a real 24-hour 'HH:MM' value such as '09:00' or '21:30'. */
export function isValidReminderTime(time) {
  return TIME_PATTERN.test(String(time ?? ''));
}

/**
 * Local date + time as an ISO 8601 string carrying the local UTC offset.
 * `new Date(result)` then yields the exact instant the user picked, on any
 * device, without ever passing through a timezone-less interpretation.
 */
export function buildRemindAt(date, time) {
  if (!isValidLocalDate(date) || !isValidReminderTime(time)) return null;

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const local = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) {
    return null;
  }
  return toLocalIso(local);
}

/** A Date as 'YYYY-MM-DDTHH:MM:SS±HH:MM' in the device's own timezone. */
function toLocalIso(date) {
  const pad = (value) => String(value).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}

/** The exact instant a stored reminder fires. */
export function remindAtDate(remindAt) {
  return new Date(remindAt);
}

/** Past or right now can no longer be scheduled. */
export function isRemindAtPast(remindAt, reference = new Date()) {
  const instant = remindAtDate(remindAt).getTime();
  return Number.isNaN(instant) || instant <= reference.getTime();
}

/**
 * The single validation rule for an enabled reminder, shared by the form (for
 * immediate feedback) and the repository (so the rule cannot be bypassed).
 * Returns an error message, or null when the input may be scheduled.
 */
export function reminderValidationError(date, time, reference = new Date()) {
  if (!isValidLocalDate(date)) return 'Pick a reminder date.';
  if (!isValidReminderTime(time)) return 'Pick a reminder time.';
  const remindAt = buildRemindAt(date, time);
  if (!remindAt) return 'Pick a reminder date.';
  if (isRemindAtPast(remindAt, reference)) return 'Pick a time in the future.';
  return null;
}

/**
 * A sensible first choice when the user switches a reminder on: the due date
 * when it is still ahead, otherwise today at 9:00 AM — stepping a day forward
 * when 9:00 AM has already passed, so the form never opens on an error.
 */
export function suggestReminderValues({ dueDate, reference = new Date() } = {}) {
  const today = toIsoDate(reference);
  let date = dueDate && ISO_DATE_PATTERN.test(dueDate) && dueDate >= today ? dueDate : today;
  if (reminderValidationError(date, DEFAULT_REMINDER_TIME, reference)) {
    date = addDaysIso(date, 1);
  }
  return { date, time: DEFAULT_REMINDER_TIME };
}

/** 'October 15, 2026 at 9:00 AM' — or 'Oct 15, 2026 at 9:00 AM' when short. */
export function formatReminderWhen(date, time, { short = false } = {}) {
  const day = short ? formatShortDate(date) : formatDate(date);
  return `${day} at ${formatTime(time)}`;
}

/**
 * Notification copy for one reminder, built from the transaction itself so no
 * message is ever hardcoded. The transaction row — not the notification — is
 * the financial record: this text is a convenience that can be rebuilt at any
 * time from what MoneyQ already stores.
 */
export function buildReminderNotification({ transaction, currency, reference = new Date() }) {
  const money = formatCurrency(transaction.amount, { currency });
  const name = String(transaction.description ?? '').trim() || 'MoneyQ entry';
  const today = toIsoDate(reference);
  const due = transaction.due_date ?? null;

  let dueLabel = null;
  if (due === today) dueLabel = 'today';
  else if (due === addDaysIso(today, 1)) dueLabel = 'tomorrow';
  else if (due) dueLabel = formatDate(due);

  let body;
  if (transaction.repayment_direction === 'owed_to_me') {
    body =
      dueLabel === 'today'
        ? `${name} was supposed to pay you ${money} today.`
        : `You are owed ${money} from ${name}${dueLabel ? `, due ${dueLabel}` : ''}.`;
  } else if (transaction.repayment_direction === 'owed_by_me') {
    body =
      dueLabel === 'today'
        ? `You were supposed to pay ${name} ${money} today.`
        : `You owe ${name} ${money}${dueLabel ? `, due ${dueLabel}` : ''}.`;
  } else {
    body = `${name} · ${money}${dueLabel ? ` · due ${dueLabel}` : ''}`;
  }

  return { title: '🔔 MoneyQ Reminder', body };
}
