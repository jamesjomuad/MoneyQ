import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  clearLastResponseAsync,
  getLastResponseAsync,
  subscribeToResponses,
} from '../../services/notificationService';

/**
 * Turns a tapped MoneyQ notification into a route.
 *
 *   notification → data.transactionId + data.budgetId → transaction screen
 *
 * The payload travels with the notification, so nothing is looked up twice
 * and the navigation works whether the app was foregrounded, backgrounded or
 * not running. Mounted inside the navigation shell, after storage is ready,
 * so a cold-start tap lands on a screen that can actually load the entry.
 * The response is cleared once handled, so reopening the app later does not
 * replay the same jump.
 */
export function NotificationTapHandler() {
  const handledRef = useRef(new Set());

  useEffect(() => {
    let active = true;

    function open(response) {
      const request = response?.notification?.request;
      const data = request?.content?.data;
      if (!data || data.source !== 'moneyq') return;

      const key = request.identifier ?? `${data.reminderId}:${data.transactionId}`;
      if (handledRef.current.has(key)) return;
      handledRef.current.add(key);

      if (!data.transactionId || !data.budgetId) return;
      router.push({
        pathname: '/transaction/form',
        params: { budgetId: data.budgetId, transactionId: data.transactionId },
      });
      clearLastResponseAsync();
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
