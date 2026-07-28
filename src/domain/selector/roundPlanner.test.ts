import { describe, it, expect } from 'vitest';
import { planRound, roundFlagRate, topicObservations } from './roundPlanner';
import { ROUND_TYPE_STRATEGIES, getRoundTypeStrategy } from './roundTypes';
import type { SelectionContext } from './roundTypes/types';
import { DEFAULT_ALGORITHM_CONFIG } from '@/config/algorithm';
import { modernStandardArabicProfile } from '@/domain/languageProfile';
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { Round, RoundType, Segment, TrackId, Word } from '@/domain/types';

const TRACK = 'msa' as TrackId;
const CATEGORIES = { topics: ['travel', 'food', 'science'], formats: ['dialogue', 'article'] };

function word(surface: string, overrides: Partial<Word> = {}): Word {
  return {
    id: modernStandardArabicProfile.normalize(surface),
    trackId: TRACK,
    surface,
    gloss: 'gloss',
    forms: null,
    partOfSpeech: 'noun',
    seenCount: 1,
    unclearCount: 0,
    firstSeenAt: 0,
    lastSeenAt: 0,
    roundIds: [],
    srs: null,
    ...overrides,
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
    segments: [],
    distinctForms: 10,
    flagCount: 2,
    createdAt: 0,
    ...overrides,
  };
}

function context(overrides: Partial<SelectionContext> = {}): SelectionContext {
  const rounds = overrides.rounds ?? [];
  return {
    words: [],
    rounds,
    previousRound: rounds[rounds.length - 1] ?? null,
    algorithm: DEFAULT_ALGORITHM_CONFIG,
    profile: modernStandardArabicProfile,
    random: () => 0,
    ...overrides,
  };
}

describe('round flag rate', () => {
  it('is the share of distinct forms flagged', () => {
    expect(roundFlagRate(round('r1', { distinctForms: 10, flagCount: 3 }))).toBe(0.3);
  });

  it('is null for a round with nothing recorded yet (REQ-32)', () => {
    expect(roundFlagRate(round('r1', { distinctForms: 0, flagCount: 0 }))).toBeNull();
    expect(topicObservations([round('r1', { distinctForms: 0 })])[0]!.reward).toBeNull();
  });
});

describe('round type registry', () => {
  it('registers exactly the four round types (REQ-E2)', () => {
    const ids: RoundType[] = ['explore', 'reinforcement', 'pureReinforcement', 'backlog'];
    expect(Object.keys(ROUND_TYPE_STRATEGIES).sort()).toEqual([...ids].sort());

    for (const id of ids) {
      expect(getRoundTypeStrategy(id).id).toBe(id);
      expect(getRoundTypeStrategy(id).promptDirectives().length).toBeGreaterThan(0);
    }
  });
});

describe('planRound', () => {
  it('takes the round type as given and never infers it (REQ-33)', () => {
    for (const roundType of ['explore', 'reinforcement', 'pureReinforcement', 'backlog'] as const) {
      const plan = planRound(roundType, CATEGORIES, context());
      expect(plan.roundType).toBe(roundType);
      expect(CATEGORIES.topics).toContain(plan.topic);
      expect(CATEGORIES.formats).toContain(plan.format);
    }
  });

  it('excludes the previous round topic for reinforcement (REQ-36)', () => {
    const rounds = [round('r1', { topic: 'travel' })];
    const plan = planRound('reinforcement', CATEGORIES, context({ rounds }));

    expect(plan.topic).not.toBe('travel');
    expect(plan.excludeTopics).toEqual(['travel']);
  });

  it('does not exclude topics for explore', () => {
    const rounds = [round('r1', { topic: 'travel' })];
    expect(planRound('explore', CATEGORIES, context({ rounds })).excludeTopics).toEqual([]);
  });

  it('keeps the topic list non-empty when only one topic is configured', () => {
    const single = { topics: ['travel'], formats: ['dialogue'] };
    const rounds = [round('r1', { topic: 'travel' })];
    const plan = planRound('reinforcement', single, context({ rounds }));

    expect(plan.topic).toBe('travel');
  });

  it('restricts backlog targets to never-seen words', () => {
    const words = [word('كتاب', { seenCount: 0 }), word('بيت', { seenCount: 5 })];
    const plan = planRound('backlog', CATEGORIES, context({ words }));

    expect(plan.targetWordIds).toEqual([words[0]!.id]);
  });

  it('restricts pure reinforcement targets to known words', () => {
    const words = [word('كتاب', { seenCount: 0 }), word('بيت', { seenCount: 5 })];
    const plan = planRound('pureReinforcement', CATEGORIES, context({ words }));

    expect(plan.targetWordIds).toEqual([words[1]!.id]);
  });

  it('prefers drilled words for reinforcement, falling back to seen words', () => {
    const drilled = word('بيت', {
      seenCount: 5,
      srs: { dueAt: 0, intervalDays: 1, ease: 2.5, reps: 1, lapses: 0 },
    });
    const seenOnly = word('كتاب', { seenCount: 3 });

    const withDrilled = planRound(
      'reinforcement',
      CATEGORIES,
      context({ words: [drilled, seenOnly] }),
    );
    expect(withDrilled.targetWordIds).toEqual([drilled.id]);

    const withoutDrilled = planRound('reinforcement', CATEGORIES, context({ words: [seenOnly] }));
    expect(withoutDrilled.targetWordIds).toEqual([seenOnly.id]);
  });
});

describe('pure reinforcement validation', () => {
  const strategy = getRoundTypeStrategy('pureReinforcement');

  function segment(text: string, gloss: string | null = 'gloss'): Segment {
    return { text, gloss, forms: null };
  }

  it('accepts a passage built only from known words', () => {
    const words = [word('بيت', { seenCount: 2 }), word('كتاب', { seenCount: 2 })];
    const segments = [segment('بَيْت'), segment('،', null), segment('كِتَاب')];

    expect(strategy.validate?.(segments, context({ words }))).toBeNull();
  });

  it('rejects a passage introducing unknown vocabulary', () => {
    const words = [word('بيت', { seenCount: 2 })];
    const segments = [segment('بَيْت'), segment('مَدْرَسَة')];

    const reason = strategy.validate?.(segments, context({ words }));
    expect(reason).toContain('مَدْرَسَة');
  });

  it('ignores punctuation and paragraph breaks', () => {
    const words = [word('بيت', { seenCount: 2 })];
    const segments = [segment('بَيْت'), segment(PARAGRAPH_BREAK, null), segment('.', null)];

    expect(strategy.validate?.(segments, context({ words }))).toBeNull();
  });
});
