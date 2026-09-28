/**
 * Which models are on the device, and which one answers.
 *
 * These are worth pinning because getting them wrong is expensive in a way most
 * bugs are not: a forgotten pointer does not lose a setting, it loses a file the
 * learner spent two gigabytes of someone's network on, and the app then offers
 * to fetch it again.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
    getPlatform: () => 'ios',
  },
}));
vi.mock('@capgo/capacitor-llm', () => ({ CapgoLLM: {} }));

const stat = vi.fn();
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { stat: (...args: unknown[]) => stat(...args) },
  Directory: { Documents: 'DOCUMENTS' },
}));

const {
  activeDownloadedPath,
  downloadedModels,
  downloadedPathFor,
  reconcileDownloadedModels,
  usingDownloadedModel,
  wasInterrupted,
} = await import('./localModel');

const GEMMA = '/var/app/Documents/gemma-4-E2B-it.litertlm';
const QWEN = '/var/app/Documents/qwen3_4b_mixed_int4.litertlm';

beforeEach(() => {
  localStorage.clear();
  stat.mockReset();
});

/** What Filesystem.stat returns for a file that is there. */
function present(uri: string, size = 2_400_000_000) {
  return { type: 'file', size, uri: `file://${uri}` };
}

describe('downloadedModels', () => {
  it('is empty before anything is downloaded', () => {
    expect(downloadedModels()).toEqual({});
    expect(usingDownloadedModel()).toBe(false);
  });

  it('holds more than one model at a time', () => {
    localStorage.setItem(
      'localModelFiles',
      JSON.stringify({ 'gemma-4-E2B-it.litertlm': GEMMA, 'qwen3_4b_mixed_int4.litertlm': QWEN }),
    );
    localStorage.setItem('localModelActive', QWEN);

    // The point of the map: downloading the second does not forget the first.
    expect(downloadedPathFor('gemma-4-E2B-it.litertlm')).toBe(GEMMA);
    expect(downloadedPathFor('qwen3_4b_mixed_int4.litertlm')).toBe(QWEN);
    expect(activeDownloadedPath()).toBe(QWEN);
  });

  it('treats a stored value that is not the shape it wrote as nothing stored', () => {
    // A re-download is the cost of not trusting this; a crash on every launch
    // is the cost of trusting it.
    localStorage.setItem('localModelFiles', '["not", "an", "object"]');
    expect(downloadedModels()).toEqual({});

    localStorage.setItem('localModelFiles', 'not json at all');
    expect(downloadedModels()).toEqual({});
  });

  it('ignores an active path that is not among the downloaded files', () => {
    localStorage.setItem('localModelFiles', JSON.stringify({ 'a.litertlm': '/docs/a.litertlm' }));
    localStorage.setItem('localModelActive', '/docs/gone.litertlm');

    expect(activeDownloadedPath()).toBeNull();
    expect(usingDownloadedModel()).toBe(false);
  });
});

describe('migration from the single-path keys', () => {
  // A device that downloaded Gemma under the old scheme still has the file. If
  // the new scheme cannot see it, that is a two-gigabyte re-download for nothing.
  it('carries a downloaded model over, and keeps it selected', () => {
    localStorage.setItem('localModelPath', GEMMA);
    localStorage.setItem('localModelUseDownloaded', 'true');

    expect(downloadedPathFor('gemma-4-E2B-it.litertlm')).toBe(GEMMA);
    expect(activeDownloadedPath()).toBe(GEMMA);
  });

  it('carries the file over without selecting it when it was not in use', () => {
    localStorage.setItem('localModelPath', GEMMA);

    expect(downloadedPathFor('gemma-4-E2B-it.litertlm')).toBe(GEMMA);
    expect(activeDownloadedPath()).toBeNull();
  });

  it('clears the old keys so it runs once', () => {
    localStorage.setItem('localModelPath', GEMMA);
    localStorage.setItem('localModelUseDownloaded', 'true');
    downloadedModels();

    expect(localStorage.getItem('localModelPath')).toBeNull();
    expect(localStorage.getItem('localModelUseDownloaded')).toBeNull();
  });

  // Migration must not undo a later choice — going back to the system model
  // writes no active path, and a stale legacy key would re-select the download.
  it('does not overwrite a newer choice', () => {
    localStorage.setItem(
      'localModelFiles',
      JSON.stringify({ 'gemma-4-E2B-it.litertlm': GEMMA }),
    );
    localStorage.setItem('localModelPath', GEMMA);
    localStorage.setItem('localModelUseDownloaded', 'true');
    localStorage.setItem('localModelActive', QWEN);

    // QWEN is not in the file list, so it resolves to null rather than to GEMMA:
    // the legacy key does not get to win.
    expect(activeDownloadedPath()).toBeNull();
  });
});

describe('interrupted downloads', () => {
  it('is false for a model never attempted', () => {
    expect(wasInterrupted('qwen3_4b_mixed_int4.litertlm')).toBe(false);
  });

  it('reads the marks the download path writes', () => {
    localStorage.setItem(
      'localModelInterrupted',
      JSON.stringify(['qwen3_4b_mixed_int4.litertlm']),
    );

    expect(wasInterrupted('qwen3_4b_mixed_int4.litertlm')).toBe(true);
    expect(wasInterrupted('gemma-4-E2B-it.litertlm')).toBe(false);
  });

  it('treats a malformed mark as nothing interrupted', () => {
    // The cost of not trusting it is a button that says "Download" instead of
    // "Resume". The cost of trusting it is a crash in Settings.
    localStorage.setItem('localModelInterrupted', '{"not":"an array"}');
    expect(wasInterrupted('anything.litertlm')).toBe(false);

    localStorage.setItem('localModelInterrupted', 'not json');
    expect(wasInterrupted('anything.litertlm')).toBe(false);
  });
});

describe('reconcileDownloadedModels', () => {
  const NAMES = ['gemma-4-E2B-it.litertlm', 'qwen3_4b_mixed_int4.litertlm'];

  it('records a model that arrived without the app seeing it finish', async () => {
    // A background download outliving the process is the case this exists for:
    // the file lands, the promise that would have recorded it is gone.
    stat.mockImplementation(({ path }: { path: string }) =>
      path === 'qwen3_4b_mixed_int4.litertlm'
        ? Promise.resolve(present(QWEN))
        : Promise.reject(new Error('does not exist')),
    );

    await reconcileDownloadedModels(NAMES);

    expect(downloadedPathFor('qwen3_4b_mixed_int4.litertlm')).toBe(QWEN);
    expect(downloadedPathFor('gemma-4-E2B-it.litertlm')).toBeNull();
  });

  it('forgets a model whose file is gone, and stops using it', async () => {
    localStorage.setItem('localModelFiles', JSON.stringify({ 'gemma-4-E2B-it.litertlm': GEMMA }));
    localStorage.setItem('localModelActive', GEMMA);
    stat.mockRejectedValue(new Error('does not exist'));

    await reconcileDownloadedModels(NAMES);

    expect(downloadedModels()).toEqual({});
    // Falls back to the system model rather than failing at the next definition.
    expect(activeDownloadedPath()).toBeNull();
  });

  it('does not count a zero-byte file as a downloaded model', async () => {
    // A download that began and never arrived. Selecting it would hand the
    // runtime a file it cannot load.
    stat.mockResolvedValue(present(QWEN, 0));

    await reconcileDownloadedModels(NAMES);

    expect(downloadedModels()).toEqual({});
  });

  it('leaves a correct record alone', async () => {
    localStorage.setItem('localModelFiles', JSON.stringify({ 'gemma-4-E2B-it.litertlm': GEMMA }));
    localStorage.setItem('localModelActive', GEMMA);
    stat.mockImplementation(({ path }: { path: string }) =>
      path === 'gemma-4-E2B-it.litertlm'
        ? Promise.resolve(present(GEMMA))
        : Promise.reject(new Error('does not exist')),
    );

    await reconcileDownloadedModels(NAMES);

    expect(downloadedPathFor('gemma-4-E2B-it.litertlm')).toBe(GEMMA);
    expect(activeDownloadedPath()).toBe(GEMMA);
  });
});
