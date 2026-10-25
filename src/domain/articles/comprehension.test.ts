import { describe, expect, it } from 'vitest';
import { shuffleOptions, type ComprehensionQuestion } from './comprehension';

const question: ComprehensionQuestion = {
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
