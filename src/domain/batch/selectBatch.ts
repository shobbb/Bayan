/**
 * Batch selection (§9).
 *
 * "Rank words by unclearCount / seenCount, tie-break on unclearCount. Take 40."
 * Triggered only by the Generate-new-batch action (REQ-20); nothing here runs
 * on a schedule or as a side effect of reading.
 */
import type { Word, WordId } from '@/domain/types';
import { missRate } from '@/domain/selector/wordDraw';

export interface BatchSelection {
  wordIds: WordId[];
  /** True when the requested size exceeds the fatigue threshold (REQ-21). */
  oversized: boolean;
  /**
   * Words that rank for a batch but cannot be drilled because they have no
   * gloss. Reported rather than silently dropped: these are words the reader
   * met and flagged, and "nothing to drill" is a misleading thing to say about
   * a corpus full of them (REQ-23 forbids the card, not the knowledge of it).
   */
  untranslated: number;
}

export interface BatchOptions {
  /**
   * Keep only words flagged at or after this timestamp. Null takes the whole
   * corpus, which is the default.
   *
   * A word flagged before the app recorded flag times has a null lastMarkedAt
   * and is excluded by any window: the honest answer to "was this marked in the
   * last week" is unknown, and treating unknown as yes would fill a
   * deliberately narrow batch with the oldest records in the corpus.
   */
  markedSince?: number | null;
}

/**
 * Whether this word was flagged at or after the given moment.
 *
 * The loose null check is deliberate: a record written before the app tracked
 * flag dates comes back from storage with the field absent, so it is undefined
 * rather than null. Either way the date is unknown and the word is out — the
 * honest answer to "was this marked in the last week" is not yes.
 */
function isMarkedSince(word: Word, since: number): boolean {
  return word.lastMarkedAt != null && word.lastMarkedAt >= since;
}

/** Whether a word is drillable at all: met, and with an answer side (REQ-23). */
function isDrillable(word: Word): boolean {
  return word.seenCount > 0 && word.gloss.trim() !== '';
}

/**
 * Words that have actually been read are the only candidates: a word never
 * shown has no miss rate to rank on, and drilling it would be introducing
 * vocabulary rather than reinforcing it.
 */
function candidates(words: readonly Word[], markedSince: number | null): Word[] {
  return words.filter(
    (word) =>
      isDrillable(word) &&
      (markedSince === null || isMarkedSince(word, markedSince)),
  );
}

export function selectBatch(
  words: readonly Word[],
  size: number,
  warnAboveSize: number,
  options: BatchOptions = {},
): BatchSelection {
  const markedSince = options.markedSince ?? null;

  const ranked = candidates(words, markedSince).sort(
    (a, b) =>
      missRate(b) - missRate(a) ||
      b.unclearCount - a.unclearCount ||
      // Deterministic final tie-break, so an unchanged corpus yields an
      // unchanged batch rather than reshuffling on every call.
      a.id.localeCompare(b.id),
  );

  // Counted over the same window, so the figure explains this batch rather than
  // the corpus at large.
  const untranslated = words.filter(
    (word) =>
      word.seenCount > 0 &&
      word.gloss.trim() === '' &&
      (markedSince === null || isMarkedSince(word, markedSince)),
  ).length;

  return {
    wordIds: ranked.slice(0, size).map((word) => word.id),
    oversized: size > warnAboveSize,
    untranslated,
  };
}
