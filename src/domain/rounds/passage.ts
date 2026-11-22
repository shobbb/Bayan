/**
 * A generated round's passage in the shape the article machinery reads.
 *
 * A round is written as plain vowelled paragraphs and then segmented and
 * defined exactly as an article is — the same tokenizer, the same lookups
 * (pre-written definitions, the learner's own words, earlier definitions), the
 * same pass for whatever is left. Passing it through as an Article is what
 * lets one path serve both, rather than a second copy of it for rounds.
 */
import type { Article } from '@/domain/articles/types';
import { PARAGRAPH_BREAK, type Segment } from '@/domain/types';

export function passageArticle(id: string, titleAr: string, paragraphs: readonly string[]): Article {
  return {
    id: `round:${id}`,
    level: '',
    series: 'other',
    sourceUrl: '',
    topics: [],
    difficulty: null,
    wordCount: null,
    titleAr,
    titleEn: null,
    vowelled: true,
    paragraphs: [...paragraphs],
    imageUrl: null,
    videoUrl: null,
    vocab: [],
    expressions: [],
  };
}

/**
 * A stored round's paragraphs, rebuilt from its segments.
 *
 * Rounds store segments, not text. Spacing need not be exact: segmentation
 * splits punctuation from words on its own, so the rebuilt text segments back
 * into the same words.
 */
export function paragraphsOf(segments: readonly Segment[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const segment of segments) {
    if (segment.text === PARAGRAPH_BREAK) {
      if (current.length > 0) paragraphs.push(current.join(' '));
      current = [];
    } else {
      current.push(segment.text);
    }
  }
  if (current.length > 0) paragraphs.push(current.join(' '));
  return paragraphs;
}

/** Only the fields a round stores: segmentation adds where each gloss came from. */
export function plainSegments(segments: readonly Segment[]): Segment[] {
  return segments.map(({ text, gloss, forms }) => ({ text, gloss, forms }));
}
