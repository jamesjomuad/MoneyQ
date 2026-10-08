import { create } from 'zustand';

import { CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';
import {
  DEFAULT_THEME,
  SETTING_KEYS,
  getSetting,
  normalizeTheme,
  setSetting,
} from '../storage/repositories/settingsRepository';

/**
 * Transient view state only. SQLite remains the source of truth: this store
 * holds a value it has read from the database and writes changes back through
 * the repository. No Zustand persistence middleware is used anywhere.
 */
export const useSettingsStore = create((set) => ({
  currency: DEFAULT_CURRENCY,
  theme: DEFAULT_THEME,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const [currency, theme] = await Promise.all([
        getSetting(SETTING_KEYS.currency, DEFAULT_CURRENCY),
        getSetting(SETTING_KEYS.theme, DEFAULT_THEME),
      ]);
      set({
        currency: Object.hasOwn(CURRENCIES, currency) ? currency : DEFAULT_CURRENCY,
        theme: normalizeTheme(theme),
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

  setTheme: async (theme) => {
    const normalized = normalizeTheme(theme);
    if (normalized !== theme) return;
    set({ theme: normalized });
    await setSetting(SETTING_KEYS.theme, normalized);
  },

  resetSettings: () => set({ currency: DEFAULT_CURRENCY, theme: DEFAULT_THEME }),
}));

export const selectCurrency = (state) => state.currency;