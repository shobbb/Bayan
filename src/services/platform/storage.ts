/**
 * Secure key storage (REQ-P4). Maps to Keychain on iOS and
 * EncryptedSharedPreferences on Android via Capacitor Preferences — never
 * localStorage. This is the only place the LLM API key touches disk.
 */
import { Preferences } from '@capacitor/preferences';

const API_KEY_STORAGE_KEY = 'bayan.llmApiKey';

/**
 * A key baked in at build time, used only when the device has none stored.
 *
 * This exists for hosted test builds behind access control: it saves entering
 * the key once per browser storage context. Vite inlines the value into the
 * bundle, so it is readable by anyone who can fetch the built assets — never
 * set it on a deployment without access control.
 *
 * It is deliberately confined to this module. Native builds have no such value
 * and fall through to Preferences (Keychain / EncryptedSharedPreferences) as
 * REQ-P4 requires, so nothing above this layer branches on where a key came
 * from, and removing the variable removes the behaviour entirely.
 */
function buildTimeApiKey(): string | null {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
  return key && key.trim() !== '' ? key.trim() : null;
}

/** True when the key in use came from the build rather than this device. */
export async function isUsingBuildTimeKey(): Promise<boolean> {
  const { value } = await Preferences.get({ key: API_KEY_STORAGE_KEY });
  return !value && buildTimeApiKey() !== null;
}

export async function getApiKey(): Promise<string | null> {
  const { value } = await Preferences.get({ key: API_KEY_STORAGE_KEY });
  // A key stored on the device always wins, so entering one overrides the build.
  return value ?? buildTimeApiKey();
}

export async function setApiKey(apiKey: string): Promise<void> {
  await Preferences.set({ key: API_KEY_STORAGE_KEY, value: apiKey });
}

export async function clearApiKey(): Promise<void> {
  await Preferences.remove({ key: API_KEY_STORAGE_KEY });
}
