/**
 * Puts a saved backup back when the app opens with nothing in it.
 *
 * The app used to fill an empty install from one person's bundled history.
 * That is wrong for anyone else, so an empty install now starts empty — unless
 * this device has a backup that Save file left in the app's Documents folder,
 * which means the app's storage was lost and the reader's own data is right
 * there to bring back.
 *
 * Only ever runs on an empty corpus, so it can never overwrite real usage.
 */
import { isCorpusEmpty } from '@/data/interchangeRepository';
import { DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import { readLatestSavedBackup } from '@/services/platform/files';
import { importFromJson } from './importState';

export type RestoreOutcome =
  | { status: 'skipped' }
  | { status: 'nothingSaved' }
  | { status: 'restored'; file: string; words: number; rounds: number }
  | { status: 'failed'; file: string; reason: string };

export async function restoreSavedBackupIfEmpty(): Promise<RestoreOutcome> {
  if (!(await isCorpusEmpty(DEFAULT_TRACK_ID))) return { status: 'skipped' };

  const saved = await readLatestSavedBackup();
  if (!saved) return { status: 'nothingSaved' };

  try {
    const report = await importFromJson(saved.contents, 'merge');
    return { status: 'restored', file: saved.name, words: report.totalWords, rounds: report.roundsAdded };
  } catch (error) {
    return {
      status: 'failed',
      file: saved.name,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** What to tell the reader, if anything. Silence for the ordinary cases. */
export function describeRestore(outcome: RestoreOutcome): string | null {
  if (outcome.status === 'restored') {
    return `Restored ${outcome.words} words and ${outcome.rounds} rounds from your saved backup, ${outcome.file}.`;
  }
  if (outcome.status === 'failed') {
    return `Could not restore your saved backup ${outcome.file}: ${outcome.reason}. Import it from Settings.`;
  }
  return null;
}
