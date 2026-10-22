/**
 * Device notification plumbing — the delivery half of the reminder feature.
 *
 * Native entry point: Metro resolves `./notificationService` to this file on
 * Android/iOS and to `notificationService.web.js` in the browser, so
 * `expo-notifications` never enters the web bundle. Everything here is a thin
 * wrapper over the library: no Budgetarian rules, no transaction knowledge, no
 * stored state.
 *
 * Standalone and development builds support local notifications here. Expo Go
 * on Android is the one native exception: since SDK 53 merely *evaluating*
 * `expo-notifications` throws there (its push auto-registration side effect
 * hits the removed push API), so that environment is gated off up front and
 * reminders degrade to database rows only. `notificationService.web.js` owns
 * the other unsupported surface, the browser. Push-only entry points stay
 * guarded by `isExpoGoPushError` should one ever be reached.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const EXPO_GO_ANDROID = Platform.OS === 'android' && Constants.appOwnership === 'expo';

export const isSupported = !EXPO_GO_ANDROID;
export const REMINDER_CHANNEL_ID = 'reminders';

/**
 * One notification category carries the two reminder actions. Android renders
 * the buttons from this stored category at display time and iOS mirrors it as
 * a UNNotificationCategory, so scheduling only has to name the identifier.
 */
export const REMINDER_CATEGORY_ID = 'reminders';
export const REMINDER_ACTION_COMPLETE = 'budgetarian.reminder.complete';
export const REMINDER_ACTION_SNOOZE = 'budgetarian.reminder.snooze';

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

let categoryReady = false;

/**
 * Registers the Complete / Remind Later action buttons once per process.
 * The OS persists the category, so notifications scheduled now still show
 * their actions after a restart even if this run never reached the call.
 * Best-effort: without it the reminder simply arrives as a plain notification.
 */
async function ensureCategory(Notifications) {
  if (!Notifications || categoryReady) return;
  try {
    await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
      { identifier: REMINDER_ACTION_COMPLETE, buttonTitle: 'Complete' },
      { identifier: REMINDER_ACTION_SNOOZE, buttonTitle: 'Remind Later' },
    ]);
    categoryReady = true;
  } catch {
    // Actions are an enhancement; delivery never depends on them.
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
 * can find the transaction it came from, and the reminder category rides with
 * it so every scheduled reminder shows its Complete / Remind Later actions.
 */
export async function scheduleAsync({ title, body, data = {}, remindAt }) {
  if (!isSupported) return null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;
  await ensureChannel(Notifications);
  await ensureCategory(Notifications);
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { ...data, source: 'moneyq' },
        sound: true,
        categoryIdentifier: REMINDER_CATEGORY_ID,
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

/**
 * Never throws: cancelling something already gone is a success. An action can
 * arrive while the notification is still on screen, and the OS keeps the same
 * request identifier through delivery, so this also dismisses the displayed
 * copy — a completed reminder must not keep sitting in the tray.
 */
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
  try {
    await Notifications.cancelDisplayedNotificationAsync(notificationId);
  } catch {
    // Not on screen: nothing to dismiss.
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
