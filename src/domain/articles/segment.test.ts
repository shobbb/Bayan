import { describe, expect, it } from 'vitest';
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { WordId } from '@/domain/types';
import { modernStandardArabicProfile as profile } from '@/domain/languageProfile';
import { articleToSegments, glossCoverage, indexGlosses } from './segment';
import type { Article } from './types';

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    level: 'elementary',
    series: 'languageofmedia',
    sourceUrl: 'https://learning.aljazeera.net/en/articles/pages/21968',
    titleAr: 'عُنْوَان',
    titleEn: 'A Title',
    vowelled: true,
    paragraphs: ['الْكِتَابُ جَدِيدٌ.'],
    imageUrl: null,
    hasVideo: false,
    vocab: [],
    expressions: [],
    ...overrides,
  };
}

const NO_CORPUS = { profile, known: new Map<WordId, { gloss: string; forms: string | null }>() };

function corpus(entries: Record<string, string>) {
  return {
    profile,
    known: new Map(
      Object.entries(entries).map(([surface, gloss]) => [
        profile.normalize(surface),
        { gloss, forms: null },
      ]),
    ),
  };
}

describe('articleToSegments', () => {
  it('splits punctuation into its own untappable segment', () => {
    const segments = articleToSegments(article(), NO_CORPUS);
    const dot = segments.at(-1)!;

    expect(dot.text).toBe('.');
    expect(dot.gloss).toBeNull();
  });

  it('separates paragraphs with the reader’s break sentinel', () => {
    const segments = articleToSegments(
      article({ paragraphs: ['كِتَاب', 'قَلَم'] }),
      NO_CORPUS,
    );

    expect(segments.map((s) => s.text)).toEqual(['كِتَاب', PARAGRAPH_BREAK, 'قَلَم']);
  });

  it('does not put a break before the first paragraph', () => {
    expect(articleToSegments(article(), NO_CORPUS)[0]!.text).not.toBe(PARAGRAPH_BREAK);
  });

  it('uses a publisher gloss where the publisher supplied one', () => {
    const segments = articleToSegments(
      article({ vocab: [{ term: 'الْكِتَابُ', gloss: 'the book', forms: null }] }),
      NO_CORPUS,
    );

    expect(segments[0]).toMatchObject({ gloss: 'the book', glossSource: 'publisher' });
  });

  it('matches a publisher term through normalization, not exact spelling', () => {
    // The publisher's list is vowelled differently from the body more often
    // than not, so an exact-string index would miss most entries.
    const segments = articleToSegments(
      article({ paragraphs: ['الكتاب جديد'], vocab: [{ term: 'كِتَاب', gloss: 'book', forms: null }] }),
      NO_CORPUS,
    );

    expect(segments[0]!.gloss).toBe('book');
  });

  it('keeps a multi-word expression as one tappable segment', () => {
    const segments = articleToSegments(
      article({
        paragraphs: ['عَلَى الرَّغْمِ مِنْ ذَلِكَ'],
        expressions: [{ term: 'عَلَى الرَّغْمِ مِنْ', gloss: 'despite', forms: null }],
      }),
      NO_CORPUS,
    );

    expect(segments[0]!.text).toBe('عَلَى الرَّغْمِ مِنْ');
    expect(segments[0]!.gloss).toBe('despite');
    expect(segments[1]!.text).toBe('ذَلِكَ');
  });

  it('prefers the longest phrase, so an idiom is not shadowed by its first word', () => {
    const segments = articleToSegments(
      article({
        paragraphs: ['عَلَى الرَّغْمِ مِنْ ذَلِكَ'],
        vocab: [{ term: 'عَلَى', gloss: 'on', forms: null }],
        expressions: [{ term: 'عَلَى الرَّغْمِ مِنْ', gloss: 'despite', forms: null }],
      }),
      NO_CORPUS,
    );

    expect(segments[0]!.gloss).toBe('despite');
  });

  it('never lets a phrase span punctuation', () => {
    const segments = articleToSegments(
      article({
        paragraphs: ['عَلَى، الرَّغْمِ مِنْ'],
        expressions: [{ term: 'عَلَى الرَّغْمِ مِنْ', gloss: 'despite', forms: null }],
      }),
      NO_CORPUS,
    );

    expect(segments[0]!.text).toBe('عَلَى');
    expect(segments[1]!.text).toBe('،');
  });

  it('falls back to the learner’s corpus when the publisher is silent', () => {
    const segments = articleToSegments(article(), corpus({ كتاب: 'book' }));

    expect(segments[0]).toMatchObject({ gloss: 'book', glossSource: 'corpus' });
  });

  it('lets an editorial gloss outrank the corpus', () => {
    const segments = articleToSegments(
      article({ vocab: [{ term: 'الْكِتَابُ', gloss: 'the volume', forms: null }] }),
      corpus({ كتاب: 'book' }),
    );

    expect(segments[0]!.gloss).toBe('the volume');
    expect(segments[0]!.glossSource).toBe('publisher');
  });

  it('carries the publisher’s forms note through', () => {
    const segments = articleToSegments(
      article({ vocab: [{ term: 'الْكِتَابُ', gloss: 'book', forms: 'كِتَاب / كُتُب' }] }),
      NO_CORPUS,
    );

    expect(segments[0]!.forms).toBe('كِتَاب / كُتُب');
  });

  // An unglossed Arabic word is still a word the learner has now seen. Giving
  // it an empty gloss rather than null keeps it tappable and — since ingestion
  // keys on gloss !== null — keeps it counted in the corpus.
  it('gives an unglossed Arabic word an empty gloss, not a null one', () => {
    const segments = articleToSegments(article({ paragraphs: ['غَرِيبٌ'] }), NO_CORPUS);

    expect(segments[0]!.gloss).toBe('');
    expect(segments[0]!.glossSource).toBeNull();
  });

  it('leaves Latin text and digits out of the corpus entirely', () => {
    const segments = articleToSegments(
      article({ paragraphs: ['كَأْسِ الْعَالَمِ 2018 فِي رُوسْيَا Reuters'] }),
      NO_CORPUS,
    );
    const byText = new Map(segments.map((s) => [s.text, s]));

    expect(byText.get('2018')!.gloss).toBeNull();
    expect(byText.get('Reuters')!.gloss).toBeNull();
    expect(byText.get('كَأْسِ')!.gloss).toBe('');
  });
});

describe('indexGlosses', () => {
  it('reports the longest phrase so the matcher knows how far to look', () => {
    const { maxWords } = indexGlosses(
      article({ expressions: [{ term: 'عَلَى الرَّغْمِ مِنْ', gloss: 'despite', forms: null }] }),
      profile,
    );

    expect(maxWords).toBe(3);
  });

  it('lets an expression win over a vocabulary entry on the same key', () => {
    const { byPhrase } = indexGlosses(
      article({
        vocab: [{ term: 'كِتَاب', gloss: 'book', forms: null }],
        expressions: [{ term: 'كِتَاب', gloss: 'a written work', forms: null }],
      }),
      profile,
    );

    expect(byPhrase.get(profile.normalize('كِتَاب'))!.gloss).toBe('a written work');
  });
});

describe('glossCoverage', () => {
  it('counts only words with a real translation', () => {
    const segments = articleToSegments(
      article({ paragraphs: ['الْكِتَابُ جَدِيدٌ'], vocab: [{ term: 'كِتَاب', gloss: 'book', forms: null }] }),
      NO_CORPUS,
    );

    expect(glossCoverage(segments)).toBe(0.5);
  });

  it('is zero for an article with nothing to show', () => {
    expect(glossCoverage(articleToSegments(article(), NO_CORPUS))).toBe(0);
  });
});
