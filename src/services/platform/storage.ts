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

/**
 * Loads the Preferences plugin while the page is known to be fresh.
 *
 * Capacitor code-splits each plugin's web implementation and fetches it on
 * first use. Nothing here is touched at boot — settings live in IndexedDB, not
 * Preferences — so the first fetch was whenever an API key was first read,
 * which can be hours into a session. By then a deploy may have renamed the
 * hashed chunk, and the import fails inside whatever feature happened to ask
 * for it: "Importing a module script failed", raised against Translate.
 *
 * Loading it up front does not make the page immune to a deploy, but it moves
 * the failure to the one moment when reloading costs nothing.
 */
export async function warmPlatformPlugins(): Promise<void> {
  try {
    await Preferences.get({ key: API_KEY_STORAGE_KEY });
  } catch {
    // Warming is an optimisation. A device that cannot read Preferences has a
    // real problem, but it is not this function's to report — the call that
    // actually needs a key will surface it.
  }
}

export async function getApiKey(): Promise<string | null> {
  const { value } = await Preferences.get({ key: API_KEY_STORAGE_KEY });
  // A key stored on the device always wins, so entering one overrides the build.
  return value ?? buildTimeApiKey();
}

export async function setApiKey(apiKey: string): Promise<void> {
  await Preferences.set({ key: API_KEY_STORAGE_KEY, value: apiKey });
}

const SUPABASE_URL_KEY = 'bayan.supabaseUrl';
const SUPABASE_ANON_KEY = 'bayan.supabaseAnonKey';

export interface SupabaseCredentials {
  url: string;
  anonKey: string;
  bucket: string;
}

/**
 * Remote-backup credentials, device value first, then the build.
 *
 * Only the anon key is handled. It is publishable by design — privileges come
 * from row-level security, not the key. The service_role key bypasses every
 * policy, so it is never accepted here: on a client it would hand full control
 * of the project to anyone who can read the bundle.
 */
export async function getSupabaseCredentials(): Promise<SupabaseCredentials | null> {
  const [storedUrl, storedKey] = await Promise.all([
    Preferences.get({ key: SUPABASE_URL_KEY }),
    Preferences.get({ key: SUPABASE_ANON_KEY }),
  ]);

  const url = storedUrl.value ?? import.meta.env.VITE_SUPABASE_URL ?? '';
  const anonKey = storedKey.value ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  if (url.trim() === '' || anonKey.trim() === '') return null;

  return {
    url: url.trim(),
    anonKey: anonKey.trim(),
    bucket: (import.meta.env.VITE_SUPABASE_BUCKET ?? 'bayan').trim(),
  };
}

export async function setSupabaseCredentials(url: string, anonKey: string): Promise<void> {
  await Preferences.set({ key: SUPABASE_URL_KEY, value: url });
  await Preferences.set({ key: SUPABASE_ANON_KEY, value: anonKey });
}

export async function clearSupabaseCredentials(): Promise<void> {
  await Preferences.remove({ key: SUPABASE_URL_KEY });
  await Preferences.remove({ key: SUPABASE_ANON_KEY });
}

export async function clearApiKey(): Promise<void> {
  await Preferences.remove({ key: API_KEY_STORAGE_KEY });
}
