import { describe, expect, it } from 'vitest';
import { llmComprehensionResponseSchema, llmGradeResponseSchema } from './schemas';
import { buildComprehensionPrompt, buildGradingPrompt } from './prompts';

const valid = {
  type: 'multipleChoice' as const,
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

  it('accepts a free-response question with a model answer', () => {
    const parsed = llmComprehensionResponseSchema.safeParse({
      questions: [valid, { type: 'freeResponse', question: 'لِمَاذَا؟', answer: 'لِأَنَّ…' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a free-response question without one', () => {
    const parsed = llmComprehensionResponseSchema.safeParse({
      questions: [{ type: 'freeResponse', question: 'لِمَاذَا؟' }],
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
      multipleChoiceCount: 4,
      freeResponseCount: 2,
    });

    expect(prompt).toContain('Write 4 multiple-choice questions and 2 free-response questions');
    expect(prompt).toContain('عُنْوَانٌ');
    expect(prompt).toContain('فِقْرَةٌ أُولَى\n\nفِقْرَةٌ ثَانِيَةٌ');
  });
});

describe('grading', () => {
  it('accepts a verdict with feedback', () => {
    expect(llmGradeResponseSchema.safeParse({ pass: false, feedback: 'نَاقِصٌ' }).success).toBe(true);
  });

  it('rejects a verdict with no feedback', () => {
    expect(llmGradeResponseSchema.safeParse({ pass: true, feedback: '' }).success).toBe(false);
  });

  it('gives the grader the article, the question, the model answer and the reply', () => {
    const prompt = buildGradingPrompt({
      titleAr: 'عُنْوَانٌ',
      paragraphs: ['فِقْرَةٌ'],
      question: 'لِمَاذَا؟',
      referenceAnswer: 'لِأَنَّ الْمَطَرَ نَزَلَ',
      learnerAnswer: 'بسبب المطر',
    });

    for (const part of ['فِقْرَةٌ', 'Question: لِمَاذَا؟', 'Model answer: لِأَنَّ الْمَطَرَ نَزَلَ', "Learner's answer: بسبب المطر"]) {
      expect(prompt).toContain(part);
    }
  });
});
