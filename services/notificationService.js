/**
 * Device notification plumbing — the delivery half of the reminder feature.
 *
 * Native entry point: Metro resolves `./notificationService` to this file on
 * Android/iOS and to `notificationService.web.js` in the browser, so
 * `expo-notifications` never enters the web bundle. Everything here is a thin
 * wrapper over the library: no MoneyQ rules, no transaction knowledge, no
 * stored state.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const isSupported = true;

export const REMINDER_CHANNEL_ID = 'reminders';

/**
 * Notifications that arrive while the app is open are still shown — a
 * reminder the user is staring at the phone for must not be swallowed.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReady = false;

/** Android 8+ shows nothing without a channel, and Android 13 will not even
 *  prompt for permission until one exists. */
async function ensureChannel() {
  if (Platform.OS !== 'android' || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F6B4B',
      bypassDnd: false,
      showBadge: false,
    });
    channelReady = true;
  } catch {
    // A missing channel degrades to the OS fallback channel, never a crash.
  }
}

/** Read-only: safe to call whenever the UI wants to display current status. */
export async function getPermissionStatusAsync() {
  try {
    const settings = await Notifications.getPermissionsAsync();
    return {
      supported: true,
      granted: Boolean(settings.granted),
      canAskAgain: settings.canAskAgain !== false,
      status: settings.status,
    };
  } catch {
    return { supported: true, granted: false, canAskAgain: true, status: 'undetermined' };
  }
}

/** Asks once. An already-denied permission answers without showing a prompt,
 *  so opening a transaction never nags the user. */
export async function requestPermissionAsync() {
  await ensureChannel();
  try {
    const settings = await Notifications.requestPermissionsAsync();
    return {
      supported: true,
      granted: Boolean(settings.granted),
      canAskAgain: settings.canAskAgain !== false,
      status: settings.status,
    };
  } catch {
    return { supported: true, granted: false, canAskAgain: false, status: 'denied' };
  }
}

/**
 * Schedules one notification at an exact local instant and returns the OS
 * identifier that can cancel it later. `data` rides along untouched so a tap
 * can find the transaction it came from.
 */
export async function scheduleAsync({ title, body, data = {}, remindAt }) {
  await ensureChannel();
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { ...data, source: 'moneyq' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(remindAt),
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

/** Never throws: cancelling something already gone is a success. */
export async function cancelAsync(notificationId) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Already delivered, already cancelled, or a wiped install.
  }
}

export async function listScheduledAsync() {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return [];
  }
}

export function subscribeToResponses(listener) {
  const subscription = Notifications.addNotificationResponseReceivedListener(listener);
  return () => subscription.remove();
}

export async function getLastResponseAsync() {
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}

export async function clearLastResponseAsync() {
  try {
    await Notifications.clearLastNotificationResponseAsync();
  } catch {
    // Clearing is best-effort housekeeping only.
  }
}
