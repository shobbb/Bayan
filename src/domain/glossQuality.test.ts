import { describe, expect, it } from 'vitest';
import { judgeArabicDefinition, tashkeelDensity } from './glossQuality';

describe('tashkeelDensity', () => {
  it('is zero for unvowelled text', () => {
    expect(tashkeelDensity('المدرسة')).toBe(0);
  });

  it('is near one for fully vowelled text', () => {
    expect(tashkeelDensity('مَكَانٌ لِلتَّعَلُّمِ')).toBeGreaterThan(0.9);
  });

  it('is zero rather than NaN when there are no Arabic letters', () => {
    expect(tashkeelDensity('')).toBe(0);
    expect(tashkeelDensity('school')).toBe(0);
  });
});

describe('judgeArabicDefinition', () => {
  const RIYADA = 'الرِّيَاضَة';

  it('accepts a well-formed definition', () => {
    expect(judgeArabicDefinition(RIYADA, 'حَرَكَةُ الجِسْمِ لِلصِّحَّةِ').ok).toBe(true);
  });

  // The exact answer the on-device model gave for "sport": unrelated, and with
  // no tashkeel at all. Nothing here can catch the first; the second is enough.
  it('rejects the unvowelled answer the on-device model produced', () => {
    const verdict = judgeArabicDefinition(RIYADA, 'المدرسة');

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('notVowelled');
  });

  it('rejects English in a definition meant to have none', () => {
    expect(judgeArabicDefinition(RIYADA, 'exercise').reason).toBe('containsEnglish');
    expect(judgeArabicDefinition(RIYADA, 'حَرَكَةُ الجِسْمِ (sport)').reason).toBe(
      'containsEnglish',
    );
  });

  it('rejects an empty answer', () => {
    expect(judgeArabicDefinition(RIYADA, '   ').reason).toBe('empty');
  });

  // The looping failure: the model restarts its answer instead of finishing.
  it('rejects an answer that runs on', () => {
    const looped = Array.from({ length: 15 }, () => 'كَلِمَةٌ').join(' ');

    expect(judgeArabicDefinition(RIYADA, looped).reason).toBe('tooLong');
  });

  // Defining a word with its own root is the circularity the prompt forbids:
  // it tells a learner who does not know رياضة that it means رياضة.
  it('rejects a definition built from the headword’s own root', () => {
    expect(judgeArabicDefinition(RIYADA, 'مُمَارَسَةُ الرِّيَاضَةِ').reason).toBe(
      'repeatsHeadword',
    );
  });

  it('allows a definition that merely shares a couple of letters', () => {
    expect(judgeArabicDefinition(RIYADA, 'حَرَكَةُ الجِسْمِ لِلصِّحَّةِ').ok).toBe(true);
  });

  it('does not flag a root match against a headword shorter than a root', () => {
    expect(judgeArabicDefinition('فِي', 'دَاخِلَ شَيْءٍ مَا').ok).toBe(true);
  });
});
