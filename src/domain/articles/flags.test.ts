import { describe, expect, it } from 'vitest';
import { modernStandardArabicProfile as profile } from '@/domain/languageProfile';
import type { Segment, TrackId, Word } from '@/domain/types';
import { planArticleFlag, type ArticleFlagState } from './flags';

const TRACK = 'msa' as TrackId;
const NOW = 1_700_000_000_000;
const LONG_AGO = NOW - 90 * 86_400_000;

// The first word repeats, which is the case that decides whether one word
// flagged at two places counts once or twice.
const SEGMENTS: Segment[] = [
  { text: 'الْكِتَابُ', gloss: 'the book', forms: null },
  { text: 'جَدِيدٌ', gloss: '', forms: null },
  { text: '.', gloss: null, forms: null },
  { text: 'الْكِتَابُ', gloss: 'the book', forms: null },
];

const BOOK = profile.normalize('الْكِتَابُ');
const EMPTY: ArticleFlagState = { flaggedIndices: [], priorMarks: {} };

function word(overrides: Partial<Word> = {}): Word {
  return {
    id: BOOK,
    trackId: TRACK,
    surface: 'الْكِتَابُ',
    gloss: 'the book',
    forms: null,
    partOfSpeech: null,
    seenCount: 4,
    unclearCount: 2,
    firstSeenAt: 1,
    lastSeenAt: 1,
    lastMarkedAt: LONG_AGO,
    roundIds: [],
    srs: null,
    ...overrides,
  };
}

function plan(
  index: number,
  flagged: boolean,
  state: ArticleFlagState,
  existing: Word | null,
  now = NOW,
) {
  return planArticleFlag({
    segments: SEGMENTS,
    index,
    flagged,
    state,
    word: existing,
    articleId: 'a1',
    trackId: TRACK,
    profile,
    now,
  });
}

describe('planArticleFlag', () => {
  it('marks a word without touching how often it has been seen', () => {
    const result = plan(0, true, EMPTY, word());

    expect(result?.word?.unclearCount).toBe(3);
    expect(result?.word?.lastMarkedAt).toBe(NOW);
    // ingestRoundWords owns seenCount and runs at Finish over the whole
    // article; counting the sighting here too would count it twice.
    expect(result?.word?.seenCount).toBe(4);
    expect(result?.state.flaggedIndices).toEqual([0]);
  });

  it('restores the exact previous values when a mark is taken back', () => {
    const before = word();
    const marked = plan(0, true, EMPTY, before)!;
    const undone = plan(0, false, marked.state, marked.word);

    expect(undone?.word?.unclearCount).toBe(before.unclearCount);
    // Not merely decremented: the previous mark date comes back, so a mistap
    // cannot leave the word sitting in "marked this week".
    expect(undone?.word?.lastMarkedAt).toBe(LONG_AGO);
    expect(undone?.state.flaggedIndices).toEqual([]);
    expect(undone?.state.priorMarks).toEqual({});
  });

  it('counts one increment however many occurrences are flagged', () => {
    const first = plan(0, true, EMPTY, word())!;
    const second = plan(3, true, first.state, first.word)!;

    expect(second.word?.unclearCount).toBe(3);
    expect(second.state.flaggedIndices).toEqual([0, 3]);
  });

  it('keeps the word marked while any occurrence still is', () => {
    const first = plan(0, true, EMPTY, word())!;
    const second = plan(3, true, first.state, first.word)!;
    const third = plan(0, false, second.state, second.word)!;

    expect(third.word?.unclearCount).toBe(3);
    expect(third.word?.lastMarkedAt).toBe(NOW);
    expect(third.state.flaggedIndices).toEqual([3]);
  });

  // Absolute writes, not increments: marks are now written on every tap, so a
  // repeated or duplicated call has to converge rather than accumulate.
  it('is idempotent when the same flag is applied twice', () => {
    const once = plan(0, true, EMPTY, word())!;
    const twice = plan(0, true, once.state, once.word, NOW + 1000)!;

    expect(twice.word?.unclearCount).toBe(3);
  });

  it('creates a row for a word met by being marked, at zero sightings', () => {
    const result = plan(1, true, EMPTY, null);

    expect(result?.word).toMatchObject({
      id: profile.normalize('جَدِيدٌ'),
      seenCount: 0,
      unclearCount: 1,
      lastMarkedAt: NOW,
      needsEnrichment: true,
    });
  });

  it('ignores punctuation, which is not vocabulary', () => {
    expect(plan(2, true, EMPTY, word())).toBeNull();
  });

  it('ignores an index that is not in the text', () => {
    expect(plan(99, true, EMPTY, word())).toBeNull();
  });

  it('changes no row when unmarking something this reading never marked', () => {
    const result = plan(0, false, EMPTY, word());

    expect(result?.word).toBeNull();
    expect(result?.state.flaggedIndices).toEqual([]);
  });

  it('does not mutate the state it was given', () => {
    const state: ArticleFlagState = { flaggedIndices: [3], priorMarks: {} };
    plan(0, true, state, word());

    expect(state.flaggedIndices).toEqual([3]);
    expect(state.priorMarks).toEqual({});
  });

  it('treats an absent lastMarkedAt as unknown rather than as now', () => {
    // Records written before the app stored mark dates come back without one.
    const legacy = { ...word(), lastMarkedAt: undefined } as unknown as Word;
    const marked = plan(0, true, EMPTY, legacy)!;
    const undone = plan(0, false, marked.state, marked.word);

    expect(undone?.word?.lastMarkedAt).toBeNull();
  });
});
