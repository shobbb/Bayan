import { describe, expect, it } from 'vitest';
import { untranslatedIds } from './enrichGlosses';
import { articleToSegments } from '@/domain/articles/segment';
import { modernStandardArabicProfile as profile } from '@/domain/languageProfile';
import { phraseId } from '@/domain/wordIdentity';
import type { Article } from '@/domain/articles/types';

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    level: 'elementary',
    series: 'languageofmedia',
    sourceUrl: 'https://learning.aljazeera.net/en/articles/pages/1',
    topics: ['culture'],
    difficulty: 3,
    wordCount: 3,
    titleAr: 'عُنْوَان',
    titleEn: 'A Title',
    vowelled: true,
    paragraphs: ['يُطْلَقُ عَلَيْهِ اسْمٌ.'],
    imageUrl: null,
    videoUrl: null,
    vocab: [],
    expressions: [{ term: 'يُطْلَقُ عَلَيْهِ', gloss: 'is called', forms: null }],
    ...overrides,
  };
}

describe('untranslatedIds', () => {
  it('keys a word by its normalized form', () => {
    const segments = articleToSegments(article({ paragraphs: ['غَرِيبٌ'], expressions: [] }), {
      profile,
      known: new Map(),
    });

    expect(untranslatedIds(segments, profile)).toEqual([profile.normalize('غَرِيبٌ')]);
  });

  // The point of keeping the publisher's boundaries in Arabic-only mode: the
  // phrase is offered to the definition pass as one unit, so one call defines
  // "is called" rather than three that define "is released upon him".
  it('offers a whole phrase under its own id, not its words separately', () => {
    const segments = articleToSegments(article(), {
      profile,
      known: new Map(),
      publisherLists: 'boundaries',
    });

    const ids = untranslatedIds(segments, profile);

    expect(ids).toContain(phraseId('يُطْلَقُ عَلَيْهِ', profile));
    expect(ids).not.toContain(profile.normalize('يُطْلَقُ'));
    expect(ids).not.toContain(profile.normalize('عَلَيْهِ'));
  });

  // The id the phrase is asked for under has to be the id it is looked up
  // under, or it would be bought again on every open.
  it('asks under the same id segmentation looks up', () => {
    const known = new Map([
      [phraseId('يُطْلَقُ عَلَيْهِ', profile), { gloss: 'يُسَمَّى بِهَذَا', forms: null }],
    ]);
    const segments = articleToSegments(article(), {
      profile,
      known,
      publisherLists: 'boundaries',
    });

    expect(untranslatedIds(segments, profile)).not.toContain(
      phraseId('يُطْلَقُ عَلَيْهِ', profile),
    );
  });

  it('does not offer a phrase the publisher already glossed in English mode', () => {
    const segments = articleToSegments(article(), { profile, known: new Map() });

    expect(untranslatedIds(segments, profile)).not.toContain(
      phraseId('يُطْلَقُ عَلَيْهِ', profile),
    );
  });
});
