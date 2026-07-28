/**
 * Applies a planned import (REQ-3: repositories are the only IndexedDB
 * callers). Holds no merge rules — those live in domain/interchange.
 */
import { db } from './db';
import type { Round, TrackId, Word } from '@/domain/types';

export interface ImportWriteSet {
  words: Word[];
  rounds: Round[];
}

/**
 * One transaction over both tables: REQ-I8 prohibits partial writes, so either
 * the whole set lands or none of it does. `replace` clears the track first.
 */
export async function applyImport(
  set: ImportWriteSet,
  trackId: TrackId,
  replace = false,
): Promise<void> {
  await db.transaction('rw', db.words, db.rounds, async () => {
    if (replace) {
      await db.words.where('trackId').equals(trackId).delete();
      await db.rounds.where('trackId').equals(trackId).delete();
    }
    await db.words.bulkPut(set.words);
    await db.rounds.bulkPut(set.rounds);
  });
}

export async function isCorpusEmpty(trackId: TrackId): Promise<boolean> {
  const [words, rounds] = await Promise.all([
    db.words.where('trackId').equals(trackId).count(),
    db.rounds.where('trackId').equals(trackId).count(),
  ]);
  return words === 0 && rounds === 0;
}
