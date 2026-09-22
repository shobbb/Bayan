/**
 * Folding a generated round back into the corpus (§8, generation flow step 3):
 * "Persist Round, increment seenCount for every distinct word."
 *
 * Pure — it takes the existing words and returns the rows to write, so the
 * counting rules are testable without a database (§2.1).
 */
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { LanguageProfile, Segment, TrackId, Word, WordId } from '@/domain/types';
import { glossFieldFor, type GlossLanguage } from '@/domain/glossLanguage';
import { phraseId } from '@/domain/wordIdentity';

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
  for (const segment of glossedSegments(segments)) ids.add(phraseId(segment.text, profile));
  return ids.size;
}

/**
 * Returns the Word rows to upsert after a round is read. A word seen for the
 * first time is created; one seen again has seenCount incremented once for the
 * round, regardless of how many times it appears in the text.
 *
 * unclearCount is deliberately untouched here — it is driven by the reader's
 * "didn't know" flag, not by exposure.
 *
 * `language` says what language the segments' glosses are in, and so which of
 * the word's two definition fields they belong in (§13). Getting this wrong is
 * the one way the Arabic-only setting could destroy something: an Arabic
 * definition written into `gloss` would overwrite an English one that was never
 * asked about and cannot be recovered. The two fields are filled separately and
 * neither is ever read as the other.
 */
export function ingestRoundWords(
  segments: readonly Segment[],
  existing: readonly Word[],
  roundId: string,
  trackId: TrackId,
  profile: LanguageProfile,
  now: number,
  language: GlossLanguage = 'english',
): Word[] {
  const byId = new Map<WordId, Word>(existing.map((word) => [word.id, word]));
  const touched = new Map<WordId, Word>();
  const field = glossFieldFor(language);

  for (const segment of glossedSegments(segments)) {
    const id = phraseId(segment.text, profile);
    if (touched.has(id)) continue; // one increment per round, not per occurrence

    const incoming = segment.gloss ?? '';
    const current = byId.get(id);
    if (current) {
      // Only the field this round's glosses were written in is touched, and
      // only when it is empty — an existing definition is never overwritten.
      const held = (current[field] ?? '').trim();
      touched.set(id, {
        ...current,
        surface: segment.text, // the vowelled form as last displayed
        [field]: held || incoming,
        forms: current.forms ?? segment.forms,
        seenCount: current.seenCount + 1,
        lastSeenAt: now,
        roundIds: current.roundIds.includes(roundId)
          ? current.roundIds
          : [...current.roundIds, roundId],
        // needsEnrichment is the fill-missing-*English*-glosses hook (REQ-I5),
        // so it tracks `gloss` whichever language this round was read in.
        needsEnrichment:
          (field === 'gloss' ? held || incoming : current.gloss) ? undefined : true,
      });
    } else {
      touched.set(id, {
        id,
        trackId,
        surface: segment.text,
        gloss: field === 'gloss' ? incoming : '',
        glossAr: field === 'glossAr' ? incoming : null,
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
