import { beforeEach, describe, expect, it, vi } from 'vitest';

const isCorpusEmpty = vi.fn();
const readLatestSavedBackup = vi.fn();
const importFromJson = vi.fn();
vi.mock('@/data/interchangeRepository', () => ({ isCorpusEmpty: () => isCorpusEmpty() }));
vi.mock('@/services/platform/files', () => ({ readLatestSavedBackup: () => readLatestSavedBackup() }));
vi.mock('./importState', () => ({ importFromJson: (...args: unknown[]) => importFromJson(...args) }));

const { describeRestore, restoreSavedBackupIfEmpty } = await import('./restoreOnLaunch');

describe('restoreSavedBackupIfEmpty', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never touches a device that already has data', async () => {
    isCorpusEmpty.mockResolvedValue(false);

    expect(await restoreSavedBackupIfEmpty()).toEqual({ status: 'skipped' });
    expect(readLatestSavedBackup).not.toHaveBeenCalled();
    expect(importFromJson).not.toHaveBeenCalled();
  });

  it('starts a fresh install empty when there is no saved backup', async () => {
    isCorpusEmpty.mockResolvedValue(true);
    readLatestSavedBackup.mockResolvedValue(null);

    const outcome = await restoreSavedBackupIfEmpty();

    expect(outcome).toEqual({ status: 'nothingSaved' });
    expect(importFromJson).not.toHaveBeenCalled();
    expect(describeRestore(outcome)).toBeNull();
  });

  it('puts the newest saved backup back into an empty app', async () => {
    isCorpusEmpty.mockResolvedValue(true);
    readLatestSavedBackup.mockResolvedValue({ name: 'bayan-state-2026-11-11.json', contents: '{}' });
    importFromJson.mockResolvedValue({ totalWords: 1782, roundsAdded: 30 });

    const outcome = await restoreSavedBackupIfEmpty();

    expect(importFromJson).toHaveBeenCalledWith('{}', 'merge');
    expect(outcome).toEqual({ status: 'restored', file: 'bayan-state-2026-11-11.json', words: 1782, rounds: 30 });
    expect(describeRestore(outcome)).toMatch(/Restored 1782 words and 30 rounds/);
  });

  it('reports a backup it could not read instead of failing the launch', async () => {
    isCorpusEmpty.mockResolvedValue(true);
    readLatestSavedBackup.mockResolvedValue({ name: 'broken.json', contents: 'nope' });
    importFromJson.mockRejectedValue(new Error('not valid JSON'));

    const outcome = await restoreSavedBackupIfEmpty();

    expect(outcome).toEqual({ status: 'failed', file: 'broken.json', reason: 'not valid JSON' });
    expect(describeRestore(outcome)).toMatch(/Import it from Settings/);
  });
});
