import { describe, it, expect } from 'vitest';
import { countDistinctForms, glossedSegments, ingestRoundWords } from './ingest';
import { modernStandardArabicProfile } from '@/domain/languageProfile';
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { Segment, TrackId, Word } from '@/domain/types';

const TRACK = 'msa' as TrackId;
const PROFILE = modernStandardArabicProfile;

function segment(text: string, gloss: string | null = 'gloss'): Segment {
  return { text, gloss, forms: null };
}

function word(surface: string, overrides: Partial<Word> = {}): Word {
  return {
    id: PROFILE.normalize(surface),
    trackId: TRACK,
    surface,
    gloss: 'existing',
    forms: null,
    partOfSpeech: null,
    seenCount: 2,
    unclearCount: 1,
    firstSeenAt: 100,
    lastSeenAt: 100,
    lastMarkedAt: null,
    roundIds: ['r-old'],
    srs: null,
    ...overrides,
  };
}

describe('glossed segments', () => {
  it('excludes punctuation and paragraph breaks', () => {
    const segments = [
      segment('كِتَاب'),
      segment('،', null),
      segment(PARAGRAPH_BREAK, null),
      segment('بَيْت'),
    ];
    expect(glossedSegments(segments).map((s) => s.text)).toEqual(['كِتَاب', 'بَيْت']);
  });
});

describe('countDistinctForms', () => {
  it('counts each normalized form once, however often it appears', () => {
    const segments = [segment('الْكِتَاب'), segment('الكتاب'), segment('بَيْت')];
    expect(countDistinctForms(segments, PROFILE)).toBe(2);
  });
});

describe('ingestRoundWords', () => {
  it('creates a record for a word seen for the first time', () => {
    const rows = ingestRoundWords([segment('كِتَاب')], [], 'r1', TRACK, PROFILE, 500);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.seenCount).toBe(1);
    expect(rows[0]!.unclearCount).toBe(0);
    expect(rows[0]!.firstSeenAt).toBe(500);
    expect(rows[0]!.roundIds).toEqual(['r1']);
    expect(rows[0]!.srs).toBeNull();
  });

  it('increments an existing word once per round, not per occurrence', () => {
    const existing = [word('كتاب', { seenCount: 2 })];
    const segments = [segment('الْكِتَاب'), segment('كِتَاب'), segment('كتاب')];

    const rows = ingestRoundWords(segments, existing, 'r1', TRACK, PROFILE, 500);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.seenCount).toBe(3);
    expect(rows[0]!.roundIds).toEqual(['r-old', 'r1']);
  });

  it('never touches unclearCount — exposure is not the unclear signal', () => {
    const existing = [word('كتاب', { unclearCount: 4 })];
    const rows = ingestRoundWords([segment('كِتَاب')], existing, 'r1', TRACK, PROFILE, 500);

    expect(rows[0]!.unclearCount).toBe(4);
  });

  it('keeps the earliest firstSeenAt and refreshes lastSeenAt', () => {
    const existing = [word('كتاب', { firstSeenAt: 100, lastSeenAt: 100 })];
    const rows = ingestRoundWords([segment('كِتَاب')], existing, 'r1', TRACK, PROFILE, 900);

    expect(rows[0]!.firstSeenAt).toBe(100);
    expect(rows[0]!.lastSeenAt).toBe(900);
  });

  it('updates the surface to the vowelled form as last displayed', () => {
    const existing = [word('كتاب', { surface: 'كتاب' })];
    const rows = ingestRoundWords([segment('الْكِتَاب')], existing, 'r1', TRACK, PROFILE, 500);

    expect(rows[0]!.surface).toBe('الْكِتَاب');
  });

  it('backfills a gloss onto a record imported without one (REQ-I5)', () => {
    const existing = [word('كتاب', { gloss: '', needsEnrichment: true })];
    const rows = ingestRoundWords(
      [segment('كِتَاب', 'book')],
      existing,
      'r1',
      TRACK,
      PROFILE,
      500,
    );

    expect(rows[0]!.gloss).toBe('book');
    expect(rows[0]!.needsEnrichment).toBeUndefined();
  });

  it('ignores punctuation and returns only touched rows', () => {
    const existing = [word('بيت'), word('كتاب')];
    const rows = ingestRoundWords(
      [segment('كِتَاب'), segment('.', null)],
      existing,
      'r1',
      TRACK,
      PROFILE,
      500,
    );

    expect(rows.map((row) => row.id)).toEqual([PROFILE.normalize('كتاب')]);
  });
});

describe('Arabic-only definitions (§13)', () => {
  // The one way this setting could destroy something: an Arabic definition
  // written into `gloss` would overwrite an English one nobody asked about.
  it('writes an Arabic definition to glossAr, leaving the English gloss alone', () => {
    const existing = [word('كتاب', { gloss: 'book' })];
    const rows = ingestRoundWords(
      [segment('كِتَاب', 'شَيْءٌ يُقْرَأُ')],
      existing,
      'r1',
      TRACK,
      PROFILE,
      500,
      'arabic',
    );

    expect(rows[0]!.gloss).toBe('book');
    expect(rows[0]!.glossAr).toBe('شَيْءٌ يُقْرَأُ');
  });

  it('creates a new word with only the Arabic side filled', () => {
    const rows = ingestRoundWords(
      [segment('كِتَاب', 'شَيْءٌ يُقْرَأُ')],
      [],
      'r1',
      TRACK,
      PROFILE,
      500,
      'arabic',
    );

    expect(rows[0]!.gloss).toBe('');
    expect(rows[0]!.glossAr).toBe('شَيْءٌ يُقْرَأُ');
  });

  it('does not overwrite an Arabic definition it already holds', () => {
    const existing = [word('كتاب', { glossAr: 'التَّعْرِيفُ الأَوَّلُ' })];
    const rows = ingestRoundWords(
      [segment('كِتَاب', 'تَعْرِيفٌ آخَرُ')],
      existing,
      'r1',
      TRACK,
      PROFILE,
      500,
      'arabic',
    );

    expect(rows[0]!.glossAr).toBe('التَّعْرِيفُ الأَوَّلُ');
  });

  it('defaults to English, which is what every caller meant before the setting', () => {
    const rows = ingestRoundWords([segment('كِتَاب', 'book')], [], 'r1', TRACK, PROFILE, 500);

    expect(rows[0]!.gloss).toBe('book');
    expect(rows[0]!.glossAr).toBeNull();
  });
});
