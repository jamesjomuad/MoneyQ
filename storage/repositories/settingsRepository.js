import { storage } from '../adapters/adapter';

export const SETTING_KEYS = {
  currency: 'currency',
};

export async function getSetting(key, fallback = null) {
  return storage.getSetting(key, fallback);
}

export async function setSetting(key, value) {
  return storage.setSetting(key, value);
}

export async function getAllSettings() {
  return storage.getAllSettings();
}
