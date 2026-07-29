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
}

/**
 * Words that have actually been read are the only candidates: a word never
 * shown has no miss rate to rank on, and drilling it would be introducing
 * vocabulary rather than reinforcing it. Records without a gloss are excluded
 * too — an answer side has to exist (REQ-23).
 */
function candidates(words: readonly Word[]): Word[] {
  return words.filter((word) => word.seenCount > 0 && word.gloss.trim() !== '');
}

export function selectBatch(
  words: readonly Word[],
  size: number,
  warnAboveSize: number,
): BatchSelection {
  const ranked = candidates(words).sort(
    (a, b) =>
      missRate(b) - missRate(a) ||
      b.unclearCount - a.unclearCount ||
      // Deterministic final tie-break, so an unchanged corpus yields an
      // unchanged batch rather than reshuffling on every call.
      a.id.localeCompare(b.id),
  );

  return {
    wordIds: ranked.slice(0, size).map((word) => word.id),
    oversized: size > warnAboveSize,
  };
}
