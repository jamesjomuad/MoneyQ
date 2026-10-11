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

import { addDaysIso, formatDate, formatShortDate, formatTime, toIsoDate } from './dates';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_REMINDER_TIME = '09:00';

/** Lifecycle states a reminder row can hold. */
export const REMINDER_STATUSES = ['active', 'completed'];

/** UI labels for the derived status of a reminder. */
export const REMINDER_STATUS_LABELS = {
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  completed: 'Completed',
};

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
 * The status a reminder currently shows, derived only from its own stored
 * schedule and completion state — never from whatever date the user happens
 * to be viewing. 'completed' wins; then an armed instant behind us reads as
 * 'overdue'; everything else is 'upcoming'.
 */
export function deriveReminderStatus(reminder, reference = new Date()) {
  if (reminder?.status === 'completed') return 'completed';
  if (isRemindAtPast(reminder?.remind_at, reference)) return 'overdue';
  return 'upcoming';
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
 * A sensible first choice when the user switches a reminder on: today at
 * 9:00 AM — stepping a day forward when 9:00 AM has already passed, so the
 * form never opens on an error.
 */
export function suggestReminderValues({ reference = new Date() } = {}) {
  const today = toIsoDate(reference);
  let date = today;
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

/** The body a noteless reminder falls back to. */
export const FALLBACK_REMINDER_BODY = 'You have a scheduled reminder.';

/**
 * Cap for the notification body: a reminder note is a short line of memory
 * aid, not an essay. Anything longer is cut here so the OS never has to
 * render (or silently mangle) a wall of text.
 */
const MAX_REMINDER_BODY_LENGTH = 500;

/**
 * Notification copy for one reminder, taken straight from the note the user
 * wrote on it — the note *is* the message. Notes are optional, so blank or
 * whitespace-only input falls back to a neutral line instead of inventing
 * transaction details the user never typed. A linked reminder keeps the
 * familiar payment title; a standalone one is not necessarily a payment.
 */
export function buildReminderNotification({ notes, linked = true }) {
  const note = String(notes ?? '').trim();
  let body = FALLBACK_REMINDER_BODY;
  if (note) {
    body =
      note.length > MAX_REMINDER_BODY_LENGTH
        ? `${note.slice(0, MAX_REMINDER_BODY_LENGTH).trimEnd()}…`
        : note;
  }
  return {
    title: linked ? 'Payment reminder' : 'Reminder',
    body,
  };
}
