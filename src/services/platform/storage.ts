/**
 * Secure key storage (REQ-P4). Maps to Keychain on iOS and
 * EncryptedSharedPreferences on Android via Capacitor Preferences — never
 * localStorage. This is the only place the LLM API key touches disk.
 */
import { Preferences } from '@capacitor/preferences';

const API_KEY_STORAGE_KEY = 'bayan.llmApiKey';

export async function getApiKey(): Promise<string | null> {
  const { value } = await Preferences.get({ key: API_KEY_STORAGE_KEY });
  return value ?? null;
}

export async function setApiKey(apiKey: string): Promise<void> {
  await Preferences.set({ key: API_KEY_STORAGE_KEY, value: apiKey });
}

export async function clearApiKey(): Promise<void> {
  await Preferences.remove({ key: API_KEY_STORAGE_KEY });
}
