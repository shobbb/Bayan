import { describe, it, expect } from 'vitest';
import { drawWords, missRate, scoreWord, staleness, type WordDrawContext } from './wordDraw';
import type { TrackId, Word, WordId } from '@/domain/types';

const TRACK = 'msa' as TrackId;

function word(id: string, overrides: Partial<Word> = {}): Word {
  return {
    id: id as WordId,
    trackId: TRACK,
    surface: id,
    gloss: id,
    forms: null,
    partOfSpeech: 'noun',
    seenCount: 1,
    unclearCount: 0,
    firstSeenAt: 0,
    lastSeenAt: 0,
    lastMarkedAt: null,
    roundIds: [],
    srs: null,
    ...overrides,
  };
}

const WEIGHTS = { missRateWeight: 1.0, underSampledWeight: 0.5, stalenessWeight: 0.4 };

function context(overrides: Partial<WordDrawContext> = {}): WordDrawContext {
  return {
    roundIndexById: new Map(),
    currentRoundIndex: 0,
    random: () => 0,
    ...overrides,
  };
}

describe('word draw', () => {
  it('computes miss rate and treats an unseen word as untested, not failing', () => {
    expect(missRate(word('a', { seenCount: 4, unclearCount: 1 }))).toBe(0.25);
    expect(missRate(word('b', { seenCount: 0, unclearCount: 0 }))).toBe(0);
  });

  // Ten words in the seeded corpus carry more flags than sightings. Left
  // unclamped they outrank words genuinely missed every time, and Stats
  // rendered them as "150%".
  it('caps miss rate at 1 when a record holds more flags than sightings', () => {
    expect(missRate(word('a', { seenCount: 2, unclearCount: 3 }))).toBe(1);
    expect(missRate(word('b', { seenCount: 1, unclearCount: 2 }))).toBe(1);
  });

  it('does not let an over-flagged word outrank one missed every time', () => {
    const ctx = context({});
    const overFlagged = word('a', { seenCount: 2, unclearCount: 3 });
    const alwaysMissed = word('b', { seenCount: 2, unclearCount: 2 });

    expect(scoreWord(overFlagged, WEIGHTS, ctx)).toBe(scoreWord(alwaysMissed, WEIGHTS, ctx));
  });

  it('keeps early vocabulary in rotation via the staleness term (REQ-34)', () => {
    const ctx = context({
      roundIndexById: new Map([
        ['r0', 0],
        ['r9', 9],
      ]),
      currentRoundIndex: 10,
    });

    const early = word('early', { roundIds: ['r0'] });
    const recent = word('recent', { roundIds: ['r9'] });

    expect(staleness(early, ctx)).toBeGreaterThan(staleness(recent, ctx));
    expect(scoreWord(early, WEIGHTS, ctx)).toBeGreaterThan(scoreWord(recent, WEIGHTS, ctx));
  });

  it('scores a never-shown word as maximally stale', () => {
    const ctx = context({ currentRoundIndex: 10 });
    expect(staleness(word('never'), ctx)).toBe(1);
  });

  it('treats weights as injectable parameters, not literals (REQ-35)', () => {
    const ctx = context({ currentRoundIndex: 0 });
    const missed = word('missed', { seenCount: 4, unclearCount: 4 });

    const weighted = scoreWord(missed, { ...WEIGHTS, missRateWeight: 10 }, ctx);
    const unweighted = scoreWord(missed, { ...WEIGHTS, missRateWeight: 0 }, ctx);

    expect(weighted).toBeGreaterThan(unweighted);
  });

  it('favours words seen fewer times', () => {
    const ctx = context();
    const fresh = word('fresh', { seenCount: 0 });
    const familiar = word('familiar', { seenCount: 25 });

    expect(scoreWord(fresh, WEIGHTS, ctx)).toBeGreaterThan(scoreWord(familiar, WEIGHTS, ctx));
  });

  it('samples without replacement and never exceeds the pool', () => {
    const pool = [word('a'), word('b'), word('c')];
    const drawn = drawWords(pool, 10, WEIGHTS, context({ random: () => 0.5 }));

    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
  });

  it('returns the requested sample size when the pool is larger', () => {
    const pool = Array.from({ length: 20 }, (_, i) => word(`w${i}`));
    expect(drawWords(pool, 15, WEIGHTS, context({ random: () => 0.5 }))).toHaveLength(15);
  });

  it('still draws a full set when every weight is zero', () => {
    const zero = { missRateWeight: 0, underSampledWeight: 0, stalenessWeight: 0 };
    const pool = [word('a'), word('b'), word('c')];

    expect(drawWords(pool, 2, zero, context({ random: () => 0.5 }))).toHaveLength(2);
  });

  it('returns an empty draw for an empty pool', () => {
    expect(drawWords([], 15, WEIGHTS, context())).toEqual([]);
  });
});
