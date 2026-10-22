import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  REMINDER_ACTION_COMPLETE,
  REMINDER_ACTION_SNOOZE,
  clearLastResponseAsync,
  getLastResponseAsync,
  subscribeToResponses,
} from '../../services/notificationService';
import { useRemindersStore } from '../../stores/remindersStore';

/** True for a payload id that can name a stored row. */
function isId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Turns a tapped Budgetarian notification into a route, and an action-button
 * response into a persisted reminder change.
 *
 *   "Complete" action      → completeReminder(id)  — no navigation
 *   "Remind Later" action  → snoozeReminder(id)    — no navigation
 *   linked notification    → data.transactionId + data.budgetId → transaction form
 *   standalone reminder    → data.reminderId only  → reminder form
 *
 * Both actions ride the same response pipeline as a tap: the live listener
 * catches them while the app runs, and `getLastResponseAsync` catches the one
 * that launched the app from a killed state — expo-notifications offers no
 * headless JS on Android without expo-task-manager, so acting from
 * a closed app opens Budgetarian briefly, persists through the store, then
 * clears the response. The action never navigates, so the user lands back
 * where they were.
 * The payload travels with the notification, so nothing is looked up twice.
 * Responses are deduplicated per notification *and* per action, so the same
 * button pressed twice (or delivered by both cold-start and listener) is
 * processed once; a repeated tap body on an already-handled row stays a
 * navigation only. Ids are validated before any navigation; a row deleted
 * since the schedule was armed lands on the form's own "not found" state,
 * which offers a way back instead of a broken screen.
 * The response is cleared once handled, so reopening the app later does not
 * replay the same jump — or the same completion, or the same snooze.
 */
export function NotificationTapHandler() {
  const handledRef = useRef(new Set());

  useEffect(() => {
    let active = true;

    function handleAction(response, data, key) {
      const action = response?.actionIdentifier;
      if (!isId(data.reminderId)) return false;
      if (action !== REMINDER_ACTION_COMPLETE && action !== REMINDER_ACTION_SNOOZE) {
        return false;
      }

      const actionKey = `${key}:${action}`;
      if (handledRef.current.has(actionKey)) return true;
      handledRef.current.add(actionKey);

      const store = useRemindersStore.getState();
      const work =
        action === REMINDER_ACTION_COMPLETE
          ? store.completeReminder(data.reminderId)
          : store.snoozeReminder(data.reminderId);

      work
        .catch(() => {
          // Stale row (deleted or already handled elsewhere): there is
          // nothing to persist. resyncReminders reconciles at next launch.
        })
        .finally(() => clearLastResponseAsync());
      return true;
    }

    function open(response) {
      const request = response?.notification?.request;
      const data = request?.content?.data;
      if (!data || data.source !== 'moneyq') return;

      const key = request.identifier ?? `${data.reminderId}:${data.transactionId}`;
      if (handledRef.current.has(key)) return;

      if (handleAction(response, data, key)) {
        handledRef.current.add(key);
        return;
      }
      handledRef.current.add(key);

      if (isId(data.transactionId) && isId(data.budgetId)) {
        router.push({
          pathname: '/transaction/form',
          params: { budgetId: data.budgetId, transactionId: data.transactionId },
        });
        clearLastResponseAsync();
        return;
      }
      if (isId(data.reminderId)) {
        router.push({
          pathname: '/reminder/form',
          params: { reminderId: data.reminderId },
        });
        clearLastResponseAsync();
      }
    }

    // Cold start: the tap happened before this component existed.
    getLastResponseAsync().then((response) => {
      if (active && response) open(response);
    });

    // Warm start: tapped while the app was already running.
    const unsubscribe = subscribeToResponses(open);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return null;
}
