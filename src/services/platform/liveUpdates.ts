/**
 * Over-the-air updates to the web layer (§2.0.2), behind the platform
 * interface (REQ-P5).
 *
 * A Capacitor app's UI and logic are web assets inside a native shell, so a new
 * bundle can replace them without a new binary. That is the difference between
 * a fix reaching the reader and a fix waiting for someone to be at their Mac.
 *
 * This is not `server.url`. The bundle still ships inside the binary and the
 * app runs from whatever it already has; a newer bundle is fetched in the
 * background when there is a connection and swapped in at the next launch. No
 * signal means the last good bundle, not a blank screen — which is the whole
 * reason to prefer this over pointing the WebView at a hosted URL.
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

export function liveUpdatesAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CapacitorUpdater');
}

/**
 * Tells the native layer this bundle actually works.
 *
 * **Load-bearing.** The plugin assumes a freshly applied bundle is suspect: if
 * nothing confirms that JavaScript came up, it reverts to the previous one on
 * the next launch. That is a good default — it is what stops a broken update
 * bricking the app on a device nobody can reach — but it means forgetting this
 * call does not fail loudly. It silently undoes every update, forever, and
 * looks exactly like updates never arriving.
 *
 * Called from a mount effect rather than from bootstrap on purpose. The signal
 * is meant to mean "the app is running", and a bundle that throws while
 * rendering should be rolled back, not confirmed. An effect only runs once the
 * tree has actually mounted, which is the closest honest proxy.
 */
export async function notifyBundleHealthy(): Promise<void> {
  if (!liveUpdatesAvailable()) return;

  try {
    await CapacitorUpdater.notifyAppReady();
  } catch (error) {
    // Never rethrow. A failure here means this bundle may be rolled back at the
    // next launch, which is the safe direction — and the reader is mid-session
    // and can do nothing about it either way.
    console.error('Live update: failed to mark this bundle healthy:', error);
  }
}

/**
 * Which bundle is running, for Settings.
 *
 * Worth a line of UI because automatic updating is otherwise entirely opaque:
 * it succeeds silently and fails silently, and from a long way away "the fix
 * arrived and did not help" is indistinguishable from "the app never checked".
 * A version on the device answers that without a dashboard, a signal, or
 * anyone to ask. `builtin` is the bundle compiled into the binary.
 */
export async function currentBundle(): Promise<string | null> {
  if (!liveUpdatesAvailable()) return null;

  try {
    const { bundle } = await CapacitorUpdater.current();
    return bundle.version;
  } catch {
    return null;
  }
}

export type UpdateCheck =
  | { status: 'unavailable' }
  | { status: 'upToDate' }
  | { status: 'downloaded'; version: string }
  | { status: 'failed'; reason: string };

/**
 * Checks now, rather than waiting for the next backgrounding.
 *
 * The automatic path covers the ordinary case; this exists for the moment
 * somebody actually wants to know — a fix has been pushed and they would
 * rather not guess whether it has landed. A downloaded bundle still applies at
 * the next cold start, which the caller says plainly instead of implying the
 * app has already changed.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!liveUpdatesAvailable()) return { status: 'unavailable' };

  try {
    const latest = await CapacitorUpdater.getLatest();
    if (!latest.url || !latest.version) return { status: 'upToDate' };

    const current = await currentBundle();
    if (current !== null && current === latest.version) return { status: 'upToDate' };

    const bundle = await CapacitorUpdater.download({
      url: latest.url,
      version: latest.version,
      ...(latest.checksum ? { checksum: latest.checksum } : {}),
    });
    await CapacitorUpdater.next({ id: bundle.id });

    return { status: 'downloaded', version: latest.version };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
