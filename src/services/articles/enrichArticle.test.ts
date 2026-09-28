/**
 * What a failed batch costs.
 *
 * The on-device model is asked one word at a time, so an article is a hundred
 * and fifty-nine separate calls and a small model will not hold the shape for
 * all of them. These pin the consequence: one unparseable answer costs that
 * word, and the hosted route — the whole reason a local answer is safe to try
 * first — still gets to answer the rest.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DEFAULT_APP_CONFIG } from '@/config';
import { modernStandardArabicProfile as profile } from '@/domain/languageProfile';
import type { Article } from '@/domain/articles/types';
import { articleToSegments } from '@/domain/articles/segment';
import { generateGlosses, LlmValidationError } from '@/services/llm/generate';
import { localLlmClient } from '@/services/llm/localClient';
import { enrichArticle } from './enrichGlosses';

vi.mock('@/data/glossRepository', () => ({
  getGlosses: vi.fn(async () => []),
  putGlosses: vi.fn(async () => undefined),
}));

vi.mock('@/data/wordRepository', () => ({ listWords: vi.fn(async () => []) }));
vi.mock('@/services/platform/storage', () => ({ getApiKey: vi.fn(async () => 'sk-test') }));
vi.mock('@/services/platform/localModel', () => ({ localModelSupported: () => true }));
vi.mock('@/services/llm/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm/generate')>()),
  generateGlosses: vi.fn(),
}));

const asMock = vi.mocked(generateGlosses);

/** Three distinct words, so the on-device pass makes three separate calls. */
const WORDS = ['سُوق', 'خُضَار', 'بَائِع'];

function article(): Article {
  return {
    id: 'a1',
    level: 'elementary',
    series: 'languageofmedia',
    sourceUrl: 'https://learning.aljazeera.net/en/articles/pages/1',
    topics: ['culture'],
    difficulty: 3,
    wordCount: WORDS.length,
    titleAr: 'عُنْوَان',
    titleEn: 'A Title',
    vowelled: true,
    paragraphs: [WORDS.join(' ')],
    imageUrl: null,
    videoUrl: null,
    vocab: [],
    expressions: [],
  };
}

function segments() {
  return articleToSegments(article(), { profile, known: new Map() });
}

/** English definitions, so these measure batching and not the Arabic gate. */
const localConfig = {
  ...DEFAULT_APP_CONFIG,
  generation: { ...DEFAULT_APP_CONFIG.generation, useLocalModel: true },
};

/** The shape a small model's looping output fails as: no declared truncation. */
function unparseable() {
  return new LlmValidationError('LLM response failed schema validation', '{"glosses": [', [], false);
}

// A block body, not an expression: mockReset() returns the mock for chaining,
// and a function returned from beforeEach is registered as a teardown hook —
// which called generateGlosses() with no arguments after every test.
beforeEach(() => {
  asMock.mockReset();
});

describe('enrichArticle', () => {
  it('lets the hosted route answer the words the on-device model could not', async () => {
    asMock.mockImplementation(async (params, _route, _key, _retries, client) => {
      // The on-device model manages one word and then loses the format — which
      // used to throw out of the whole article, hosted fallback and all.
      if (client === localLlmClient) {
        if (params.words[0] !== WORDS[0]) throw unparseable();
        return { glosses: [{ word: WORDS[0]!, gloss: 'market' }] };
      }
      return { glosses: params.words.map((word) => ({ word, gloss: `en:${word}` })) };
    });

    const { result } = await enrichArticle(article(), segments(), localConfig);

    expect(result.filled).toBe(WORDS.length);
    expect(result.unanswered).toBe(0);
  });

  it('reports the words nothing could answer rather than counting them done', async () => {
    // The hosted route answers for one word of the chunk and says nothing about
    // the other two. Those are not filled, and not silently forgotten either.
    asMock.mockImplementation(async () => ({
      glosses: [{ word: WORDS[0]!, gloss: 'market' }],
    }));

    const { result } = await enrichArticle(article(), segments(), {
      ...DEFAULT_APP_CONFIG,
      generation: { ...DEFAULT_APP_CONFIG.generation, useLocalModel: false },
    });

    expect(result.filled).toBe(1);
    expect(result.unanswered).toBe(WORDS.length - 1);
  });

  it('stops asking the on-device model once it has failed five in a row', async () => {
    // Distinct in their first radical, so normalization cannot collapse them
    // into one id — twenty words means twenty on-device calls to cut short.
    const words = [...'بتثجحخدذرزسشصضطظعغفق'].map((letter) => `${letter}َحَثَ`);
    const wide = {
      ...article(),
      paragraphs: [words.join(' ')],
      wordCount: words.length,
    };

    asMock.mockImplementation(async (params, _route, _key, _retries, client) => {
      if (client === localLlmClient) throw unparseable();
      return { glosses: params.words.map((word) => ({ word, gloss: `en:${word}` })) };
    });

    const { result } = await enrichArticle(
      wide,
      articleToSegments(wide, { profile, known: new Map() }),
      localConfig,
    );

    // Five on-device attempts, then one hosted call for everything — not
    // twenty-one distinct words' worth of on-device generation.
    const localCalls = asMock.mock.calls.filter(([, , , , client]) => client === localLlmClient);
    expect(localCalls).toHaveLength(5);
    expect(result.unanswered).toBe(0);
  });

  it('still fails loudly when the hosted route answers nothing at all', async () => {
    // Every chunk failing is a broken key, model name or token ceiling, not a
    // model having an off day. Reporting "filled 0" would hide it.
    asMock.mockImplementation(async () => {
      throw unparseable();
    });

    await expect(enrichArticle(article(), segments(), localConfig)).rejects.toThrow(
      LlmValidationError,
    );
  });
});
