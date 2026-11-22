import { describe, expect, it } from 'vitest';
import { articleToSegments } from '@/domain/articles/segment';
import { modernStandardArabicProfile as profile } from '@/domain/languageProfile';
import { PARAGRAPH_BREAK } from '@/domain/types';
import { paragraphsOf, passageArticle, plainSegments } from './passage';

const PARAGRAPHS = ['ذَهَبْتُ إِلَى السُّوقِ، وَاشْتَرَيْتُ خُبْزًا.', 'كَانَ الْجَوُّ (جَمِيلًا) جِدًّا!'];

const segment = (paragraphs: string[]) =>
  articleToSegments(passageArticle('r1', 'عُنْوَان', paragraphs), { profile, known: new Map() });

describe('passageArticle', () => {
  it('reads a round under an id of its own, outside the library', () => {
    expect(passageArticle('r_1', 'عُنْوَان', PARAGRAPHS).id).toBe('round:r_1');
  });
});

describe('paragraphsOf', () => {
  // Rounds store segments, so redefining one later rebuilds its text first; the
  // rebuilt text must segment back into the very same words and punctuation,
  // or the reader's flags would land on different words.
  it('rebuilds text that segments back into the same segments', () => {
    const original = segment(PARAGRAPHS);
    const rebuilt = segment(paragraphsOf(original.slice(original.findIndex((s) => s.text === 'ذَهَبْتُ'))));

    expect(rebuilt.map((s) => s.text)).toEqual(original.map((s) => s.text));
  });

  it('splits at paragraph breaks', () => {
    const paragraphs = paragraphsOf([
      { text: 'أ', gloss: '', forms: null },
      { text: PARAGRAPH_BREAK, gloss: null, forms: null },
      { text: 'ب', gloss: '', forms: null },
    ]);

    expect(paragraphs).toEqual(['أ', 'ب']);
  });
});

describe('plainSegments', () => {
  it('keeps only what a round stores', () => {
    expect(plainSegments([{ text: 'أ', gloss: 'g', forms: null, glossSource: 'corpus' } as never])).toEqual([
      { text: 'أ', gloss: 'g', forms: null },
    ]);
  });
});
