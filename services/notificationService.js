/**
 * Device notification plumbing — the delivery half of the reminder feature.
 *
 * Native entry point: Metro resolves `./notificationService` to this file on
 * Android/iOS and to `notificationService.web.js` in the browser, so
 * `expo-notifications` never enters the web bundle. Everything here is a thin
 * wrapper over the library: no MoneyQ rules, no transaction knowledge, no
 * stored state.
 *
 * Every environment that resolves to this file supports local notifications:
 * standalone builds, development builds and Expo Go alike. Only remote push
 * was removed from Expo Go in SDK 53, and MoneyQ never calls a push API, so
 * no environment gate is needed here — `notificationService.web.js` owns the
 * one unsupported surface, the browser. The library still imports cleanly in
 * Expo Go (it only warns), and the push-only entry points are guarded by
 * `isExpoGoPushError` should one ever be reached.
 */

import { Platform } from 'react-native';

export const isSupported = true;

export const REMINDER_CHANNEL_ID = 'reminders';

const EXPONENT_GO_PUSH = 'was removed from Expo Go';

function isExpoGoPushError(error) {
  return typeof error?.message === 'string' && error.message.includes(EXPONENT_GO_PUSH);
}

const UNSUPPORTED_STATUS = { supported: false, granted: false, canAskAgain: false, status: 'unavailable' };

/** Lazily loads the native notifications module. Returns null when unsupported. */
async function getNotificationsModule() {
  if (!isSupported) return null;
  return import('expo-notifications');
}

let handlerSet = false;

/**
 * Notifications that arrive while the app is open are still shown — a
 * reminder the user is staring at the phone for must not be swallowed.
 */
async function ensureHandler(Notifications) {
  if (handlerSet || !Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerSet = true;
  } catch {
    // Handler registration is best-effort; the row-based reminder still works.
  }
}

let channelReady = false;

/** Android 8+ shows nothing without a channel, and Android 13 will not even
 *  prompt for permission until one exists. */
async function ensureChannel(Notifications) {
  if (!Notifications || Platform.OS !== 'android' || channelReady) return;
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
  } catch (error) {
    if (isExpoGoPushError(error)) channelReady = true; // don't retry; scheduling will also be caught
  }
}

/** Read-only: safe to call whenever the UI wants to display current status. */
export async function getPermissionStatusAsync() {
  if (!isSupported) return UNSUPPORTED_STATUS;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return UNSUPPORTED_STATUS;
  await ensureHandler(Notifications);
  try {
    const settings = await Notifications.getPermissionsAsync();
    return {
      supported: true,
      granted: Boolean(settings.granted),
      canAskAgain: settings.canAskAgain !== false,
      status: settings.status,
    };
  } catch (error) {
    if (isExpoGoPushError(error)) return UNSUPPORTED_STATUS;
    return { supported: true, granted: false, canAskAgain: true, status: 'undetermined' };
  }
}

/** Asks once. An already-denied permission answers without showing a prompt,
 *  so opening a transaction never nags the user. */
export async function requestPermissionAsync() {
  if (!isSupported) return UNSUPPORTED_STATUS;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return UNSUPPORTED_STATUS;
  await ensureChannel(Notifications);
  try {
    const settings = await Notifications.requestPermissionsAsync();
    return {
      supported: true,
      granted: Boolean(settings.granted),
      canAskAgain: settings.canAskAgain !== false,
      status: settings.status,
    };
  } catch (error) {
    if (isExpoGoPushError(error)) return UNSUPPORTED_STATUS;
    return { supported: true, granted: false, canAskAgain: false, status: 'denied' };
  }
}

/**
 * Schedules one notification at an exact local instant and returns the OS
 * identifier that can cancel it later. `data` rides along untouched so a tap
 * can find the transaction it came from.
 */
export async function scheduleAsync({ title, body, data = {}, remindAt }) {
  if (!isSupported) return null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;
  await ensureChannel(Notifications);
  try {
    return await Notifications.scheduleNotificationAsync({
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
  } catch (error) {
    if (isExpoGoPushError(error)) return null;
    throw error;
  }
}

/** Never throws: cancelling something already gone is a success. */
export async function cancelAsync(notificationId) {
  if (!notificationId) return;
  if (!isSupported) return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Already delivered, already cancelled, or a wiped install.
  }
}

export async function listScheduledAsync() {
  if (!isSupported) return [];
  const Notifications = await getNotificationsModule();
  if (!Notifications) return [];
  await ensureHandler(Notifications);
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return [];
  }
}

export function subscribeToResponses(listener) {
  if (!isSupported) return () => {};
  // This is the one API that must stay synchronous (it returns an unsubscribe
  // function), so it needs a conditional require rather than a top-level import.
  try {
    const Notifications = require('expo-notifications');
    const subscription = Notifications.addNotificationResponseReceivedListener(listener);
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

export async function getLastResponseAsync() {
  if (!isSupported) return null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}

export async function clearLastResponseAsync() {
  if (!isSupported) return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.clearLastNotificationResponseAsync();
  } catch {
    // Clearing is best-effort housekeeping only.
  }
}
