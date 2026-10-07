/**
 * Browser stub for the notification service.
 *
 * Metro resolves `./notificationService` to this file on web, which keeps
 * `expo-notifications` (native-only, per its own docs) out of the web bundle
 * entirely. The API matches the native module so `reminderService` and every
 * screen run unchanged: scheduling simply reports that the platform cannot
 * deliver device notifications, and MoneyQ falls back to showing the saved
 * reminder without one.
 */

export const isSupported = false;

export const REMINDER_CHANNEL_ID = 'reminders';

export async function getPermissionStatusAsync() {
  return { supported: false, granted: false, canAskAgain: false, status: 'unavailable' };
}

export async function requestPermissionAsync() {
  return { supported: false, granted: false, canAskAgain: false, status: 'unavailable' };
}

export async function scheduleAsync() {
  return null;
}

export async function cancelAsync() {
  // Nothing was ever scheduled in a browser.
}

export async function listScheduledAsync() {
  return [];
}

export function subscribeToResponses() {
  return () => {};
}

export async function getLastResponseAsync() {
  return null;
}

export async function clearLastResponseAsync() {}
