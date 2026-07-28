import { describe, it, expect } from 'vitest';
import { buildStateExport, exportFilename, serializeStateExport } from './buildExport';
import { parseStateExport } from './schema';
import { planImport } from './importPlan';
import { modernStandardArabicProfile } from '@/domain/languageProfile';
import { DEFAULT_CATEGORIES } from '@/config/categories';
import type { Round, TrackId, Word } from '@/domain/types';

const TRACK = 'msa' as TrackId;
const PROFILE = modernStandardArabicProfile;

function word(surface: string, overrides: Partial<Word> = {}): Word {
  return {
    id: PROFILE.normalize(surface),
    trackId: TRACK,
    surface,
    gloss: 'gloss',
    forms: null,
    partOfSpeech: 'noun',
    seenCount: 3,
    unclearCount: 1,
    firstSeenAt: 100,
    lastSeenAt: 900,
    roundIds: ['r1'],
    srs: null,
    ...overrides,
  };
}

function round(id: string, overrides: Partial<Round> = {}): Round {
  return {
    id,
    trackId: TRACK,
    titleAr: 'عُنْوَان',
    titleEn: 'Title',
    topic: 'travel',
    format: 'dialogue',
    roundType: 'explore',
    segments: [{ text: 'كِتَاب', gloss: 'book', forms: null }],
    distinctForms: 5,
    flagCount: 2,
    createdAt: 1000,
    ...overrides,
  };
}

describe('buildStateExport', () => {
  it('produces a dump that validates against the interchange schema (REQ-I1)', () => {
    const state = buildStateExport([word('كتاب')], [round('r1')], DEFAULT_CATEGORIES, null, 42);
    const parsed = parseStateExport(JSON.parse(serializeStateExport(state)));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.source).toBe('app');
      expect(parsed.value.exportedAt).toBe(42);
    }
  });

  it('carries every word and round — never a partial dump (REQ-I11)', () => {
    const words = [word('كتاب'), word('بيت'), word('قلم')];
    const rounds = [round('r1'), round('r2'), round('r3')];
    const state = buildStateExport(words, rounds, DEFAULT_CATEGORIES, null, 1);

    expect(state.words).toHaveLength(3);
    expect(state.rounds).toHaveLength(3);
    expect(state.categories.topics).toEqual(DEFAULT_CATEGORIES.topics);
  });

  it('preserves SRS state exactly (REQ-I11)', () => {
    const srs = { dueAt: 5000, intervalDays: 12, ease: 2.36, reps: 4, lapses: 1 };
    const state = buildStateExport([word('كتاب', { srs })], [], DEFAULT_CATEGORIES, null, 1);

    expect(state.words[0]!.srs).toEqual(srs);
  });

  it('round-trips a corpus through export and import without drift', () => {
    const words = [
      word('كتاب', { srs: { dueAt: 1, intervalDays: 2, ease: 2.5, reps: 3, lapses: 0 } }),
      word('بيت', { gloss: '', needsEnrichment: true, seenCount: 0, unclearCount: 0 }),
      word('قلم', { firstSeenAt: 0, lastSeenAt: 0, roundIds: [] }),
    ];
    const rounds = [
      round('r1'),
      round('r2', { segments: [], flagCount: null, createdAt: 0 }), // history only
    ];

    const dumped = serializeStateExport(
      buildStateExport(words, rounds, DEFAULT_CATEGORIES, null, 7),
    );
    const parsed = parseStateExport(JSON.parse(dumped));
    if (!parsed.ok) throw new Error(`export failed to validate: ${JSON.stringify(parsed.failures)}`);

    const restored = planImport(parsed.value, { words: [], rounds: [] }, PROFILE, TRACK, 'replace');

    // Sort both sides: import order follows the payload, which is enough for equality by id.
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect([...restored.words].sort(byId)).toEqual([...words].sort(byId));
    expect([...restored.rounds].sort(byId)).toEqual([...rounds].sort(byId));
  });

  it('keeps a history-only round history-only across the trip (REQ-I6)', () => {
    const state = buildStateExport([], [round('r1', { segments: [] })], DEFAULT_CATEGORIES, null, 1);
    expect(state.rounds[0]!.segments).toBeNull();
  });

  it('names dumps by timestamp', () => {
    expect(exportFilename(0)).toBe('bayan-state-1970-01-01-00-00-00.json');
  });
});
