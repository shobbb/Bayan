/**
 * The on-device language model (§13), behind the platform interface (REQ-P5).
 *
 * iOS 26+ exposes Apple Intelligence's on-device model to third-party apps;
 * Android has Gemini Nano on supported devices. Both are free, offline and
 * unmetered, which is what makes open-ended use — conversation practice rather
 * than a few hundred lookups — affordable at all.
 *
 * The plugin's surface is a streaming chat: create a session, send a message,
 * and collect `textFromAi` chunks until `aiFinished`. This module folds that
 * into one awaited call, because everything upstream (services/llm) speaks in
 * whole responses. Streaming is kept available separately for the chat feature,
 * where partial text is the point.
 *
 * Availability is a real state, not an assumption. The model is absent in a
 * browser, on ineligible hardware, when the owner has Apple Intelligence
 * switched off, and while it is still downloading — so every entry point
 * reports unavailability rather than throwing, exactly as notifications do.
 */
import { Capacitor } from '@capacitor/core';
import { CapgoLLM } from '@capgo/capacitor-llm';

/**
 * The system model on each platform. Not a file path: these strings select the
 * OS-provided model rather than a bundled one, which is the whole point — no
 * download, no app-size cost, no licence.
 */
const SYSTEM_MODEL: Record<string, string> = {
  ios: 'Apple Intelligence',
  android: 'Gemini Nano',
};

export type LocalModelState =
  | 'ready'
  /** No on-device model here at all — a browser, or unsupported hardware. */
  | 'unsupported'
  /** Present but switched off, or still downloading. Might become ready. */
  | 'notReady';

export interface LocalModelStatus {
  state: LocalModelState;
  /** The platform's own wording, for the operator. Never shown as an excuse. */
  detail: string;
}

/** False in a browser: the hosted build is a test surface (REQ-P1), not a host. */
export function localModelSupported(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable('CapgoLLM') &&
    SYSTEM_MODEL[Capacitor.getPlatform()] !== undefined
  );
}

/**
 * Whether the model can answer right now.
 *
 * `readiness` is a free-form string across platforms, so this maps loosely and
 * treats anything it does not recognise as not-ready. Guessing optimistically
 * would mean a reader taps Define and waits for a call that cannot happen.
 */
export async function localModelStatus(): Promise<LocalModelStatus> {
  if (!localModelSupported()) {
    return { state: 'unsupported', detail: 'No on-device model on this platform.' };
  }

  try {
    const { readiness } = await CapgoLLM.getReadiness();
    const normalized = readiness.toLowerCase();
    if (normalized.includes('ready') && !normalized.includes('not')) {
      return { state: 'ready', detail: readiness };
    }
    return { state: 'notReady', detail: readiness };
  } catch (error) {
    return { state: 'notReady', detail: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Every downloaded model on disk, as filename → path.
 *
 * A map rather than a single path because more than one model can be on the
 * device at a time, and each is gigabytes. Holding only one meant downloading a
 * second model forgot the first: its file stayed in the documents directory,
 * unreferenced and unreclaimable, and the app offered to fetch it again.
 *
 * Only the paths. The files themselves are put there by the plugin, so losing
 * this key costs the pointers and not the gigabytes — re-downloading is wasteful
 * but never wrong.
 */
const FILES_KEY = 'localModelFiles';
/**
 * Which model answers: a path, or absent for the operating system's own.
 *
 * Separate from the list above because "I have this model" and "I am using this
 * model" are different facts. Collapsing them meant going back to the system
 * model forgot where the downloaded file was, so returning to it cost another
 * two gigabytes for a file already sitting on the device.
 */
const ACTIVE_KEY = 'localModelActive';

/** The single-model keys these replaced. Read once, to migrate, then cleared. */
const LEGACY_PATH_KEY = 'localModelPath';
const LEGACY_USE_KEY = 'localModelUseDownloaded';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // A choice that cannot be remembered still holds for this session.
  }
}

/**
 * Carries a device that downloaded a model under the old single-path scheme
 * over to the map, once.
 *
 * Skipping this would cost whoever already has a model a fresh download of it —
 * the file is still on disk, but nothing would point at it any more.
 */
function migrateLegacy(): void {
  const legacyPath = read(LEGACY_PATH_KEY);
  if (legacyPath === null) return;

  const filename = legacyPath.split('/').pop();
  if (filename) {
    const files = parseFiles();
    if (files[filename] === undefined) {
      files[filename] = legacyPath;
      remember(FILES_KEY, JSON.stringify(files));
    }
    if (read(LEGACY_USE_KEY) === 'true' && read(ACTIVE_KEY) === null) {
      remember(ACTIVE_KEY, legacyPath);
    }
  }

  remember(LEGACY_PATH_KEY, null);
  remember(LEGACY_USE_KEY, null);
}

function parseFiles(): Record<string, string> {
  const raw = read(FILES_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    // Anything that is not the shape this wrote is treated as nothing stored.
    // The cost is a re-download; trusting it would be a crash on every launch.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === 'string',
      ) as Array<[string, string]>,
    );
  } catch {
    return {};
  }
}

/** Every model on disk, as filename → path. */
export function downloadedModels(): Record<string, string> {
  migrateLegacy();
  return parseFiles();
}

/** Where this model is on disk, or null if it was never downloaded. */
export function downloadedPathFor(filename: string): string | null {
  return downloadedModels()[filename] ?? null;
}

/**
 * Models whose download was interrupted and left partial state behind.
 *
 * Tracked so the button can say "Resume" rather than offering the whole
 * download again — the native side keeps iOS's resume data beside the file, so
 * a second attempt continues rather than restarting. Self-correcting either
 * way: a success clears the mark, and resume data the system will not accept
 * simply starts the download over.
 */
const INTERRUPTED_KEY = 'localModelInterrupted';

function interruptedSet(): Set<string> {
  const raw = read(INTERRUPTED_KEY);
  if (raw === null) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Whether a previous attempt at this model stopped partway. */
export function wasInterrupted(filename: string): boolean {
  return interruptedSet().has(filename);
}

function setInterrupted(filename: string, interrupted: boolean): void {
  const set = interruptedSet();
  if (interrupted) set.add(filename);
  else set.delete(filename);
  remember(INTERRUPTED_KEY, set.size === 0 ? null : JSON.stringify([...set]));
}

/** The downloaded model that answers, or null when the system one does. */
export function activeDownloadedPath(): string | null {
  migrateLegacy();
  const active = read(ACTIVE_KEY);
  if (active === null) return null;
  // A path that is no longer in the list is not selectable: the list is what
  // download writes, so an active path missing from it is stale state.
  return Object.values(parseFiles()).includes(active) ? active : null;
}

/** Whether a downloaded model is the one answering. */
export function usingDownloadedModel(): boolean {
  return activeDownloadedPath() !== null;
}

/** The name of the operating system's own model here, or null if there is none. */
export function systemModelName(): string | null {
  return SYSTEM_MODEL[Capacitor.getPlatform()] ?? null;
}

let selected: string | null = null;

/**
 * Points the plugin at whichever model should answer.
 *
 * A downloaded `.litertlm` bundle wins over the system model when one is
 * present. `modelType` is passed explicitly rather than inferred from the
 * extension, because the plugin only takes the LiteRT-LM path when told to, and
 * a silent fall-through to the system model would look like the download having
 * had no effect.
 *
 * Idempotent: selecting a model is setup, not per-request configuration, and
 * re-selecting a multi-gigabyte model on every word would be ruinous.
 */
async function ensureModelSelected(): Promise<void> {
  const downloaded = activeDownloadedPath();
  const path = downloaded ?? systemModelName();
  if (!path) throw new LocalModelUnavailableError('No on-device model on this platform.');
  if (selected === path) return;

  await CapgoLLM.setModel(downloaded ? { path, modelType: 'litertlm' } : { path });
  selected = path;
}

export interface ModelDownload {
  /** Direct link to a `.litertlm` bundle. */
  url: string;
  filename: string;
  onProgress?: (percent: number) => void;
}

/**
 * Fetches a custom model and switches to it.
 *
 * The plugin links the LiteRT-LM runtime unconditionally, so this needs no
 * native change — but that is a claim about the package manifest, not about any
 * particular build, and the first call is what actually settles it. A runtime
 * that is not there fails here rather than silently answering from the system
 * model.
 *
 * Only ever called deliberately: this is gigabytes over the network, so it
 * belongs behind an explicit action and never on a timer or a launch (REQ-15).
 */
export async function downloadModel({
  url,
  filename,
  onProgress,
}: ModelDownload): Promise<string> {
  if (!localModelSupported()) {
    throw new LocalModelUnavailableError('No on-device model on this platform.');
  }

  const handle = onProgress
    ? await CapgoLLM.addListener('downloadProgress', (event) => onProgress(event.progress))
    : null;

  try {
    const { path } = await CapgoLLM.downloadModel({ url, filename });
    // Selected before it is remembered: a model that cannot be loaded is not
    // one to persist, and leaving the pointer unset keeps the system model.
    await CapgoLLM.setModel({ path, modelType: 'litertlm' });
    selected = path;
    const files = downloadedModels();
    files[filename] = path;
    remember(FILES_KEY, JSON.stringify(files));
    remember(ACTIVE_KEY, path);
    setInterrupted(filename, false);
    return path;
  } catch (error) {
    // Marked before rethrowing, so the next offer reads "Resume". Whether there
    // is really anything to resume from is the native side's business; the
    // worst case is a label that promises a saving the system declines to make.
    setInterrupted(filename, true);
    throw error;
  } finally {
    await handle?.remove().catch(() => undefined);
  }
}

/** Goes back to the operating system's model. Downloaded files are left alone. */
export async function selectSystemModel(): Promise<void> {
  remember(ACTIVE_KEY, null);
  selected = null;
  await ensureModelSelected();
}

/**
 * Switches to an already-downloaded model without fetching it again.
 *
 * The files stay in the documents directory whatever is chosen, so moving
 * between two downloaded models — or back from the system one — is a pointer
 * change rather than another two gigabytes.
 */
export async function selectDownloadedModel(filename: string): Promise<void> {
  const path = downloadedPathFor(filename);
  if (path === null) {
    throw new LocalModelUnavailableError(`${filename} has not been downloaded.`);
  }
  remember(ACTIVE_KEY, path);
  selected = null;
  await ensureModelSelected();
}

export class LocalModelUnavailableError extends Error {
  constructor(detail: string) {
    super(`The on-device model is unavailable: ${detail}`);
    this.name = 'LocalModelUnavailableError';
  }
}

export interface LocalPromptOptions {
  prompt: string;
  /** Called with each chunk as it arrives. Omit to simply await the whole text. */
  onChunk?: (text: string) => void;
  /** Abandons the request; the model keeps going but nothing is collected. */
  signal?: AbortSignal;
}

/**
 * Sends one prompt and resolves with the whole response.
 *
 * Every listener is filtered by chat id and removed in a finally, because the
 * plugin's events are global: a leaked listener from an abandoned request would
 * collect another request's tokens into the wrong answer.
 */
export async function promptLocalModel({
  prompt,
  onChunk,
  signal,
}: LocalPromptOptions): Promise<string> {
  const status = await localModelStatus();
  if (status.state !== 'ready') throw new LocalModelUnavailableError(status.detail);

  await ensureModelSelected();
  const { id: chatId } = await CapgoLLM.createChat();

  const removers: Array<() => Promise<void>> = [];
  let onAbort: (() => void) | undefined;

  try {
    return await new Promise<string>((resolve, reject) => {
      let text = '';

      void CapgoLLM.addListener('textFromAi', (event) => {
        if (event.chatId !== chatId) return;
        text += event.text;
        onChunk?.(event.text);
      }).then((handle) => removers.push(handle.remove));

      void CapgoLLM.addListener('aiFinished', (event) => {
        if (event.chatId !== chatId) return;
        resolve(text);
      }).then((handle) => removers.push(handle.remove));

      void CapgoLLM.addListener('generationError', (event) => {
        // A failure with no chat id is not tied to a session, so it belongs to
        // whatever is in flight — which here is this request.
        if (event.chatId !== undefined && event.chatId !== chatId) return;
        reject(new Error(event.error));
      }).then((handle) => removers.push(handle.remove));

      if (signal) {
        onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }

      CapgoLLM.sendMessage({ chatId, message: prompt }).catch(reject);
    });
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    await Promise.all(removers.map((remove) => remove().catch(() => undefined)));
  }
}
