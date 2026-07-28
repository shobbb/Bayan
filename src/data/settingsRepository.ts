/**
 * Repository over the settings table (REQ-3, REQ-C7). Holds config overrides
 * and other non-sensitive preferences. The API key is deliberately NOT
 * stored here — REQ-P4 requires it go through services/platform (Capacitor
 * Preferences / Keychain), never IndexedDB or localStorage.
 */
import { db } from './db';
import type { AppConfigOverrides } from '@/config/types';

const CONFIG_OVERRIDES_KEY = 'configOverrides';

export async function getConfigOverrides(): Promise<AppConfigOverrides | null> {
  const record = await db.settings.get(CONFIG_OVERRIDES_KEY);
  return (record?.value as AppConfigOverrides | undefined) ?? null;
}

export async function setConfigOverrides(overrides: AppConfigOverrides): Promise<void> {
  await db.settings.put({ key: CONFIG_OVERRIDES_KEY, value: overrides });
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const record = await db.settings.get(key);
  return (record?.value as T | undefined) ?? null;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}
