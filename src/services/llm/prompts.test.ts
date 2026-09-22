import { describe, expect, it } from 'vitest';
import { buildGlossPrompt, buildRoundGenerationPrompt } from './prompts';

const GUIDANCE = 'Modern Standard Arabic, fully vowelled.';

describe('buildGlossPrompt', () => {
  it('asks for English glosses by default', () => {
    const prompt = buildGlossPrompt({ words: ['كِتَاب'], languageGuidance: GUIDANCE });

    expect(prompt).toContain('short English gloss');
    expect(prompt).not.toContain('SIMPLE ARABIC');
  });

  it('asks for a simple Arabic definition when that is the setting (§13)', () => {
    const prompt = buildGlossPrompt({
      words: ['كِتَاب'],
      languageGuidance: GUIDANCE,
      glossLanguage: 'arabic',
    });

    expect(prompt).toContain('SIMPLE ARABIC');
    expect(prompt).not.toContain('short English gloss');
  });

  // A one-to-three-word English gloss is a translation; the Arabic equivalent of
  // that is a synonym, which is either a word the learner also does not know or
  // the same word again. The prompt has to ask for a definition instead.
  it('asks for a definition rather than a synonym', () => {
    const prompt = buildGlossPrompt({
      words: ['كِتَاب'],
      languageGuidance: GUIDANCE,
      glossLanguage: 'arabic',
    });

    expect(prompt).toContain('not a one-word synonym');
    expect(prompt).toContain('never use the headword itself');
  });

  it('carries the words either way', () => {
    for (const language of ['english', 'arabic'] as const) {
      const prompt = buildGlossPrompt({
        words: ['كِتَاب', 'بَيْت'],
        languageGuidance: GUIDANCE,
        glossLanguage: language,
      });

      expect(prompt).toContain('- كِتَاب');
      expect(prompt).toContain('- بَيْت');
      expect(prompt).toContain(GUIDANCE);
    }
  });
});

describe('buildRoundGenerationPrompt', () => {
  const base = {
    topic: 'travel',
    format: 'dialogue',
    targetWords: [],
    excludeTopics: [],
    directives: [],
    languageGuidance: GUIDANCE,
    minWords: 90,
    maxWords: 140,
  };

  it('leaves the gloss rule alone by default', () => {
    expect(buildRoundGenerationPrompt(base)).not.toContain('Override the gloss rule');
  });

  it('overrides the segment glosses to Arabic when asked (§13)', () => {
    const prompt = buildRoundGenerationPrompt({ ...base, glossLanguage: 'arabic' });

    expect(prompt).toContain('Override the gloss rule');
    expect(prompt).toContain('DEFINITION IN SIMPLE ARABIC');
    // The English title is how a round is listed, not something read to
    // understand the text, so it is explicitly exempted.
    expect(prompt).toContain('"titleEn" is unaffected');
  });
});
