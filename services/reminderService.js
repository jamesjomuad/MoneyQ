/**
 * Reminder orchestration — the half of the feature that knows Budgetarian's rules.
 *
 * Ordering on every save, without exception:
 *
 *   cancel the old notification  →  save the reminder row  →  schedule  →
 *   →  store the new notification id
 *
 * The row in SQLite is always the source of truth; the OS notification is
 * only delivery. That is why nothing here trusts the notification to be
 * correct: every schedule can be rebuilt from the rows with `resyncReminders`,
 * which is what keeps the feature honest after a reinstall, a denied
 * permission, an edit or a cleared notification tray.
 */

import {
  completeReminder as completeReminderRow,
  createReminder as createReminderRow,
  deleteReminder as deleteReminderRow,
  getReminder,
  getReminderForTransaction,
  getReminders,
  getRemindersForBudget,
  saveReminder,
  saveReminderNotification,
  updateReminder as updateReminderRow,
} from '../storage/repositories/reminderRepository';
import {
  buildReminderNotification,
  isRemindAtPast,
  snoozeScheduleFrom,
} from '../utils/reminders';
import * as notifications from './notificationService';

/**
 * Everything that touches the schedule runs through one serial queue. A
 * notification action (Complete / Remind Later) can land at the same moment
 * the launch-time resync reads the rows — on a cold start they genuinely
 * overlap. Serialization means the resync always sees the action's outcome
 * instead of racing it, so a snoozed reminder can never end up with two
 * armed notifications.
 */
let scheduleQueue = Promise.resolve();

function runExclusive(task) {
  const result = scheduleQueue.then(
    () => task(),
    () => task()
  );
  scheduleQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/**
 * Notification payload for one reminder row, rebuilt from stored data only:
 * the note the user wrote, plus the ids a tap needs to find its way back.
 * Standalone reminders carry null transaction ids; the tap handler routes
 * those to the reminder editor instead of the transaction form.
 */
function contentFor(reminder) {
  const text = buildReminderNotification({
    notes: reminder.notes,
    linked: Boolean(reminder.transaction_id),
  });
  return {
    title: text.title,
    body: text.body,
    data: {
      transactionId: reminder.transaction_id,
      budgetId: reminder.budget_id,
      reminderId: reminder.id,
    },
    remindAt: reminder.remind_at,
  };
}

/**
 * Schedules one reminder row and writes back the id the OS handed us. Never
 * throws: a failure leaves the row saved (so a later resync can repair it)
 * and reports what happened instead.
 */
async function scheduleNow(reminder) {
  try {
    const notificationId = await notifications.scheduleAsync(contentFor(reminder));
    await saveReminderNotification(reminder, notificationId);
    return { status: 'scheduled', notificationId };
  } catch (error) {
    return { status: 'failed', error };
  }
}

/**
 * Cancels whatever notification the reminder currently owns and clears the
 * stored id, so a reschedule can never leave two notifications behind.
 */
async function cancelOwnedNotification(row) {
  if (row?.notification_id) await notifications.cancelAsync(row.notification_id);
}

/**
 * Resolves the permission for arming a schedule. Returns `{ permission, ok }`;
 * a denied permission never blocks the save — the row is already stored.
 */
async function resolvePermission(requestPermission) {
  if (!notifications.isSupported) return { permission: null, ok: false };
  const permission = requestPermission
    ? await notifications.requestPermissionAsync()
    : await notifications.getPermissionStatusAsync();
  return { permission, ok: permission.granted };
}

/**
 * Applies the reminder a transaction form just produced.
 *
 * Editing cancels the previous notification before anything else, so a date
 * or time change can never leave two notifications behind. Returns a status
 * the form can act on: 'scheduled', 'disabled', 'blocked' (permission off),
 * 'unsupported' (browser preview) or 'failed'.
 */
export async function applyReminder({ transaction, reminder, requestPermission = true }) {
  if (!transaction?.id) throw new Error('A reminder needs a transaction.');

  const existing = await getReminderForTransaction(transaction.id);
  await cancelOwnedNotification(existing);

  if (!reminder?.enabled) {
    const row = await saveReminder({
      transactionId: transaction.id,
      enabled: false,
      date: existing?.remind_date ?? reminder?.date ?? null,
      time: existing?.remind_time ?? reminder?.time ?? null,
      notes: reminder?.notes,
    });
    return { status: 'disabled', reminder: row };
  }

  // Saving first means a reminder survives even if the device refuses to
  // schedule: the row is the record, the notification is only the delivery.
  const row = await saveReminder({
    transactionId: transaction.id,
    enabled: true,
    date: reminder.date,
    time: reminder.time,
    notes: reminder?.notes,
    notificationId: null,
  });

  if (!notifications.isSupported) {
    return { status: 'unsupported', reminder: row };
  }

  const { permission, ok } = await resolvePermission(requestPermission);
  if (!ok) return { status: 'blocked', permission, reminder: row };

  const outcome = await scheduleNow(row);
  return { ...outcome, permission, reminder: row };
}

/**
 * Creates a reminder — standalone or linked — and arms its notification.
 * Same outcome vocabulary as applyReminder: 'scheduled', 'blocked',
 * 'unsupported' or 'failed'.
 */
export async function createReminder({ date, time, notes, transactionId = null, requestPermission = true }) {
  const row = await createReminderRow({ date, time, notes, transactionId });

  if (!notifications.isSupported) {
    return { status: 'unsupported', reminder: row };
  }

  const { permission, ok } = await resolvePermission(requestPermission);
  if (!ok) return { status: 'blocked', permission, reminder: row };

  const outcome = await scheduleNow(row);
  return { ...outcome, permission, reminder: row };
}

/**
 * Edits a reminder's schedule, notes or link. Cancels the previous
 * notification first, then re-arms — one reminder, at most one scheduled
 * notification, never duplicates. A completed reminder keeps its status and
 * is not re-armed; fixing its date alone does not resurrect the notification.
 */
export async function editReminder(id, { date, time, notes, transactionId, requestPermission = true }) {
  const existing = await getReminder(id);
  if (!existing) throw new Error('That reminder no longer exists.');
  await cancelOwnedNotification(existing);

  const row = await updateReminderRow(id, { date, time, notes, transactionId });
  if (row.enabled !== 1 || row.status === 'completed') {
    await saveReminderNotification(row, null);
    return { status: 'saved', reminder: row };
  }

  // An overdue reminder whose schedule was left untouched is saved but not
  // re-armed: a past DATE trigger would fire immediately, and resyncReminders
  // will never schedule it either.
  if (isRemindAtPast(row.remind_at)) {
    await saveReminderNotification(row, null);
    return { status: 'saved', reminder: row };
  }

  if (!notifications.isSupported) {
    return { status: 'unsupported', reminder: row };
  }

  const { permission, ok } = await resolvePermission(requestPermission);
  if (!ok) {
    await saveReminderNotification(row, null);
    return { status: 'blocked', permission, reminder: row };
  }

  const outcome = await scheduleNow(row);
  return { ...outcome, permission, reminder: row };
}

/**
 * Completes a reminder: cancels any pending notification and marks the row.
 * Never touches the linked transaction — a reminder's lifecycle is its own,
 * so completing here is NOT the same thing as marking a payment Paid.
 * Idempotent: a repeated "Complete" action on an already-completed reminder
 * changes nothing, which is what makes duplicate responses safe.
 */
export async function completeReminder(id) {
  return runExclusive(() => completeExclusive(id));
}

async function completeExclusive(id) {
  const existing = await getReminder(id);
  if (!existing) throw new Error('That reminder no longer exists.');
  if (existing.status === 'completed') return { status: 'completed', reminder: existing };
  await cancelOwnedNotification(existing);
  await saveReminderNotification(existing, null);
  const row = await completeReminderRow(id);
  return { status: 'completed', reminder: row };
}

/**
 * Snoozes one reminder without opening the app: the notification's "Remind
 * Later" button pushes that same row ten minutes ahead. No new row and no
 * new column — remind_date / remind_time / remind_at *are* the schedule —
 * and the note, link, enabled flag and status all ride through untouched.
 * The old notification is cancelled first, then the row moves, then a fresh
 * single notification is armed from the actual moment of the action.
 */
export async function snoozeReminder(id, { minutes } = {}) {
  return runExclusive(() => snoozeExclusive(id, minutes));
}

async function snoozeExclusive(id, minutes) {
  const existing = await getReminder(id);
  if (!existing) throw new Error('That reminder no longer exists.');
  if (existing.status === 'completed' || existing.enabled !== 1) {
    // Nothing to re-arm: leave completed and disabled rows exactly as they are.
    return { status: 'skipped', reminder: existing };
  }

  await cancelOwnedNotification(existing);

  const { date, time } = snoozeScheduleFrom({ minutes });
  const row = await updateReminderRow(id, { date, time });

  if (!notifications.isSupported) return { status: 'unsupported', reminder: row };

  // The action only exists on a notification the OS already delivered, so
  // permission is settled: read it, and never prompt from a notification tap.
  const { permission, ok } = await resolvePermission(false);
  if (!ok) {
    await saveReminderNotification(row, null);
    return { status: 'blocked', permission, reminder: row };
  }

  const outcome = await scheduleNow(row);
  return { ...outcome, permission, reminder: row };
}

/** Cancels any notification the reminder owns, then removes the row. */
export async function removeReminder(id) {
  return runExclusive(() => removeExclusive(id));
}

async function removeExclusive(id) {
  const existing = await getReminder(id);
  if (!existing) return 0;
  await cancelOwnedNotification(existing);
  return deleteReminderRow(id);
}

/** Cancels every notification belonging to a budget that is about to go. */
export async function cancelScheduledRemindersForBudget(budgetId) {
  // Archived rows included: this runs on permanent deletion, which can target
  // a budget that was archived first, and its alarms must still be cancelled.
  // Scoped to the budget's own transactions rather than every reminder.
  const rows = await getRemindersForBudget(budgetId, { includeArchived: true });
  for (const row of rows) {
    if (row.notification_id) await notifications.cancelAsync(row.notification_id);
  }
}

/**
 * Reconciles the OS with the database: schedules anything active that is not
 * scheduled, cancels anything scheduled that is no longer active (disabled,
 * completed, past, deleted) and repairs ids that drifted. Runs once at launch,
 * which is what allows Budgetarian to be correct even when a notification failed,
 * was cleared, or the app was reinstalled.
 */
export async function resyncReminders() {
  return runExclusive(resyncExclusive);
}

async function resyncExclusive() {
  if (!notifications.isSupported) return { scheduled: 0, cancelled: 0 };

  // Archived rows included: what is armed is decided by the reminder's own
  // state, so archiving a budget must never silently unschedule its alarms.
  const rows = await getReminders({ includeArchived: true });
  const scheduled = await notifications.listScheduledAsync();
  const permission = await notifications.getPermissionStatusAsync();

  /** Every Budgetarian notification we own, indexed by the reminder it belongs to. */
  const byReminderId = new Map();
  let cancelled = 0;
  for (const request of scheduled) {
    const reminderId = request.content?.data?.reminderId;
    if (request.content?.data?.source !== 'moneyq' || !reminderId) continue;
    if (byReminderId.has(reminderId)) {
      await notifications.cancelAsync(request.identifier);
      cancelled += 1;
      continue;
    }
    byReminderId.set(reminderId, request);
  }

  const now = new Date();
  const activeIds = new Set();
  let scheduledCount = 0;

  for (const row of rows) {
    const active =
      row.enabled === 1 &&
      row.status !== 'completed' &&
      !isRemindAtPast(row.remind_at, now);

    if (!active) continue;
    activeIds.add(row.id);

    const existing = byReminderId.get(row.id);
    if (existing) {
      if (row.notification_id !== existing.identifier) {
        await saveReminderNotification(row, existing.identifier);
      }
      continue;
    }
    if (!permission.granted) continue;

    const outcome = await scheduleNow(row);
    if (outcome.status === 'scheduled') scheduledCount += 1;
  }

  // Orphans: scheduled for a reminder that is no longer allowed to fire.
  for (const [reminderId, request] of byReminderId) {
    if (activeIds.has(reminderId)) continue;
    await notifications.cancelAsync(request.identifier);
    cancelled += 1;
  }

  // …and the stale ids left in our own rows when we could not schedule.
  for (const row of rows) {
    if (activeIds.has(row.id) || !row.notification_id) continue;
    await saveReminderNotification(row, null);
  }

  return { scheduled: scheduledCount, cancelled };
}
