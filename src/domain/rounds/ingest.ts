/**
 * Folding a generated round back into the corpus (§8, generation flow step 3):
 * "Persist Round, increment seenCount for every distinct word."
 *
 * Pure — it takes the existing words and returns the rows to write, so the
 * counting rules are testable without a database (§2.1).
 */
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { LanguageProfile, Segment, TrackId, Word, WordId } from '@/domain/types';

/** Segments that carry vocabulary: not punctuation, not a paragraph break. */
export function glossedSegments(segments: readonly Segment[]): Segment[] {
  return segments.filter(
    (segment) => segment.gloss !== null && segment.text !== PARAGRAPH_BREAK,
  );
}

/**
 * Distinct forms in a round, counted after normalization — the same figure the
 * flag rate is measured against (§12.1), so a word repeated three times in one
 * passage counts once.
 */
export function countDistinctForms(
  segments: readonly Segment[],
  profile: LanguageProfile,
): number {
  const ids = new Set<WordId>();
  for (const segment of glossedSegments(segments)) ids.add(profile.normalize(segment.text));
  return ids.size;
}

/**
 * Returns the Word rows to upsert after a round is read. A word seen for the
 * first time is created; one seen again has seenCount incremented once for the
 * round, regardless of how many times it appears in the text.
 *
 * unclearCount is deliberately untouched here — it is driven by the reader's
 * "didn't know" flag, not by exposure.
 */
export function ingestRoundWords(
  segments: readonly Segment[],
  existing: readonly Word[],
  roundId: string,
  trackId: TrackId,
  profile: LanguageProfile,
  now: number,
): Word[] {
  const byId = new Map<WordId, Word>(existing.map((word) => [word.id, word]));
  const touched = new Map<WordId, Word>();

  for (const segment of glossedSegments(segments)) {
    const id = profile.normalize(segment.text);
    if (touched.has(id)) continue; // one increment per round, not per occurrence

    const current = byId.get(id);
    if (current) {
      touched.set(id, {
        ...current,
        surface: segment.text, // the vowelled form as last displayed
        gloss: current.gloss || (segment.gloss ?? ''),
        forms: current.forms ?? segment.forms,
        seenCount: current.seenCount + 1,
        lastSeenAt: now,
        roundIds: current.roundIds.includes(roundId)
          ? current.roundIds
          : [...current.roundIds, roundId],
        needsEnrichment: (current.gloss || segment.gloss) ? undefined : true,
      });
    } else {
      touched.set(id, {
        id,
        trackId,
        surface: segment.text,
        gloss: segment.gloss ?? '',
        forms: segment.forms,
        partOfSpeech: null,
        seenCount: 1,
        unclearCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        // Exposure, not a miss. Flagging is what sets this, in finishRound and
        // finishArticle — the same place unclearCount moves.
        lastMarkedAt: null,
        roundIds: [roundId],
        srs: null,
      });
    }
  }

  return [...touched.values()];
}
