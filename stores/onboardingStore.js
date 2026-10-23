import Constants from 'expo-constants';
import { create } from 'zustand';

import { isOnboardingSeen, markOnboardingSeen } from '../storage/repositories/settingsRepository';

/**
 * Expo Go is detected through Constants.appOwnership, which reads 'expo'
 * only in Expo Go — a dev-client or production build returns null even in
 * development, so __DEV__ alone would be wrong there.
 */
const isExpoGo = Constants.appOwnership === 'expo';

/**
 * First-launch onboarding visibility. A store, not a route: the carousel
 * is an overlay above the navigator, so showing or hiding it can never
 * redirect anything or flash between screens.
 *
 * The seen-flag is one settings row (see settingsRepository), which means
 * nothing new to persist or migrate. In Expo Go the flag is ignored both
 * ways — every fresh launch shows the tour for development review, and
 * completing or skipping only dismisses it for the running session.
 */
export const useOnboardingStore = create((set, get) => ({
  visible: false,

  /** Called once by the start-up gate before the first frame, while the
   *  splash is still up: the tour is either already showing or already
   *  dismissed — the app never flashes underneath it. */
  async load() {
    if (isExpoGo) {
      set({ visible: true });
      return;
    }
    set({ visible: !(await isOnboardingSeen()) });
  },

  /** Finish (or skip) the tour. Outside Expo Go this is the one write:
   *  a settings row saying it has been seen. Nothing else changes. */
  async complete() {
    set({ visible: false });
    if (!isExpoGo) await markOnboardingSeen();
  },

  /** Replay from Help & Guide. Deliberately touches no stored flag, no
   *  data, no settings — dismissing it again just hides the overlay. */
  replay() {
    set({ visible: true });
  },
}));
