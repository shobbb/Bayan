import { describe, expect, it } from 'vitest';
import { llmComprehensionResponseSchema } from './schemas';
import { buildComprehensionPrompt } from './prompts';

const valid = {
  question: 'مَاذَا حَدَثَ؟',
  options: ['أَوَّلٌ', 'ثَانٍ', 'ثَالِثٌ', 'رَابِعٌ'],
  correctIndex: 2,
};

describe('comprehension response schema', () => {
  it('accepts four distinct options and an index into them', () => {
    expect(llmComprehensionResponseSchema.safeParse({ questions: [valid] }).success).toBe(true);
  });

  it('rejects an answer index outside the options', () => {
    const parsed = llmComprehensionResponseSchema.safeParse({
      questions: [{ ...valid, correctIndex: 4 }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a repeated option, which cannot be marked fairly', () => {
    const parsed = llmComprehensionResponseSchema.safeParse({
      questions: [{ ...valid, options: ['أَوَّلٌ', 'أَوَّلٌ', 'ثَالِثٌ', 'رَابِعٌ'] }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects anything but four options', () => {
    const parsed = llmComprehensionResponseSchema.safeParse({
      questions: [{ ...valid, options: valid.options.slice(0, 3) }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('comprehension prompt', () => {
  it('carries the article text and the question count', () => {
    const prompt = buildComprehensionPrompt({
      titleAr: 'عُنْوَانٌ',
      paragraphs: ['فِقْرَةٌ أُولَى', 'فِقْرَةٌ ثَانِيَةٌ'],
      count: 5,
    });

    expect(prompt).toContain('Write 5 questions.');
    expect(prompt).toContain('عُنْوَانٌ');
    expect(prompt).toContain('فِقْرَةٌ أُولَى\n\nفِقْرَةٌ ثَانِيَةٌ');
  });
});
