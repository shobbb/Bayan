/**
 * A round is written as a passage and defined the way an article is. These pin
 * the two halves: the round is built from the passage alone, with whatever
 * definitions are already on hand, and the background pass puts new
 * definitions onto the learner's words without replacing any they had.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_CONFIG } from '@/config';
import { DEFAULT_TRACK_ID, modernStandardArabicProfile as profile } from '@/domain/languageProfile';
import type { Round, Word, WordId } from '@/domain/types';
import { phraseId } from '@/domain/wordIdentity';
import type { ResolvedSegment } from '@/domain/articles/segment';

const store = vi.hoisted(() => ({ words: new Map<string, unknown>(), rounds: new Map<string, unknown>() }));

vi.mock('@/data/wordRepository', () => ({
  listWords: vi.fn(async () => [...store.words.values()]),
  getWords: vi.fn(async (ids: string[]) => ids.map((id) => store.words.get(id)).filter(Boolean)),
  upsertWords: vi.fn(async (words: { id: string }[]) => words.forEach((w) => store.words.set(w.id, w))),
  getWord: vi.fn(async (id: string) => store.words.get(id)),
  upsertWord: vi.fn(async (w: { id: string }) => void store.words.set(w.id, w)),
}));
vi.mock('@/data/roundRepository', () => ({
  listRounds: vi.fn(async () => [...store.rounds.values()]),
  upsertRound: vi.fn(async (r: { id: string }) => void store.rounds.set(r.id, r)),
}));
vi.mock('@/data/glossRepository', () => ({
  getGlosses: vi.fn(async () => []),
  putGlosses: vi.fn(async () => undefined),
}));
vi.mock('@/services/articles/bundledDefinitions', () => ({
  bundledArabicDefinitions: vi.fn(async () => new Map()),
}));
vi.mock('@/services/platform/storage', () => ({ getApiKey: vi.fn(async () => 'sk-test') }));
vi.mock('@/services/llm/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm/generate')>()),
  generateRound: vi.fn(async () => ({
    titleAr: 'فِي السُّوقِ',
    titleEn: 'At the market',
    paragraphs: ['ذَهَبْتُ إِلَى السُّوقِ.'],
  })),
}));
vi.mock('@/services/articles/enrichGlosses', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/articles/enrichGlosses')>();
  return {
    ...real,
    // Defines every blank word as "تَعْرِيفُ <word>", as a model call would.
    enrichArticle: vi.fn(async (_article: unknown, segments: ResolvedSegment[]) => ({
      result: { requested: 0, filled: 0, rejected: 0, unanswered: 0 },
      segments: segments.map((s) => (s.gloss === '' ? { ...s, gloss: `تَعْرِيفُ ${s.text}` } : s)),
    })),
  };
});

const { createRound, defineRoundWords, undefinedWordCount } = await import('./roundService');

const CONFIG = DEFAULT_APP_CONFIG; // Arabic-only, as the app is locked to

function knownWord(surface: string, glossAr: string): Word {
  return {
    id: phraseId(surface, profile) as WordId,
    trackId: DEFAULT_TRACK_ID,
    surface,
    gloss: '',
    glossAr,
    forms: null,
    partOfSpeech: null,
    seenCount: 3,
    unclearCount: 0,
    firstSeenAt: 1,
    lastSeenAt: 1,
    lastMarkedAt: null,
    roundIds: [],
    srs: null,
  };
}

beforeEach(() => {
  store.words.clear();
  store.rounds.clear();
  const known = knownWord('السُّوقِ', 'مَكَانُ الْبَيْعِ');
  store.words.set(known.id, known);
});

describe('createRound', () => {
  it('builds the round from the passage, with the definitions already on hand', async () => {
    const round = await createRound('explore', CONFIG, { now: 1000, random: () => 0.5 });

    const byText = new Map(round.segments.map((s) => [s.text, s.gloss]));
    expect(byText.get('السُّوقِ')).toBe('مَكَانُ الْبَيْعِ'); // the learner's own
    expect(byText.get('ذَهَبْتُ')).toBe(''); // nothing yet: defined in the background
    expect(byText.get('.')).toBeNull(); // punctuation
    expect(round.segments.some((s) => s.text === 'فِي')).toBe(false); // the title is not in the body
    expect(undefinedWordCount(round)).toBe(2); // ذَهَبْتُ, إِلَى
  });
});

describe('defineRoundWords', () => {
  it('fills the blanks on the round and on the words, keeping definitions already held', async () => {
    const round = await createRound('explore', CONFIG, { now: 1000, random: () => 0.5 });

    const defined: Round = await defineRoundWords(round, CONFIG);

    expect(undefinedWordCount(defined)).toBe(0);
    const word = (surface: string) => store.words.get(phraseId(surface, profile)) as Word;
    expect(word('ذَهَبْتُ').glossAr).toBe('تَعْرِيفُ ذَهَبْتُ'); // a flashcard can show it now
    expect(word('السُّوقِ').glossAr).toBe('مَكَانُ الْبَيْعِ'); // not replaced
    expect((store.rounds.get(round.id) as Round).segments).toEqual(defined.segments); // saved
  });

  it('makes no call when nothing is missing', async () => {
    const round = await createRound('explore', CONFIG, { now: 1000, random: () => 0.5 });
    const full = { ...round, segments: round.segments.map((s) => (s.gloss === '' ? { ...s, gloss: 'x' } : s)) };

    expect(await defineRoundWords(full, CONFIG)).toBe(full);
  });
});
