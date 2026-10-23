import { useSyncExternalStore } from 'react';

/**
 * Fixed geometry of the floating capsule. The band around it is pure air: the
 * bar paints nothing there, so the scene scrolls beneath the capsule and the
 * band only decides where the bar's controls live.
 */
export const TAB_BAR_CAPSULE_HEIGHT = 68;
export const TAB_BAR_LIFT = 10; // extra air under the capsule, off the edge

/**
 * Height of the band the floating capsule occupies, derived from the same
 * numbers BottomTabBar lays out with. Screens reserve this at the end of their
 * scroll content so the last row still scrolls clear of the floating capsule;
 * it is computed (not measured) so the first frame is already correct.
 */
export function tabBandHeight(insetsBottom, spacing) {
  return (
    spacing.sm + // air above the capsule for its shadow
    TAB_BAR_CAPSULE_HEIGHT +
    Math.max(insetsBottom, spacing.md) + // system nav area or breathing room
    TAB_BAR_LIFT
  );
}

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
