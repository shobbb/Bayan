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

describe('the terse brief for a small on-device model (§13)', () => {
  const terse = () =>
    buildGlossPrompt({
      words: ['كِتَاب'],
      languageGuidance: GUIDANCE,
      glossLanguage: 'arabic',
      terse: true,
    });

  it('asks for one word, not a list', () => {
    expect(terse()).toContain('Word: كِتَاب');
    expect(terse()).not.toContain('- كِتَاب');
  });

  // It exists to reduce what the model holds at once, so appending the track's
  // register guidance on top would put back exactly the load it removes.
  it('leaves out the language guidance the full brief carries', () => {
    expect(terse()).not.toContain(GUIDANCE);
  });

  it('shows the output shape rather than describing it', () => {
    expect(terse()).toContain('{"glosses":[{"word":');
    expect(terse()).toContain('مَدْرَسَة');
  });

  // Every field asked for is another thing a small model can get wrong, and
  // both of these are optional downstream.
  it('does not ask for forms or part of speech', () => {
    expect(terse()).not.toContain('partOfSpeech');
    expect(terse()).not.toContain('"forms"');
  });

  it('still states the two constraints nothing else can enforce', () => {
    expect(terse()).toContain('tashkeel');
    expect(terse()).toContain('No English');
  });

  it('is ignored for English, which has no terse variant', () => {
    const english = buildGlossPrompt({
      words: ['كِتَاب'],
      languageGuidance: GUIDANCE,
      terse: true,
    });

    expect(english).toContain('short English gloss');
    expect(english).toContain(GUIDANCE);
  });
});
