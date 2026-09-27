import { describe, expect, it } from 'vitest';
import type { ModelRoute } from '@/config/models';
import type { LlmClient, LlmCompletion } from './client';
import { generateGlosses, generateRound, LlmValidationError } from './generate';

const ROUTE: ModelRoute = { model: 'test-model', maxTokens: 100, effort: 'medium' };

const PARAMS = {
  topic: 'science',
  format: 'diary',
  targetWords: ['كِتَاب'],
  excludeTopics: [],
  directives: [],
  languageGuidance: 'Modern Standard Arabic.',
  minWords: 90,
  maxWords: 140,
};

const VALID = JSON.stringify({
  titleAr: 'عُنْوَان',
  titleEn: 'A Title',
  segments: [{ text: 'كِتَاب', gloss: 'book', forms: null }],
});

/** Replays a fixed list of completions, one per attempt, recording the count. */
function clientReturning(...completions: LlmCompletion[]): LlmClient & { calls: number } {
  const client = {
    calls: 0,
    complete(): Promise<LlmCompletion> {
      const completion = completions[client.calls];
      client.calls += 1;
      if (!completion) throw new Error('client called more times than scripted');
      return Promise.resolve(completion);
    },
  };
  return client;
}

describe('generateRound', () => {
  it('returns the validated payload on a clean response', async () => {
    const client = clientReturning({ text: VALID, truncated: false });
    const round = await generateRound(PARAMS, ROUTE, 'k', 1, client);

    expect(round.titleEn).toBe('A Title');
    expect(round.segments).toHaveLength(1);
    expect(client.calls).toBe(1);
  });

  it('unwraps a markdown code fence the prompt asked the model not to use', async () => {
    const client = clientReturning({ text: '```json\n' + VALID + '\n```', truncated: false });
    const round = await generateRound(PARAMS, ROUTE, 'k', 1, client);

    expect(round.titleAr).toBe('عُنْوَان');
  });

  it('retries once on a malformed response and accepts the retry', async () => {
    const client = clientReturning(
      { text: 'not json at all', truncated: false },
      { text: VALID, truncated: false },
    );
    const round = await generateRound(PARAMS, ROUTE, 'k', 1, client);

    expect(round.titleEn).toBe('A Title');
    expect(client.calls).toBe(2);
  });

  it('reports schema issues when the shape is wrong after every retry', async () => {
    const wrong = JSON.stringify({ titleAr: 'x', titleEn: 'y', segments: [] });
    const client = clientReturning(
      { text: wrong, truncated: false },
      { text: wrong, truncated: false },
    );

    const error = await generateRound(PARAMS, ROUTE, 'k', 1, client).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmValidationError);
    const validation = error as LlmValidationError;
    expect(validation.truncated).toBe(false);
    expect(validation.issues.length).toBeGreaterThan(0);
    expect(validation.describe()).toContain('segments');
  });

  it('stops immediately on truncation instead of spending the retry', async () => {
    // A cut-off response is a budget problem: the retry would burn another full
    // generation only to hit the same ceiling.
    const client = clientReturning({ text: '{"titleAr":"عُنْ', truncated: true });

    const error = await generateRound(PARAMS, ROUTE, 'k', 1, client).catch((e: unknown) => e);

    expect(client.calls).toBe(1);
    expect(error).toBeInstanceOf(LlmValidationError);
    expect((error as LlmValidationError).truncated).toBe(true);
  });

  it('names the output limit in the detail so the cause is not guesswork', async () => {
    const client = clientReturning({ text: '{"titleAr":"عُنْ', truncated: true });

    const error = (await generateRound(PARAMS, ROUTE, 'k', 1, client).catch(
      (e: unknown) => e,
    )) as LlmValidationError;

    expect(error.describe()).toContain('max_tokens');
    // REQ-17: the raw response stays available for inspection.
    expect(error.rawResponse).toBe('{"titleAr":"عُنْ');
    expect(error.describe()).toContain('عُنْ');
  });
});

describe('generateGlosses', () => {
  const GLOSS_PARAMS = { words: ['كِتَاب'], languageGuidance: 'Modern Standard Arabic.' };

  const TRUNCATED_ARABIC = `{ "glosses": [
{ "word": "مُبَاشَرَةً", "gloss": "بِدُونِ تَأْخِيرٍ", "forms": null, "partOfSpeech": "adjective" },
{ "word": "إِلَى", "gloss": "حَرْفٌ يُفِيدُ الاتِّجَاهَ", "forms": null, "partOfSpeech": "particle" },
{ "word": "وَكَانَ", "gloss": "وَكَانَ ذَلِكَ فِي المَا`;

  it('returns a clean response as-is', async () => {
    const client = clientReturning({
      text: JSON.stringify({ glosses: [{ word: 'كِتَاب', gloss: 'book' }] }),
      truncated: false,
    });

    const response = await generateGlosses(GLOSS_PARAMS, ROUTE, 'key', 1, client);

    expect(response.glosses).toHaveLength(1);
  });

  // The entries that arrived are correct and already paid for. Throwing them
  // away costs the learner the whole call — for a long article, most of the
  // cost of reading it.
  it('recovers the definitions that arrived when the budget ran out', async () => {
    const client = clientReturning({ text: TRUNCATED_ARABIC, truncated: true });

    const response = await generateGlosses(GLOSS_PARAMS, ROUTE, 'key', 1, client);

    expect(response.glosses.map((entry) => entry.word)).toEqual(['مُبَاشَرَةً', 'إِلَى']);
  });

  // A truncation is a budget problem, not a compliance problem: retrying spends
  // another full generation to arrive at the same cut-off.
  it('does not retry a truncated response before salvaging it', async () => {
    const client = clientReturning({ text: TRUNCATED_ARABIC, truncated: true });

    await generateGlosses(GLOSS_PARAMS, ROUTE, 'key', 3, client);

    expect(client.calls).toBe(1);
  });

  // Nothing usable means the budget is too small to answer even one word, which
  // is the operator's problem to fix — and the error says how.
  it('still fails when the cut came before the first entry closed', async () => {
    const client = clientReturning({ text: '{ "glosses": [ { "word": "كِت', truncated: true });

    await expect(generateGlosses(GLOSS_PARAMS, ROUTE, 'key', 1, client)).rejects.toBeInstanceOf(
      LlmValidationError,
    );
  });

  it('still fails on a malformed response that was not truncated', async () => {
    const client = clientReturning(
      { text: 'not json', truncated: false },
      { text: 'still not json', truncated: false },
    );

    await expect(generateGlosses(GLOSS_PARAMS, ROUTE, 'key', 1, client)).rejects.toBeInstanceOf(
      LlmValidationError,
    );
  });
});
