import { describe, it, expect } from 'vitest';
import { parseStateExport } from './schema';
import { planImport } from './importPlan';
import { modernStandardArabicProfile } from '@/domain/languageProfile';
import type { TrackId, Word } from '@/domain/types';

const TRACK = 'msa' as TrackId;
const PROFILE = modernStandardArabicProfile;
const EMPTY = { words: [], rounds: [] };

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    exportedAt: 1,
    source: 'external',
    words: [],
    rounds: [],
    categories: { topics: [], formats: [] },
    config: null,
    ...overrides,
  };
}

function incomingWord(surface: string, extra: Record<string, unknown> = {}) {
  return {
    surface,
    gloss: 'gloss',
    forms: null,
    partOfSpeech: null,
    seenCount: 1,
    unclearCount: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    lastMarkedAt: null,
    roundIds: [],
    srs: null,
    ...extra,
  };
}

function incomingRound(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    titleAr: 'عنوان',
    titleEn: 'title',
    topic: 'social',
    format: 'dialogue',
    roundType: 'explore',
    distinctForms: 10,
    flagCount: 1,
    createdAt: null,
    segments: null,
    notes: null,
    ...extra,
  };
}

function parsed(input: unknown) {
  const result = parseStateExport(input);
  if (!result.ok) throw new Error(`unexpected parse failure: ${JSON.stringify(result.failures)}`);
  return result.value;
}

describe('interchange schema (REQ-I8)', () => {
  it('accepts kebab-case round types and normalizes them', () => {
    const value = parsed(
      payload({
        rounds: [
          incomingRound('a', { roundType: 'pure-reinforcement' }),
          incomingRound('b', { roundType: 'backlog-clearing' }),
        ],
      }),
    );

    expect(value.rounds.map((r) => r.roundType)).toEqual(['pureReinforcement', 'backlog']);
  });

  it('reports which record failed and why, importing nothing', () => {
    const result = parseStateExport(payload({ words: [incomingWord('كتاب', { seenCount: 'x' })] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0]!.path).toContain('words.0.seenCount');
    }
  });

  it('rejects an unknown schema version', () => {
    expect(parseStateExport(payload({ schemaVersion: 2 })).ok).toBe(false);
  });
});

describe('planImport', () => {
  it('collapses inflections of one lemma onto a normalized id (REQ-I3)', () => {
    const value = parsed(
      payload({
        words: [
          incomingWord('كِتَاب', { seenCount: 2, unclearCount: 1, roundIds: ['r1'] }),
          incomingWord('كتاب', { seenCount: 3, unclearCount: 2, roundIds: ['r2'] }),
        ],
      }),
    );

    const plan = planImport(value, EMPTY, PROFILE, TRACK);

    expect(plan.words).toHaveLength(1);
    expect(plan.report.wordsAdded).toBe(1);
    expect(plan.report.wordsMerged).toBe(1);
    expect(plan.words[0]!.seenCount).toBe(5);
    expect(plan.words[0]!.unclearCount).toBe(3);
    expect(plan.words[0]!.roundIds.sort()).toEqual(['r1', 'r2']);
  });

  it('keeps the longest gloss and the widest date range when merging', () => {
    const existing: Word[] = [
      {
        id: PROFILE.normalize('كتاب'),
        trackId: TRACK,
        surface: 'كتاب',
        gloss: 'book',
        forms: null,
        partOfSpeech: null,
        seenCount: 1,
        unclearCount: 0,
        firstSeenAt: 500,
        lastSeenAt: 500,
        lastMarkedAt: null,
        roundIds: [],
        srs: null,
      },
    ];

    const value = parsed(
      payload({
        words: [
          incomingWord('كتاب', {
            gloss: 'book, written work',
            firstSeenAt: 100,
            lastSeenAt: 900,
            lastMarkedAt: null,
          }),
        ],
      }),
    );

    const merged = planImport(value, { words: existing, rounds: [] }, PROFILE, TRACK).words[0]!;

    expect(merged.gloss).toBe('book, written work');
    expect(merged.firstSeenAt).toBe(100);
    expect(merged.lastSeenAt).toBe(900);
  });

  it('flags gloss-less records for enrichment without blocking import (REQ-I5)', () => {
    const value = parsed(payload({ words: [incomingWord('كتاب', { gloss: null })] }));
    const plan = planImport(value, EMPTY, PROFILE, TRACK);

    expect(plan.words[0]!.needsEnrichment).toBe(true);
    expect(plan.words[0]!.gloss).toBe('');
    expect(plan.report.needsEnrichment).toBe(1);
  });

  it('imports segment-less rounds as history only (REQ-I6)', () => {
    const value = parsed(payload({ rounds: [incomingRound('a', { segments: null })] }));
    const plan = planImport(value, EMPTY, PROFILE, TRACK);

    expect(plan.rounds[0]!.segments).toEqual([]);
    expect(plan.report.roundsHistoryOnly).toBe(1);
  });

  it('never fabricates an SRS state (REQ-I7)', () => {
    const value = parsed(payload({ words: [incomingWord('كتاب', { srs: null })] }));
    expect(planImport(value, EMPTY, PROFILE, TRACK).words[0]!.srs).toBeNull();
  });

  it('preserves a null flagCount as "not recorded" (REQ-32)', () => {
    const value = parsed(payload({ rounds: [incomingRound('a', { flagCount: null })] }));
    expect(planImport(value, EMPTY, PROFILE, TRACK).rounds[0]!.flagCount).toBeNull();
  });

  it('replace drops the existing corpus; merge keeps it (REQ-I4)', () => {
    const existing: Word[] = [
      {
        id: PROFILE.normalize('قديم'),
        trackId: TRACK,
        surface: 'قديم',
        gloss: 'old',
        forms: null,
        partOfSpeech: null,
        seenCount: 1,
        unclearCount: 0,
        firstSeenAt: 0,
        lastSeenAt: 0,
        lastMarkedAt: null,
        roundIds: [],
        srs: null,
      },
    ];
    const value = parsed(payload({ words: [incomingWord('جديد')] }));

    expect(planImport(value, { words: existing, rounds: [] }, PROFILE, TRACK, 'merge').words)
      .toHaveLength(2);
    expect(planImport(value, { words: existing, rounds: [] }, PROFILE, TRACK, 'replace').words)
      .toHaveLength(1);
  });

  it('marks a dry run as not writable (REQ-I4)', () => {
    const value = parsed(payload({ words: [incomingWord('كتاب')] }));
    const plan = planImport(value, EMPTY, PROFILE, TRACK, 'dryRun');

    expect(plan.writable).toBe(false);
    expect(plan.report.wordsAdded).toBe(1); // still reports, per REQ-I9
  });
});
