import { describe, expect, it } from 'vitest';
import type { SrsState, TrackId, Word, WordId } from '@/domain/types';
import { activeScheduler } from '@/domain/srs/scheduler';
import {
  STUDY_SOURCES,
  getStudySource,
  orderBySpacing,
  recentlyMarkedWords,
  studySourceCounts,
  type StudySourceContext,
} from './studySources';

const TRACK = 'msa' as TrackId;
const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function srs(dueAt: number): SrsState {
  return { dueAt, intervalDays: 3, ease: 2.5, reps: 2, lapses: 0 };
}

function word(id: string, overrides: Partial<Word> = {}): Word {
  return {
    id: id as WordId,
    trackId: TRACK,
    surface: id,
    gloss: 'gloss',
    forms: null,
    partOfSpeech: null,
    seenCount: 3,
    unclearCount: 1,
    firstSeenAt: 0,
    lastSeenAt: NOW,
    lastMarkedAt: null,
    roundIds: [],
    srs: null,
    ...overrides,
  };
}

function ctx(words: Word[], overrides: Partial<StudySourceContext> = {}): StudySourceContext {
  return {
    words,
    batchWordIds: [],
    scheduler: activeScheduler,
    now: NOW,
    markedWithinDays: 7,
    ...overrides,
  };
}

describe('recentlyMarkedWords', () => {
  it('keeps words flagged inside the window', () => {
    const words = [
      word('recent', { lastMarkedAt: NOW - 2 * DAY }),
      word('old', { lastMarkedAt: NOW - 30 * DAY }),
    ];

    expect(recentlyMarkedWords(ctx(words)).map((w) => w.id)).toEqual(['recent']);
  });

  // Every record written before the app stored flag dates has none. "Was this
  // marked this week" has no yes to give for a date nobody recorded.
  it('excludes a word whose flag date is unknown', () => {
    expect(recentlyMarkedWords(ctx([word('never', { lastMarkedAt: null })]))).toEqual([]);
  });

  it('excludes a flagged word with no gloss, since it cannot be a card (REQ-23)', () => {
    const words = [word('blank', { gloss: '', lastMarkedAt: NOW - DAY })];

    expect(recentlyMarkedWords(ctx(words))).toEqual([]);
  });

  it('widens with the configured window', () => {
    const words = [word('old', { lastMarkedAt: NOW - 30 * DAY })];

    expect(recentlyMarkedWords(ctx(words, { markedWithinDays: 60 })).map((w) => w.id)).toEqual([
      'old',
    ]);
  });
});

describe('orderBySpacing', () => {
  it('puts overdue first, then never drilled, then not yet due', () => {
    const words = [
      word('future', { srs: srs(NOW + 5 * DAY) }),
      word('fresh', { srs: null }),
      word('overdue', { srs: srs(NOW - 5 * DAY) }),
    ];

    expect(orderBySpacing(words, activeScheduler, NOW).map((w) => w.id)).toEqual([
      'overdue',
      'fresh',
      'future',
    ]);
  });

  it('leads with the most overdue card, as the one closest to being forgotten', () => {
    const words = [
      word('slightly', { srs: srs(NOW - DAY) }),
      word('badly', { srs: srs(NOW - 40 * DAY) }),
    ];

    expect(orderBySpacing(words, activeScheduler, NOW).map((w) => w.id)).toEqual([
      'badly',
      'slightly',
    ]);
  });

  it('leads the never-drilled group with the most-missed word', () => {
    const words = [
      word('easy', { srs: null, seenCount: 10, unclearCount: 1 }),
      word('hard', { srs: null, seenCount: 10, unclearCount: 9 }),
    ];

    expect(orderBySpacing(words, activeScheduler, NOW).map((w) => w.id)).toEqual(['hard', 'easy']);
  });

  it('orders not-yet-due cards soonest first', () => {
    const words = [word('later', { srs: srs(NOW + 9 * DAY) }), word('soon', { srs: srs(NOW + DAY) })];

    expect(orderBySpacing(words, activeScheduler, NOW).map((w) => w.id)).toEqual(['soon', 'later']);
  });

  it('is deterministic, so an unchanged corpus gives an unchanged session', () => {
    const words = [word('b', { srs: null }), word('a', { srs: null })];
    const once = orderBySpacing(words, activeScheduler, NOW).map((w) => w.id);

    expect(orderBySpacing(words, activeScheduler, NOW).map((w) => w.id)).toEqual(once);
    expect(once).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const words = [word('b', { srs: srs(NOW + DAY) }), word('a', { srs: srs(NOW - DAY) })];
    orderBySpacing(words, activeScheduler, NOW);

    expect(words.map((w) => w.id)).toEqual(['b', 'a']);
  });
});

describe('study sources', () => {
  it('offers exactly the two sources, batch first', () => {
    expect(STUDY_SOURCES.map((source) => source.id)).toEqual(['lastBatch', 'recentlyMarked']);
  });

  it('names the window it is actually using', () => {
    expect(getStudySource('recentlyMarked').hint(ctx([], { markedWithinDays: 14 }))).toContain(
      '14 days',
    );
  });

  it('builds the batch source from the batch plus anything due', () => {
    const words = [
      word('inBatch'),
      word('due', { srs: srs(NOW - DAY) }),
      word('neither', { srs: srs(NOW + 30 * DAY) }),
    ];
    const queue = getStudySource('lastBatch').build(
      ctx(words, { batchWordIds: ['inBatch' as WordId] }),
    );

    expect(queue.map((entry) => entry.word.id).sort()).toEqual(['due', 'inBatch']);
  });

  // Choosing this source is a statement about what to study. Folding the whole
  // due pile back in would make the choice meaningless.
  it('does not pull due cards into the recently-marked source', () => {
    const words = [
      word('marked', { lastMarkedAt: NOW - DAY }),
      word('dueButOld', { srs: srs(NOW - DAY), lastMarkedAt: NOW - 90 * DAY }),
    ];
    const queue = getStudySource('recentlyMarked').build(ctx(words));

    expect(queue.map((entry) => entry.word.id)).toEqual(['marked']);
  });

  it('spaces the recently-marked source rather than leaving corpus order', () => {
    const words = [
      word('a', { lastMarkedAt: NOW - DAY, srs: srs(NOW + 10 * DAY) }),
      word('b', { lastMarkedAt: NOW - DAY, srs: srs(NOW - 10 * DAY) }),
    ];
    const queue = getStudySource('recentlyMarked').build(ctx(words));

    expect(queue.map((entry) => entry.word.id)).toEqual(['b', 'a']);
  });

  it('rotates retrieval modes across whichever source was chosen', () => {
    const words = ['a', 'b', 'c', 'd'].map((id) => word(id, { lastMarkedAt: NOW - DAY }));
    const queue = getStudySource('recentlyMarked').build(ctx(words));

    expect(queue.map((entry) => entry.mode)).toEqual([
      'flashcard',
      'multipleChoice',
      'writeIn',
      'flashcard',
    ]);
  });

  it('counts both sources for the chooser', () => {
    const words = [
      word('inBatch'),
      word('marked', { lastMarkedAt: NOW - DAY }),
      word('idle', { srs: srs(NOW + 30 * DAY) }),
    ];

    expect(studySourceCounts(ctx(words, { batchWordIds: ['inBatch' as WordId] }))).toEqual({
      lastBatch: 1,
      recentlyMarked: 1,
    });
  });

  it('rejects an unknown source rather than silently studying something else', () => {
    // @ts-expect-error deliberately outside the union
    expect(() => getStudySource('whatever')).toThrow(/Unknown study source/);
  });
});
