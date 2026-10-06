import { create } from 'zustand';

import { CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';
import { SETTING_KEYS, getSetting, setSetting } from '../database/repositories/settingsRepository';

/**
 * Transient view state only. SQLite remains the source of truth: this store
 * holds a value it has read from the database and writes changes back through
 * the repository. No Zustand persistence middleware is used anywhere.
 */
export const useSettingsStore = create((set) => ({
  currency: DEFAULT_CURRENCY,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const currency = await getSetting(SETTING_KEYS.currency, DEFAULT_CURRENCY);
      set({
        currency: Object.hasOwn(CURRENCIES, currency) ? currency : DEFAULT_CURRENCY,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  setCurrency: async (currency) => {
    if (!Object.hasOwn(CURRENCIES, currency)) return;
    set({ currency });
    await setSetting(SETTING_KEYS.currency, currency);
  },

  resetSettings: () => set({ currency: DEFAULT_CURRENCY }),
}));

export const selectCurrency = (state) => state.currency;