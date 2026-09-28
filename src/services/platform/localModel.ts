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
 * Where a downloaded model's path is remembered, so it survives a restart.
 *
 * Only the path: the file itself lives in the app's documents directory, put
 * there by the plugin. Losing this key costs the pointer, not the gigabytes —
 * re-downloading is wasteful but never wrong.
 */
const DOWNLOADED_MODEL_KEY = 'localModelPath';

/** The downloaded model in use, or null for the operating system's own. */
export function downloadedModelPath(): string | null {
  try {
    return localStorage.getItem(DOWNLOADED_MODEL_KEY);
  } catch {
    return null;
  }
}

function rememberDownloadedModel(path: string | null): void {
  try {
    if (path === null) localStorage.removeItem(DOWNLOADED_MODEL_KEY);
    else localStorage.setItem(DOWNLOADED_MODEL_KEY, path);
  } catch {
    // A model that cannot be remembered still works for this session.
  }
}

/** The model the next request will use, named for a human. */
export function activeModelName(): string {
  const downloaded = downloadedModelPath();
  if (downloaded) return downloaded.split('/').pop() ?? downloaded;
  return SYSTEM_MODEL[Capacitor.getPlatform()] ?? 'none';
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
  const downloaded = downloadedModelPath();
  const path = downloaded ?? SYSTEM_MODEL[Capacitor.getPlatform()];
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
    rememberDownloadedModel(path);
    return path;
  } finally {
    await handle?.remove().catch(() => undefined);
  }
}

/** Goes back to the operating system's model. The file is left on disk. */
export async function selectSystemModel(): Promise<void> {
  rememberDownloadedModel(null);
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
