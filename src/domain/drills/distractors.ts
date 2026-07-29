/**
 * Distractor selection for multiple choice (REQ-25).
 *
 * "Random distractors make items trivially solvable and produce meaningless
 * grading data", so candidates are ranked by adjacency to the target rather
 * than drawn uniformly:
 *
 *   1. same part of speech, and appeared in a round the target appeared in
 *   2. same part of speech
 *   3. appeared in a round the target appeared in
 *   4. anything else, as filler
 *
 * Co-occurrence is the strongest signal actually available here: two words in
 * the same generated passage share its topic and register. Part of speech is
 * often unknown on imported records, so tier 3 carries most of the weight on a
 * corpus that has not been enriched.
 */
import type { Word } from '@/domain/types';

function adjacencyTier(target: Word, candidate: Word, targetRounds: ReadonlySet<string>): number {
  const samePos =
    target.partOfSpeech !== null && candidate.partOfSpeech === target.partOfSpeech;
  const coOccurs = candidate.roundIds.some((id) => targetRounds.has(id));

  if (samePos && coOccurs) return 0;
  if (samePos) return 1;
  if (coOccurs) return 2;
  return 3;
}

/**
 * Returns up to `count` distinct glosses to sit alongside the target's own.
 * Glosses are de-duplicated against the target so an option can never be
 * quietly correct twice.
 */
export function pickDistractors(
  target: Word,
  corpus: readonly Word[],
  count: number,
  random: () => number,
): string[] {
  const targetRounds = new Set(target.roundIds);
  const takenGlosses = new Set([target.gloss.trim().toLowerCase()]);

  const candidates = corpus
    .filter((word) => word.id !== target.id && word.gloss.trim() !== '')
    .map((word) => ({ word, tier: adjacencyTier(target, word, targetRounds), key: random() }))
    // Sort by tier, then randomly within a tier so the same distractors do not
    // recur for a given word.
    .sort((a, b) => a.tier - b.tier || a.key - b.key);

  const chosen: string[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    const gloss = candidate.word.gloss.trim();
    const key = gloss.toLowerCase();
    if (takenGlosses.has(key)) continue;
    takenGlosses.add(key);
    chosen.push(gloss);
  }

  return chosen;
}

/** Fisher-Yates, so option order is randomized per presentation (REQ-40). */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i]!;
    const b = result[j]!;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
