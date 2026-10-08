import { storage } from '../adapters/adapter';

export const SETTING_KEYS = {
  currency: 'currency',
  theme: 'theme',
};

export const THEME_PREFERENCES = ['system', 'light', 'dark', 'moneyq'];
export const DEFAULT_THEME = 'system';

export function normalizeTheme(value) {
  return THEME_PREFERENCES.includes(value) ? value : DEFAULT_THEME;
}

export async function getSetting(key, fallback = null) {
  return storage.getSetting(key, fallback);
}

export async function setSetting(key, value) {
  return storage.setSetting(key, value);
}

export async function getAllSettings() {
  return storage.getAllSettings();
}
