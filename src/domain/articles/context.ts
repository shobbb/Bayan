/**
 * The sentence a word was met in, for the model that has to define it.
 *
 * Asked for a bare word, a small model has to recall what it means — and that
 * is the thing small models are worst at. It answered بَارْتِين, a Turkish town,
 * as "a separator between the days". Given the sentence it appears in — "the
 * women's market in the Turkish city of Bartın" — the same question stops being
 * recall and becomes reading, which is the thing small models are decent at.
 *
 * Bounded rather than whole-paragraph: context helps up to the point where the
 * model starts summarising the passage instead of defining the word, and a
 * small model's attention is the scarce resource being spent.
 */
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { Segment } from '@/domain/types';

/** Arabic full stop, question mark and exclamation, plus their ASCII twins. */
const SENTENCE_END = /[.!?؟۔]/;

/** Words either side of the target before the context is cut. */
const MAX_SPAN = 12;

function isBoundary(segment: Segment | undefined): boolean {
  if (segment === undefined) return true;
  if (segment.text === PARAGRAPH_BREAK) return true;
  // Punctuation is not tappable and carries a null gloss; only the
  // sentence-ending kind ends a sentence, so a comma keeps the clause together.
  return segment.gloss === null && SENTENCE_END.test(segment.text);
}

/**
 * The sentence around `index`, as plain text.
 *
 * Returns the word alone when it stands by itself — a headline of one word, or
 * a segment list that has drifted from the index it is being asked about. The
 * caller can then send no context rather than a misleading one.
 */
export function sentenceAround(segments: readonly Segment[], index: number): string {
  const target = segments[index];
  if (target === undefined) return '';

  let start = index;
  while (start > 0 && !isBoundary(segments[start - 1])) start -= 1;
  start = Math.max(start, index - MAX_SPAN);

  let end = index;
  while (end < segments.length - 1 && !isBoundary(segments[end + 1])) end += 1;
  end = Math.min(end, index + MAX_SPAN);

  return segments
    .slice(start, end + 1)
    .map((segment) => segment.text)
    .filter((text) => text !== PARAGRAPH_BREAK)
    .join(' ')
    .trim();
}

/**
 * The first sentence each word appears in, keyed the way the caller keys words.
 *
 * First occurrence rather than every occurrence: one context is what the prompt
 * has room for, and the first is the one the reader met.
 */
export function contextsByKey(
  segments: readonly Segment[],
  keyOf: (segment: Segment, index: number) => string | null,
): Map<string, string> {
  const out = new Map<string, string>();
  segments.forEach((segment, index) => {
    const key = keyOf(segment, index);
    if (key === null || out.has(key)) return;
    const sentence = sentenceAround(segments, index);
    if (sentence !== '' && sentence !== segment.text) out.set(key, sentence);
  });
  return out;
}
