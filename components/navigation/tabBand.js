import { useSyncExternalStore } from 'react';

/**
 * The vertical band the floating tab capsule occupies on the bottom of the
 * five tab screens, measured by BottomTabBar's own onLayout. Toasts lift
 * above it; null when no tab bar is mounted (cold modals). A plain store
 * because expo-router 57 vendors react-navigation, so the official
 * BottomTabBarHeightContext is not importable from any public entry
 * ('expo-router/js-tabs' only re-exports the Tabs layout).
 */
let bandHeight = null;
const listeners = new Set();

export function setTabBandHeight(height) {
  if (height === bandHeight) return;
  bandHeight = height;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTabBandHeight() {
  return useSyncExternalStore(subscribe, () => bandHeight);
}
