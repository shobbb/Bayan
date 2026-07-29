/**
 * Word draw (§12.2). Scores the candidate pool and takes a weighted sample
 * without replacement:
 *
 *   score(w) = missRateWeight   * missRate(w)
 *            + underSampledWeight * (1 / sqrt(seenCount + 1))
 *            + stalenessWeight  * staleness(w)
 *
 *   missRate  = unclearCount / seenCount
 *   staleness = (currentRoundIndex - lastRoundIndex) / currentRoundIndex
 *
 * Weights arrive as arguments, never as literals in here (REQ-35) — they are
 * expected to be tuned.
 */
import type { Word, WordId } from '@/domain/types';

export interface WordDrawWeights {
  missRateWeight: number;
  underSampledWeight: number;
  stalenessWeight: number;
}

export interface WordDrawContext {
  /** Position of each round id in chronological order, oldest first. */
  roundIndexById: ReadonlyMap<string, number>;
  /** Total rounds so far; the denominator of the staleness term. */
  currentRoundIndex: number;
  random: () => number;
}

/**
 * Share of a word's sightings that were flagged unclear.
 *
 * Clamped to 1 because a proportion cannot exceed the whole. This is not
 * defensive padding: ten words in the seeded corpus carry more flags than
 * sightings — historical bookkeeping from the tooling the data came out of —
 * and without the clamp they score above every word that has genuinely been
 * missed every single time, taking priority in the draw they have not earned.
 * Stats showed the same words at "150%".
 *
 * The stored record keeps the original counts. Clamping here rather than on
 * import keeps the export a faithful round-trip of what came in (REQ-I1).
 */
export function missRate(word: Word): number {
  if (word.seenCount <= 0) return 0;
  return Math.min(1, word.unclearCount / word.seenCount);
}

/**
 * Rounds since this word last appeared, normalized to 0..1. A word that has
 * never appeared scores 1 (maximally stale).
 *
 * REQ-34: this term is required. Without it, early vocabulary silently exits
 * rotation and the app only ever measures recent material.
 */
export function staleness(word: Word, ctx: WordDrawContext): number {
  if (ctx.currentRoundIndex <= 0) return 0;

  let lastRoundIndex = 0;
  for (const roundId of word.roundIds) {
    const index = ctx.roundIndexById.get(roundId);
    if (index !== undefined && index > lastRoundIndex) lastRoundIndex = index;
  }

  const value = (ctx.currentRoundIndex - lastRoundIndex) / ctx.currentRoundIndex;
  return Math.min(1, Math.max(0, value));
}

export function scoreWord(word: Word, weights: WordDrawWeights, ctx: WordDrawContext): number {
  const underSampled = 1 / Math.sqrt(word.seenCount + 1);
  return (
    weights.missRateWeight * missRate(word) +
    weights.underSampledWeight * underSampled +
    weights.stalenessWeight * staleness(word, ctx)
  );
}

/**
 * Weighted sample without replacement. Falls back to a uniform pick among the
 * remainder when every remaining weight is zero, so a cold corpus still draws
 * a full set rather than returning short.
 */
export function drawWords(
  pool: readonly Word[],
  sampleSize: number,
  weights: WordDrawWeights,
  ctx: WordDrawContext,
): WordId[] {
  const remaining = pool.map((word) => ({
    word,
    weight: Math.max(0, scoreWord(word, weights, ctx)),
  }));

  const drawn: WordId[] = [];
  const target = Math.min(sampleSize, remaining.length);

  while (drawn.length < target) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0);

    let index: number;
    if (total <= 0) {
      index = Math.floor(ctx.random() * remaining.length);
    } else {
      let threshold = ctx.random() * total;
      index = remaining.length - 1;
      for (let i = 0; i < remaining.length; i++) {
        const entry = remaining[i];
        if (!entry) continue;
        threshold -= entry.weight;
        if (threshold <= 0) {
          index = i;
          break;
        }
      }
    }

    index = Math.min(remaining.length - 1, Math.max(0, index));
    const picked = remaining[index];
    if (!picked) break;
    drawn.push(picked.word.id);
    remaining.splice(index, 1);
  }

  return drawn;
}
