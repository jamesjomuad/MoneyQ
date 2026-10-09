/**
 * Reminder orchestration — the half of the feature that knows MoneyQ's rules.
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
  getReminderForTransaction,
  getReminders,
  saveReminder,
  saveReminderNotification,
} from '../storage/repositories/reminderRepository';
import { getSetting, SETTING_KEYS } from '../storage/repositories/settingsRepository';
import { DEFAULT_CURRENCY } from '../utils/currency';
import { buildReminderNotification, isRemindAtPast } from '../utils/reminders';
import * as notifications from './notificationService';

async function currencyOf() {
  try {
    return await getSetting(SETTING_KEYS.currency, DEFAULT_CURRENCY);
  } catch {
    return DEFAULT_CURRENCY;
  }
}

/** Notification payload for one reminder row, rebuilt from stored data only. */
function contentFor(reminder, transaction, currency) {
  const text = buildReminderNotification({ transaction, currency });
  return {
    title: text.title,
    body: text.body,
    data: {
      transactionId: reminder.transaction_id,
      budgetId: transaction.budget_id,
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
async function scheduleNow(reminder, transaction, currency) {
  try {
    const notificationId = await notifications.scheduleAsync(
      contentFor(reminder, transaction, currency),
    );
    await saveReminderNotification(reminder, notificationId);
    return { status: 'scheduled', notificationId };
  } catch (error) {
    return { status: 'failed', error };
  }
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
  if (existing?.notification_id) {
    await notifications.cancelAsync(existing.notification_id);
  }

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

  const permission = requestPermission
    ? await notifications.requestPermissionAsync()
    : await notifications.getPermissionStatusAsync();

  if (!permission.granted) {
    return { status: 'blocked', permission, reminder: row };
  }

  const currency = await currencyOf();
  const outcome = await scheduleNow(row, transaction, currency);
  return { ...outcome, permission, reminder: row };
}

/**
 * Cancels the notification a transaction owns and clears its id, leaving the
 * reminder row (and the transaction) intact. Used when a reminder is disabled
 * or its transaction is deleted: the record stays, only the delivery stops.
 */
export async function cancelScheduledReminder(transactionId) {
  const row = await getReminderForTransaction(transactionId);
  if (!row) return;
  if (row.notification_id) await notifications.cancelAsync(row.notification_id);
  await saveReminderNotification(row, null);
}

/** Cancels every notification belonging to a budget that is about to go. */
export async function cancelScheduledRemindersForBudget(budgetId) {
  const rows = (await getReminders()).filter((row) => row.budget_id === budgetId);
  for (const row of rows) {
    if (row.notification_id) await notifications.cancelAsync(row.notification_id);
  }
}

/**
 * Reconciles the OS with the database: schedules anything active that is not
 * scheduled, cancels anything scheduled that is no longer active (disabled,
 * past, deleted) and repairs ids that drifted. Runs once at launch, which is
 * what allows MoneyQ to be correct even when a notification failed, was
 * cleared, or the app was reinstalled.
 */
export async function resyncReminders() {
  if (!notifications.isSupported) return { scheduled: 0, cancelled: 0 };

  const rows = await getReminders();
  const scheduled = await notifications.listScheduledAsync();
  const permission = await notifications.getPermissionStatusAsync();
  const currency = await currencyOf();

  /** Every MoneyQ notification we own, indexed by the reminder it belongs to. */
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

    const transaction = {
      id: row.transaction_id,
      budget_id: row.budget_id,
      amount: row.amount,
      description: row.description,
    };
    const outcome = await scheduleNow(row, transaction, currency);
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
