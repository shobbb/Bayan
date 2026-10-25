import { describe, expect, it } from 'vitest';
import {
  emptyProgress,
  isSettled,
  progressFor,
  score,
  shuffleOptions,
  type ComprehensionSet,
  type MultipleChoiceQuestion,
} from './comprehension';

const question: MultipleChoiceQuestion = {
  kind: 'multipleChoice',
  prompt: 'سُؤَالٌ',
  options: ['أ', 'ب', 'ج', 'د'],
  correctIndex: 0,
};

describe('shuffleOptions', () => {
  it('keeps the correct index pointing at the same option', () => {
    for (let seed = 0; seed < 20; seed++) {
      let state = seed;
      const random = () => ((state = (state * 9301 + 49297) % 233280) / 233280);
      const shuffled = shuffleOptions(question, random);

      expect(shuffled.options[shuffled.correctIndex]).toBe('أ');
      expect([...shuffled.options].sort()).toEqual([...question.options].sort());
    }
  });

  it('can move the answer off the first position', () => {
    // Always swapping with the first slot carries the answer away from it.
    const shuffled = shuffleOptions(question, () => 0);

    expect(shuffled.correctIndex).not.toBe(0);
  });
});

describe('progress', () => {
  const set: ComprehensionSet = {
    articleId: 'a1',
    createdAt: 100,
    questions: [
      question,
      { kind: 'freeResponse', prompt: 'لِمَاذَا؟', referenceAnswer: 'لِأَنَّ…' },
    ],
  };

  it('resumes saved progress made on the same set', () => {
    const saved = {
      ...emptyProgress(set, 1),
      position: 1,
      answers: { 0: { kind: 'multipleChoice' as const, chosen: 0, correct: true } },
    };

    expect(progressFor(set, saved, 2)).toEqual(saved);
  });

  it('starts afresh when the saved progress was made on an older set', () => {
    const saved = { ...emptyProgress({ ...set, createdAt: 50 }, 1), position: 1 };

    expect(progressFor(set, saved, 2)).toEqual(emptyProgress(set, 2));
  });

  it('counts a free answer only once it has passed', () => {
    const progress = {
      ...emptyProgress(set, 1),
      answers: {
        0: { kind: 'multipleChoice' as const, chosen: 1, correct: false },
        1: {
          kind: 'freeResponse' as const,
          draft: 'جَوَابٌ',
          submitted: 'جَوَابٌ',
          verdict: { pass: false, feedback: 'نَاقِصٌ' },
        },
      },
    };

    expect(score(set, progress)).toEqual({ correct: 0, total: 2 });
    expect(isSettled(progress.answers[1])).toBe(true);

    progress.answers[1] = { ...progress.answers[1], verdict: { pass: true, feedback: 'صَحِيحٌ' } };
    expect(score(set, progress)).toEqual({ correct: 1, total: 2 });
  });

  it('does not count a draft that was never submitted as settled', () => {
    expect(
      isSettled({ kind: 'freeResponse', draft: 'مُسَوَّدَةٌ', submitted: null, verdict: null }),
    ).toBe(false);
  });
});
