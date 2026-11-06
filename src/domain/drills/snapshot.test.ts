import { describe, expect, it } from 'vitest';
import { DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { Word, WordId } from '@/domain/types';
import { restoreDrill, snapshotOf, type DrillSnapshot } from './snapshot';

function word(id: string): Word {
  return {
    id: id as WordId,
    trackId: DEFAULT_TRACK_ID,
    surface: id,
    gloss: id,
    glossAr: null,
    forms: null,
    partOfSpeech: null,
    seenCount: 0,
    unclearCount: 0,
    firstSeenAt: 0,
    lastSeenAt: 0,
    lastMarkedAt: null,
    roundIds: [],
    srs: null,
  };
}

const words = [word('a'), word('b'), word('c')];
const deck = words.map((w) => ({ id: w.id, mode: 'flashcard' as const }));

function snapshot(partial: Partial<DrillSnapshot>): DrillSnapshot {
  return { session: deck, index: 0, results: [], carried: { known: 0, stillLearning: 0 }, resting: false, ...partial };
}

describe('restoreDrill', () => {
  it('puts a session back where it was left, against the words as they are now', () => {
    const restored = restoreDrill(
      snapshot({ index: 2, results: [{ id: 'a' as WordId, correct: true }, { id: 'b' as WordId, correct: false }] }),
      words,
    );

    expect(restored?.index).toBe(2);
    expect(restored?.session.map((e) => e.word)).toEqual(words);
    expect(restored?.results.map((r) => [r.word.id, r.correct])).toEqual([['a', true], ['b', false]]);
  });

  it('round-trips through snapshotOf', () => {
    const stored = snapshot({ index: 1, results: [{ id: 'a' as WordId, correct: false }], resting: true });
    const restored = restoreDrill(stored, words);

    expect(restored && snapshotOf(restored)).toEqual(stored);
  });

  it('keeps a finished session with misses, so the review is still offered', () => {
    const restored = restoreDrill(
      snapshot({ index: 3, results: deck.map((d, i) => ({ id: d.id, correct: i !== 1 })), resting: true }),
      words,
    );

    expect(restored?.index).toBe(3);
    expect(restored?.resting).toBe(false);
  });

  it('starts fresh after a pass where everything was recalled', () => {
    expect(
      restoreDrill(snapshot({ index: 3, results: deck.map((d) => ({ id: d.id, correct: true })) }), words),
    ).toBeNull();
  });

  it('starts fresh when the deck no longer has every word the session named', () => {
    expect(restoreDrill(snapshot({ index: 1 }), words.slice(0, 2))).toBeNull();
  });

  it('has nothing to restore without a snapshot', () => {
    expect(restoreDrill(null, words)).toBeNull();
    expect(restoreDrill(undefined, words)).toBeNull();
  });
});
