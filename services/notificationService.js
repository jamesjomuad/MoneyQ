/**
 * Device notification plumbing — the delivery half of the reminder feature.
 *
 * Native entry point: Metro resolves `./notificationService` to this file on
 * Android/iOS and to `notificationService.web.js` in the browser, so
 * `expo-notifications` never enters the web bundle. Everything here is a thin
 * wrapper over the library: no MoneyQ rules, no transaction knowledge, no
 * stored state.
 *
 * Expo Go on Android removed push (remote) notifications from SDK 53.
 * Some local-notification calls internally hit the removed push path and
 * throw this exact error. We detect Expo Go Android up front and treat the
 * platform as unsupported; the catch blocks remain as a safety net. The
 * reminder row is still saved (source of truth); it simply cannot fire until
 * the app runs in a development build.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Expo Go on Android removed the push-notification subsystem from SDK 53,
// and several local-notification APIs internally hit that removed path and
// throw. Detect the environment up front so we never call those APIs.
function isUnsupportedEnvironment() {
  if (Platform.OS !== 'android') return false;
  try {
    const { expoGoConfig } = require('expo-constants').default;
    return expoGoConfig != null;
  } catch {
    return false;
  }
}

export const isSupported = !isUnsupportedEnvironment();

export const REMINDER_CHANNEL_ID = 'reminders';

const EXPONENT_GO_PUSH = 'was removed from Expo Go';

function isExpoGoPushError(error) {
  return typeof error?.message === 'string' && error.message.includes(EXPONENT_GO_PUSH);
}

/**
 * Notifications that arrive while the app is open are still shown — a
 * reminder the user is staring at the phone for must not be swallowed.
 */
if (isSupported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Handler registration is best-effort; the row-based reminder still works.
  }
}

let channelReady = false;

/** Android 8+ shows nothing without a channel, and Android 13 will not even
 *  prompt for permission until one exists. */
async function ensureChannel() {
  if (!isSupported || Platform.OS !== 'android' || channelReady) return;
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

const UNSUPPORTED_STATUS = { supported: false, granted: false, canAskAgain: false, status: 'unavailable' };

/** Read-only: safe to call whenever the UI wants to display current status. */
export async function getPermissionStatusAsync() {
  if (!isSupported) return UNSUPPORTED_STATUS;
  try {
    const settings = await Notifications.getPermissionsAsync();
    return {
      supported: true,
      granted: Boolean(settings.granted),
      canAskAgain: settings.canAskAgain !== false,
      status: settings.status,
    };
  } catch (error) {
    if (isExpoGoPushError(error)) return { supported: false, granted: false, canAskAgain: false, status: 'unavailable' };
    return { supported: true, granted: false, canAskAgain: true, status: 'undetermined' };
  }
}

/** Asks once. An already-denied permission answers without showing a prompt,
 *  so opening a transaction never nags the user. */
export async function requestPermissionAsync() {
  if (!isSupported) return UNSUPPORTED_STATUS;
  await ensureChannel();
  try {
    const settings = await Notifications.requestPermissionsAsync();
    return {
      supported: true,
      granted: Boolean(settings.granted),
      canAskAgain: settings.canAskAgain !== false,
      status: settings.status,
    };
  } catch (error) {
    if (isExpoGoPushError(error)) return { supported: false, granted: false, canAskAgain: false, status: 'unavailable' };
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
  await ensureChannel();
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
