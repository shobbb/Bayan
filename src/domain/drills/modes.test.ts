import { describe, it, expect } from 'vitest';
import { DRILL_MODES, getDrillMode, overrideAsCorrect } from './modes';
import { pickDistractors } from './distractors';
import { levenshtein } from './levenshtein';
import type { PrepareContext } from './types';
import type { PartOfSpeech, TrackId, Word, WordId } from '@/domain/types';

const TRACK = 'msa' as TrackId;

function word(id: string, gloss: string, overrides: Partial<Word> = {}): Word {
  return {
    id: id as WordId,
    trackId: TRACK,
    surface: id,
    gloss,
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

function ctx(overrides: Partial<PrepareContext> = {}): PrepareContext {
  return {
    corpus: [],
    sentences: {},
    maxLevenshteinDistance: 2,
    random: () => 0.5,
    ...overrides,
  };
}

describe('levenshtein', () => {
  it('measures edit distance', () => {
    expect(levenshtein('book', 'book')).toBe(0);
    expect(levenshtein('book', 'boook')).toBe(1);
    expect(levenshtein('book', 'bok')).toBe(1);
    expect(levenshtein('book', 'cook')).toBe(1);
    expect(levenshtein('book', '')).toBe(4);
  });
});

describe('flashcard mode', () => {
  const mode = getDrillMode('flashcard');

  it('passes the self-reported grade straight through (REQ-39)', () => {
    const item = mode.prepare(word('a', 'book'), ctx());

    expect(mode.grade('easy', item, ctx()).grade).toBe('easy');
    expect(mode.grade('hard', item, ctx()).grade).toBe('hard');
  });

  it('counts only "again" as not recalled', () => {
    const item = mode.prepare(word('a', 'book'), ctx());

    expect(mode.grade('again', item, ctx()).correct).toBe(false);
    expect(mode.grade('hard', item, ctx()).correct).toBe(true);
  });
});

describe('multiple choice mode', () => {
  const mode = getDrillMode('multipleChoice');
  const corpus = [
    word('a', 'book'),
    word('b', 'house'),
    word('c', 'pen'),
    word('d', 'school'),
    word('e', 'door'),
  ];

  it('offers four options including the correct gloss', () => {
    const item = mode.prepare(corpus[0]!, ctx({ corpus }));

    expect(item.options).toHaveLength(4);
    expect(item.options).toContain('book');
    expect(item.options[item.correctIndex]).toBe('book');
  });

  it('grades the correct index right and anything else wrong', () => {
    const item = mode.prepare(corpus[0]!, ctx({ corpus }));

    expect(mode.grade(item.correctIndex, item, ctx()).grade).toBe('good');
    const wrong = (item.correctIndex + 1) % item.options.length;
    expect(mode.grade(wrong, item, ctx()).correct).toBe(false);
  });

  it('varies the correct position across presentations (REQ-40)', () => {
    // A deterministic sequence still has to land the answer in different slots.
    let seed = 0;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const positions = new Set<number>();
    for (let i = 0; i < 30; i++) {
      positions.add(mode.prepare(corpus[0]!, ctx({ corpus, random })).correctIndex);
    }

    expect(positions.size).toBeGreaterThan(1);
  });

  it('never repeats the correct gloss as a distractor', () => {
    const duplicated = [word('a', 'book'), word('b', 'book'), word('c', 'house'), word('d', 'pen')];
    const item = mode.prepare(duplicated[0]!, ctx({ corpus: duplicated }));

    expect(item.options.filter((option) => option === 'book')).toHaveLength(1);
  });
});

describe('distractor adjacency (REQ-25)', () => {
  it('prefers words sharing a part of speech and a round', () => {
    const target = word('t', 'book', { partOfSpeech: 'noun', roundIds: ['r1'] });
    const corpus = [
      target,
      word('adjacent', 'notebook', { partOfSpeech: 'noun' as PartOfSpeech, roundIds: ['r1'] }),
      word('samePos', 'river', { partOfSpeech: 'noun' as PartOfSpeech, roundIds: ['r9'] }),
      word('unrelated', 'quickly', { partOfSpeech: 'particle' as PartOfSpeech, roundIds: ['r9'] }),
    ];

    expect(pickDistractors(target, corpus, 1, () => 0.5)).toEqual(['notebook']);
  });

  it('falls back to co-occurrence when part of speech is unknown', () => {
    // The imported corpus has no part-of-speech data, so this is the live path.
    const target = word('t', 'book', { roundIds: ['r1'] });
    const corpus = [
      target,
      word('together', 'shelf', { roundIds: ['r1'] }),
      word('apart', 'river', { roundIds: ['r9'] }),
    ];

    expect(pickDistractors(target, corpus, 1, () => 0.5)).toEqual(['shelf']);
  });

  it('skips words with no gloss to offer', () => {
    const target = word('t', 'book');
    const corpus = [target, word('blank', ''), word('usable', 'house')];

    expect(pickDistractors(target, corpus, 2, () => 0.5)).toEqual(['house']);
  });
});

describe('write-in mode', () => {
  const mode = getDrillMode('writeIn');

  it('accepts an exact answer', () => {
    const item = mode.prepare(word('a', 'book'), ctx());
    const outcome = mode.grade('book', item, ctx());

    expect(outcome.grade).toBe('good');
    expect(outcome.correct).toBe(true);
  });

  it('accepts any listed sense (REQ-26)', () => {
    const item = mode.prepare(word('a', 'book, written work'), ctx());

    expect(mode.grade('written work', item, ctx()).correct).toBe(true);
    expect(mode.grade('book', item, ctx()).correct).toBe(true);
  });

  it('credits a near miss but reports what was typed (REQ-41)', () => {
    const item = mode.prepare(word('a', 'book'), ctx());
    const outcome = mode.grade('boook', item, ctx());

    expect(outcome.correct).toBe(true);
    expect(outcome.acceptedAs).toBe('boook');
    // Credited, but not an exact recall.
    expect(outcome.grade).toBe('hard');
  });

  it('rejects an answer beyond the tolerance', () => {
    const item = mode.prepare(word('a', 'book'), ctx());
    const outcome = mode.grade('bicycle', item, ctx());

    expect(outcome.correct).toBe(false);
    expect(outcome.grade).toBe('again');
  });

  it('honours the configured tolerance rather than a hardcoded one', () => {
    const item = mode.prepare(word('a', 'book'), ctx());

    expect(mode.grade('boook', item, ctx({ maxLevenshteinDistance: 0 })).correct).toBe(false);
  });

  it('shows the canonical gloss either way (REQ-26)', () => {
    const item = mode.prepare(word('a', 'book'), ctx());

    expect(mode.grade('book', item, ctx()).canonical).toBe('book');
    expect(mode.grade('bicycle', item, ctx()).canonical).toBe('book');
  });

  it('treats an empty answer as not known', () => {
    const item = mode.prepare(word('a', 'book'), ctx());
    expect(mode.grade('   ', item, ctx()).correct).toBe(false);
  });

  it('lets the learner overrule a rejection (REQ-42)', () => {
    const item = mode.prepare(word('a', 'book'), ctx());
    const overridden = overrideAsCorrect(mode.grade('tome', item, ctx()));

    expect(overridden.correct).toBe(true);
    expect(overridden.grade).toBe('good');
  });
});

describe('drill registry', () => {
  it('registers exactly the three modes (REQ-E2)', () => {
    expect(Object.keys(DRILL_MODES).sort()).toEqual(['flashcard', 'multipleChoice', 'writeIn']);
  });

  it('attaches the batch example sentence to every mode', () => {
    const target = word('a', 'book');
    const withSentence = ctx({ sentences: { a: 'قَرَأْتُ الْكِتَاب.' } });

    for (const mode of Object.values(DRILL_MODES)) {
      expect(mode.prepare(target, withSentence).sentence).toBe('قَرَأْتُ الْكِتَاب.');
    }
  });
});
