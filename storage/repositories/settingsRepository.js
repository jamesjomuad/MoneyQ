import { storage } from '../adapters/adapter';

export const SETTING_KEYS = {
  currency: 'currency',
  theme: 'theme',
  pinnedBudgets: 'pinned_budgets',
};

/**
 * Pinned budget ids live in the settings table as a JSON array, in pin order.
 * Anything unreadable collapses to an empty list so a bad value can never
 * break the Home screen.
 */
export function normalizePinnedBudgetIds(value) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id) => typeof id === 'string' && id.length > 0))];
  } catch {
    return [];
  }
}

export async function getPinnedBudgetIds() {
  return normalizePinnedBudgetIds(await getSetting(SETTING_KEYS.pinnedBudgets, '[]'));
}

export async function setPinnedBudgetIds(ids) {
  return setSetting(SETTING_KEYS.pinnedBudgets, JSON.stringify(ids));
}

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
