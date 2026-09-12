import { describe, expect, it } from 'vitest';
import type { TrackId, Word, WordId } from '@/domain/types';
import { selectBatch } from './selectBatch';

const TRACK = 'msa' as TrackId;
const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function word(id: string, overrides: Partial<Word> = {}): Word {
  return {
    id: id as WordId,
    trackId: TRACK,
    surface: id,
    gloss: 'gloss',
    forms: null,
    partOfSpeech: null,
    seenCount: 4,
    unclearCount: 1,
    firstSeenAt: 0,
    lastSeenAt: NOW,
    lastMarkedAt: null,
    roundIds: [],
    srs: null,
    ...overrides,
  };
}

describe('selectBatch', () => {
  it('ranks by miss rate, then by raw flag count', () => {
    const words = [
      word('low', { seenCount: 10, unclearCount: 1 }),
      word('high', { seenCount: 10, unclearCount: 9 }),
      word('mid', { seenCount: 10, unclearCount: 5 }),
    ];

    expect(selectBatch(words, 3, 50).wordIds).toEqual(['high', 'mid', 'low']);
  });

  it('excludes words never seen, and words with no gloss to answer with', () => {
    const words = [
      word('ok'),
      word('unseen', { seenCount: 0 }),
      word('noGloss', { gloss: '' }),
      word('blankGloss', { gloss: '   ' }),
    ];

    expect(selectBatch(words, 10, 50).wordIds).toEqual(['ok']);
  });

  it('reports words met but untranslated rather than dropping them silently', () => {
    const words = [word('ok'), word('a', { gloss: '' }), word('b', { gloss: '' })];

    expect(selectBatch(words, 10, 50).untranslated).toBe(2);
  });

  it('flags an oversized request without refusing it (REQ-13, REQ-21)', () => {
    const selection = selectBatch([word('a')], 60, 50);

    expect(selection.oversized).toBe(true);
    expect(selection.wordIds).toEqual(['a']);
  });

  describe('marked-within window', () => {
    const recent = word('recent', { lastMarkedAt: NOW - 2 * DAY });
    const old = word('old', { lastMarkedAt: NOW - 30 * DAY });
    const never = word('never', { lastMarkedAt: null });

    it('keeps only words flagged inside the window', () => {
      const selection = selectBatch([recent, old, never], 10, 50, {
        markedSince: NOW - 7 * DAY,
      });

      expect(selection.wordIds).toEqual(['recent']);
    });

    it('takes the whole corpus when the window is null', () => {
      const selection = selectBatch([recent, old, never], 10, 50, { markedSince: null });

      expect(selection.wordIds.sort()).toEqual(['never', 'old', 'recent']);
    });

    // A record imported before the app tracked flag times has no date. Treating
    // that as "yes" would fill a deliberately narrow batch with the oldest
    // material in the corpus, which is the opposite of what was asked for.
    it('excludes a word whose flag date is unknown', () => {
      const selection = selectBatch([never], 10, 50, { markedSince: NOW - 365 * DAY });

      expect(selection.wordIds).toEqual([]);
    });

    it('counts untranslated words over the same window, not the whole corpus', () => {
      const words = [
        word('recentBlank', { gloss: '', lastMarkedAt: NOW - DAY }),
        word('oldBlank', { gloss: '', lastMarkedAt: NOW - 30 * DAY }),
      ];

      expect(selectBatch(words, 10, 50, { markedSince: NOW - 7 * DAY }).untranslated).toBe(1);
      expect(selectBatch(words, 10, 50).untranslated).toBe(2);
    });

    it('includes a word flagged exactly on the boundary', () => {
      const boundary = word('boundary', { lastMarkedAt: NOW - 7 * DAY });

      expect(selectBatch([boundary], 10, 50, { markedSince: NOW - 7 * DAY }).wordIds).toEqual([
        'boundary',
      ]);
    });
  });
});
