import { describe, it, expect } from 'vitest';
import {
  acquisitionRate,
  filterByStatus,
  performanceByRoundType,
  performanceByTopic,
  sortBreakdown,
  statusCounts,
  summarize,
  toBreakdownRows,
  toHistory,
  wordStatus,
} from './metrics';
import type { Round, TrackId, Word, WordId } from '@/domain/types';

const TRACK = 'msa' as TrackId;

function word(id: string, seenCount: number, unclearCount: number, extra: Partial<Word> = {}): Word {
  return {
    id: id as WordId,
    trackId: TRACK,
    surface: id,
    gloss: `${id}-gloss`,
    forms: null,
    partOfSpeech: 'noun',
    seenCount,
    unclearCount,
    firstSeenAt: 0,
    lastSeenAt: 0,
    lastMarkedAt: null,
    roundIds: [],
    srs: null,
    ...extra,
  };
}

function round(id: string, overrides: Partial<Round> = {}): Round {
  return {
    id,
    trackId: TRACK,
    titleAr: 'عنوان',
    titleEn: 'title',
    topic: 'travel',
    format: 'dialogue',
    roundType: 'explore',
    segments: [{ text: 'كتاب', gloss: 'book', forms: null }],
    distinctForms: 10,
    flagCount: 1,
    createdAt: 0,
    ...overrides,
  };
}

describe('word status buckets', () => {
  it('classifies each bucket from aggregate counts', () => {
    expect(wordStatus(word('a', 0, 0))).toBe('notYetShown');
    expect(wordStatus(word('b', 3, 0))).toBe('neverFlagged');
    expect(wordStatus(word('c', 1, 1))).toBe('flaggedOnceNeverReshown');
    expect(wordStatus(word('d', 4, 4))).toBe('stillFailing');
    expect(wordStatus(word('e', 4, 1))).toBe('flaggedThenPassed');
  });

  it('counts every word exactly once', () => {
    const counts = statusCounts([word('a', 0, 0), word('b', 3, 0), word('c', 4, 4)]);
    expect(counts.notYetShown).toBe(1);
    expect(counts.neverFlagged).toBe(1);
    expect(counts.stillFailing).toBe(1);
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(3);
  });
});

describe('acquisition rate (REQ-28)', () => {
  it('is passed / (passed + stillFailing)', () => {
    const words = [word('p1', 4, 1), word('p2', 5, 2), word('f1', 3, 3)];
    expect(acquisitionRate(words)).toBeCloseTo(2 / 3, 10);
  });

  it('excludes words seen once — untested, not failures', () => {
    const words = [word('passed', 4, 1), word('seenOnce', 1, 1)];
    expect(acquisitionRate(words)).toBe(1);
  });

  it('is null when nothing has been tested, rather than a misleading zero', () => {
    expect(acquisitionRate([word('a', 1, 1), word('b', 0, 0)])).toBeNull();
    expect(acquisitionRate([])).toBeNull();
  });
});

describe('summary', () => {
  it('reports forms tracked as a row count (REQ-29)', () => {
    const summary = summarize([word('a', 1, 0), word('b', 2, 0)], [round('r1')]);
    expect(summary.formsTracked).toBe(2);
    expect(summary.roundsCompleted).toBe(1);
  });
});

describe('word breakdown', () => {
  it('carries the same miss rate the selector uses (REQ-44)', () => {
    const rows = toBreakdownRows([word('a', 4, 1)]);
    expect(rows[0]!.missRate).toBe(0.25);
    expect(rows[0]!.gloss).toBe('a-gloss');
  });

  it('sorts by miss rate descending, with untested forms last (REQ-45)', () => {
    const rows = toBreakdownRows([
      word('tested-low', 4, 1), // 0.25
      word('untested', 1, 1), // 1.0 but seen once
      word('tested-high', 4, 3), // 0.75
    ]);

    expect(sortBreakdown(rows).map((r) => r.surface)).toEqual([
      'tested-high',
      'tested-low',
      'untested',
    ]);
  });

  it('sorts by seen count and last seen on request', () => {
    const rows = toBreakdownRows([
      word('old', 5, 0, { lastSeenAt: 10 }),
      word('recent', 2, 0, { lastSeenAt: 99 }),
    ]);

    expect(sortBreakdown(rows, 'seenCount')[0]!.surface).toBe('old');
    expect(sortBreakdown(rows, 'lastSeen')[0]!.surface).toBe('recent');
  });

  it('filters by status bucket', () => {
    const rows = toBreakdownRows([word('a', 3, 0), word('b', 4, 4)]);
    expect(filterByStatus(rows, 'stillFailing').map((r) => r.surface)).toEqual(['b']);
    expect(filterByStatus(rows, 'all')).toHaveLength(2);
  });
});

describe('category performance', () => {
  it('averages flag rate per key and surfaces sample size', () => {
    const rounds = [
      round('r1', { topic: 'travel', distinctForms: 10, flagCount: 2 }),
      round('r2', { topic: 'travel', distinctForms: 10, flagCount: 4 }),
      round('r3', { topic: 'food', distinctForms: 10, flagCount: 1 }),
    ];

    const byTopic = performanceByTopic(rounds);
    const travel = byTopic.find((entry) => entry.key === 'travel');

    expect(travel?.flagRate).toBeCloseTo(0.3, 10);
    expect(travel?.sampleSize).toBe(2);
    expect(byTopic[0]!.key).toBe('travel'); // hardest first
  });

  it('counts a round with no recorded outcome toward sample size only', () => {
    const rounds = [round('r1', { topic: 'travel', distinctForms: 0, flagCount: 0 })];
    const travel = performanceByTopic(rounds)[0]!;

    expect(travel.sampleSize).toBe(1);
    expect(travel.flagRate).toBeNull();
  });

  it('groups by round type as well', () => {
    const rounds = [round('r1', { roundType: 'backlog' }), round('r2', { roundType: 'explore' })];
    expect(performanceByRoundType(rounds).map((e) => e.key).sort()).toEqual(['backlog', 'explore']);
  });
});

describe('history', () => {
  it('lists rounds most recent first with flag rate', () => {
    const rounds = [round('old', { createdAt: 1 }), round('new', { createdAt: 2 })];
    const history = toHistory(rounds);

    expect(history.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(history[0]!.flagRate).toBeCloseTo(0.1, 10);
  });

  it('marks history-only rounds as not replayable (REQ-I6)', () => {
    const history = toHistory([round('imported', { segments: [] })]);
    expect(history[0]!.replayable).toBe(false);
  });
});
