import { describe, it, expect } from 'vitest';
import { buildSessionQueue, summarizeSession, MODE_ROTATION } from './session';
import { sm2Scheduler } from '@/domain/srs/scheduler';
import { selectBatch } from '@/domain/batch/selectBatch';
import type { SrsState, TrackId, Word, WordId } from '@/domain/types';

const TRACK = 'msa' as TrackId;
const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function word(id: string, overrides: Partial<Word> = {}): Word {
  return {
    id: id as WordId,
    trackId: TRACK,
    surface: id,
    gloss: `${id}-gloss`,
    forms: null,
    partOfSpeech: null,
    seenCount: 3,
    unclearCount: 1,
    firstSeenAt: 0,
    lastSeenAt: 0,
    roundIds: [],
    srs: null,
    ...overrides,
  };
}

const dueSrs: SrsState = { dueAt: NOW - DAY, intervalDays: 3, ease: 2.5, reps: 2, lapses: 0 };
const futureSrs: SrsState = { dueAt: NOW + DAY, intervalDays: 3, ease: 2.5, reps: 2, lapses: 0 };

describe('session queue', () => {
  it('combines the batch with due cards', () => {
    const words = [word('b1'), word('b2'), word('due', { srs: dueSrs })];
    const queue = buildSessionQueue({
      batchWordIds: ['b1', 'b2'] as WordId[],
      words,
      scheduler: sm2Scheduler,
      now: NOW,
    });

    expect(queue.map((entry) => entry.word.id).sort()).toEqual(['b1', 'b2', 'due']);
  });

  it('leaves out cards that are not due yet', () => {
    const words = [word('b1'), word('later', { srs: futureSrs })];
    const queue = buildSessionQueue({
      batchWordIds: ['b1'] as WordId[],
      words,
      scheduler: sm2Scheduler,
      now: NOW,
    });

    expect(queue.map((entry) => entry.word.id)).toEqual(['b1']);
  });

  it('never queues a word twice when it is both batched and due', () => {
    const words = [word('shared', { srs: dueSrs })];
    const queue = buildSessionQueue({
      batchWordIds: ['shared'] as WordId[],
      words,
      scheduler: sm2Scheduler,
      now: NOW,
    });

    expect(queue).toHaveLength(1);
  });

  it('interleaves rather than draining the batch first', () => {
    const words = [
      word('b1'),
      word('b2'),
      word('b3'),
      word('d1', { srs: dueSrs }),
      word('d2', { srs: dueSrs }),
    ];
    const queue = buildSessionQueue({
      batchWordIds: ['b1', 'b2', 'b3'] as WordId[],
      words,
      scheduler: sm2Scheduler,
      now: NOW,
    });

    expect(queue.map((entry) => entry.word.id)).toEqual(['b1', 'd1', 'b2', 'd2', 'b3']);
  });

  it('rotates modes so consecutive cards use different retrieval paths (§10)', () => {
    const words = Array.from({ length: 6 }, (_, i) => word(`w${i}`));
    const queue = buildSessionQueue({
      batchWordIds: words.map((w) => w.id),
      words,
      scheduler: sm2Scheduler,
      now: NOW,
    });

    expect(queue.map((entry) => entry.mode)).toEqual([...MODE_ROTATION, ...MODE_ROTATION]);
  });

  it('ignores batch ids that are no longer in the corpus', () => {
    const queue = buildSessionQueue({
      batchWordIds: ['missing'] as WordId[],
      words: [word('present')],
      scheduler: sm2Scheduler,
      now: NOW,
    });

    expect(queue).toEqual([]);
  });
});

describe('session summary (§10.5)', () => {
  it('counts correct answers and lists what was missed', () => {
    const summary = summarizeSession([
      { word: word('a'), correct: true },
      { word: word('b'), correct: false },
      { word: word('c'), correct: true },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.correct).toBe(2);
    expect(summary.missed.map((w) => w.id)).toEqual(['b']);
  });
});

describe('batch selection (§9)', () => {
  it('ranks by miss rate, then by flag count', () => {
    const words = [
      word('low', { seenCount: 10, unclearCount: 1 }), // 0.1
      word('high', { seenCount: 4, unclearCount: 3 }), // 0.75
      word('mid', { seenCount: 4, unclearCount: 2 }), // 0.5
    ];

    expect(selectBatch(words, 3, 50).wordIds).toEqual(['high', 'mid', 'low']);
  });

  it('breaks a miss-rate tie on the larger flag count', () => {
    const words = [
      word('fewer', { seenCount: 2, unclearCount: 1 }),
      word('more', { seenCount: 4, unclearCount: 2 }),
    ];

    expect(selectBatch(words, 2, 50).wordIds).toEqual(['more', 'fewer']);
  });

  it('takes only the requested size', () => {
    const words = Array.from({ length: 60 }, (_, i) =>
      word(`w${String(i).padStart(2, '0')}`, { seenCount: 10, unclearCount: i }),
    );

    expect(selectBatch(words, 40, 50).wordIds).toHaveLength(40);
  });

  it('excludes words never shown and words with no gloss', () => {
    const words = [
      word('unseen', { seenCount: 0, unclearCount: 0 }),
      word('unglossed', { gloss: '' }),
      word('usable'),
    ];

    expect(selectBatch(words, 40, 50).wordIds).toEqual(['usable']);
  });

  it('flags an oversized batch rather than refusing it (REQ-21)', () => {
    const words = [word('a')];

    expect(selectBatch(words, 40, 50).oversized).toBe(false);
    expect(selectBatch(words, 60, 50).oversized).toBe(true);
  });

  it('is stable for an unchanged corpus', () => {
    const words = [word('a'), word('b'), word('c')];

    expect(selectBatch(words, 3, 50).wordIds).toEqual(selectBatch(words, 3, 50).wordIds);
  });
});
