import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_ROUTES } from './models';
import { DEFAULT_GENERATION_CONFIG } from './generation';
import { DEFAULT_ALGORITHM_CONFIG } from './algorithm';

/**
 * Round generation truncated silently once, and it surfaced as a schema
 * failure with nothing pointing at the real cause. These tie the output
 * budgets to the sizes that actually drive them, so raising a word count or a
 * batch size without raising the ceiling fails here rather than on a phone.
 *
 * The ratios come from measuring a transcribed 40-word round: ~75 characters
 * of JSON per glossed word once segments carry text + gloss + forms. Fully
 * vowelled Arabic tokenizes worse than one token per character in places, so
 * budgeting a token per character is the floor, not a generous allowance.
 */
const JSON_CHARS_PER_GLOSSED_WORD = 75;

describe('output budgets', () => {
  it('lets round generation finish its longest permitted round', () => {
    const needed = DEFAULT_GENERATION_CONFIG.targetWordCount.max * JSON_CHARS_PER_GLOSSED_WORD;

    expect(DEFAULT_MODEL_ROUTES.roundGeneration.maxTokens).toBeGreaterThan(needed);
  });

  it('lets sentence generation finish a full-size batch', () => {
    // One vowelled sentence plus the echoed word, per card.
    const perCard = 150;
    const needed = DEFAULT_ALGORITHM_CONFIG.batch.warnAboveSize * perCard;

    expect(DEFAULT_MODEL_ROUTES.sentenceGeneration.maxTokens).toBeGreaterThan(needed);
  });

  it('routes every query kind to a model', () => {
    for (const [kind, route] of Object.entries(DEFAULT_MODEL_ROUTES)) {
      expect(route.model, kind).not.toBe('');
      expect(route.maxTokens, kind).toBeGreaterThan(0);
    }
  });
});
