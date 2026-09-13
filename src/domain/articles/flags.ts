/**
 * What marking a word "didn't know" in an article does to the corpus.
 *
 * Pure, and deliberately so: this is the rule, not the writing of it. The
 * service hands in what it read and writes back what this returns (§2.1), which
 * keeps the counting rules testable without a database — the same reason
 * domain/rounds/ingest.ts owns seenCount.
 *
 * Writes are absolute, never relative. Each word's pre-reading values are
 * captured once, and every result sets unclearCount to that base plus one, or
 * back to the base. A double tap, a re-render or a repeated call therefore
 * converges on the same value rather than counting again — which a bare
 * increment could not promise once marks are written on every tap.
 */
import type { LanguageProfile, Segment, TrackId, Word, WordId } from '@/domain/types';

/** A word's mark state before this reading touched it. */
export interface PriorMark {
  unclearCount: number;
  lastMarkedAt: number | null;
}

/** Per-article progress, as the reading holds it. */
export interface ArticleFlagState {
  flaggedIndices: readonly number[];
  priorMarks: Readonly<Record<string, PriorMark>>;
}

export interface FlagPlan {
  /** The row to write, or null when nothing about the corpus changes. */
  word: Word | null;
  /** The progress to store alongside it. */
  state: ArticleFlagState;
}

/** The word a segment belongs to, or null when it is not vocabulary. */
export function wordIdAt(
  segments: readonly Segment[],
  index: number,
  profile: LanguageProfile,
): WordId | null {
  const segment = segments[index];
  if (!segment || segment.gloss === null) return null;
  return profile.normalize(segment.text);
}

export interface PlanFlagOptions {
  segments: readonly Segment[];
  index: number;
  flagged: boolean;
  state: ArticleFlagState;
  /** The existing row, or null when this word has never been met. */
  word: Word | null;
  articleId: string;
  trackId: TrackId;
  profile: LanguageProfile;
  now: number;
}

/**
 * Applies one flag toggle.
 *
 * Returns null when the tap changes nothing — punctuation, which is not
 * vocabulary, or unflagging a word this reading never flagged.
 */
export function planArticleFlag(options: PlanFlagOptions): FlagPlan | null {
  const { segments, index, flagged, state, word, articleId, trackId, profile, now } = options;

  const id = wordIdAt(segments, index, profile);
  if (id === null) return null;

  const indices = new Set(state.flaggedIndices);
  if (flagged) indices.add(index);
  else indices.delete(index);

  // One word can appear many times. It stays marked while any occurrence is,
  // and one increment covers the whole reading either way.
  const stillFlagged = [...indices].some(
    (other) => wordIdAt(segments, other, profile) === id,
  );

  const priorMarks: Record<string, PriorMark> = { ...state.priorMarks };
  const segment = segments[index];
  let next: Word | null = null;

  if (stillFlagged) {
    const base: PriorMark =
      priorMarks[id] ??
      (word
        ? { unclearCount: word.unclearCount, lastMarkedAt: word.lastMarkedAt ?? null }
        : { unclearCount: 0, lastMarkedAt: null });
    priorMarks[id] = base;

    next = word
      ? { ...word, unclearCount: base.unclearCount + 1, lastMarkedAt: now, lastSeenAt: now }
      : {
          // Marked before the article was finished, so no row exists yet. It is
          // created at seenCount 0 and reaches 1 when ingestion runs at Finish;
          // counting the sighting here as well would count it twice.
          id,
          trackId,
          surface: segment?.text ?? id,
          gloss: segment?.gloss ?? '',
          forms: segment?.forms ?? null,
          partOfSpeech: null,
          seenCount: 0,
          unclearCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          lastMarkedAt: now,
          roundIds: [articleId],
          srs: null,
          ...(segment?.gloss ? {} : { needsEnrichment: true as const }),
        };
  } else {
    const base = priorMarks[id];
    delete priorMarks[id];
    // Restores the values rather than decrementing: nothing can reconstruct the
    // previous lastMarkedAt, and leaving it at the time of a mistap would put
    // the word in "marked this week" on the strength of a tap that was undone.
    if (word && base) {
      next = { ...word, unclearCount: base.unclearCount, lastMarkedAt: base.lastMarkedAt };
    }
  }

  return {
    word: next,
    state: { flaggedIndices: [...indices].sort((a, b) => a - b), priorMarks },
  };
}
