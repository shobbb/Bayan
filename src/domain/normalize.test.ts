import { describe, it, expect } from 'vitest';
import { normalizeArabic } from './normalize';

describe('normalizeArabic', () => {
  it('strips harakat from a fully vowelled word', () => {
    expect(normalizeArabic('كَتَبَ')).toBe(normalizeArabic('كتب'));
  });

  it('strips shadda and sukun', () => {
    expect(normalizeArabic('مُدَرِّسْ')).toBe(normalizeArabic('مدرس'));
  });

  it('strips tatweel', () => {
    expect(normalizeArabic('كــتب')).toBe(normalizeArabic('كتب'));
  });

  it('normalizes hamza carriers to bare alef', () => {
    expect(normalizeArabic('أكل')).toBe(normalizeArabic('اكل'));
    expect(normalizeArabic('إلى')).toBe(normalizeArabic('الى'));
    expect(normalizeArabic('آلة')).toBe(normalizeArabic('الة'));
    expect(normalizeArabic('ٱلرحمن')).toBe(normalizeArabic('الرحمن'));
  });

  it('normalizes teh marbuta to heh', () => {
    expect(normalizeArabic('مدرسة')).toBe(normalizeArabic('مدرسه'));
  });

  it('normalizes alef maksura to yeh', () => {
    expect(normalizeArabic('على')).toBe(normalizeArabic('علي'));
  });

  it('strips the definite article when remainder is >= 3 chars', () => {
    expect(normalizeArabic('الكتاب')).toBe(normalizeArabic('كتاب'));
    expect(normalizeArabic('المدرسة')).toBe(normalizeArabic('مدرسة'));
  });

  it('does not strip ال when remainder would be < 3 chars', () => {
    // "الم" -> stripping "ال" leaves "م" (1 char) < 3, so it must stay.
    const withPrefix = normalizeArabic('الم');
    expect(withPrefix.startsWith('ال')).toBe(true);
  });

  it('trims surrounding whitespace and punctuation', () => {
    expect(normalizeArabic('  كتاب، ')).toBe(normalizeArabic('كتاب'));
    expect(normalizeArabic('"كتاب"')).toBe(normalizeArabic('كتاب'));
  });

  it('collapses distinct inflections of the same root to the same id', () => {
    // كَتَبَ / يَكْتُبُ / كِتَابَة share a root; the app doesn't collapse these
    // (different lemmas), but different vowellings of the SAME lemma must match.
    expect(normalizeArabic('الْكِتَابُ')).toBe(normalizeArabic('الكتاب'));
    expect(normalizeArabic('كِتَابٌ')).toBe(normalizeArabic('كتاب'));
  });

  it('is idempotent', () => {
    const once = normalizeArabic('الْمُدَرِّسَةِ');
    const twice = normalizeArabic(once);
    expect(twice).toBe(once);
  });

  it('handles empty and whitespace-only input without throwing', () => {
    expect(normalizeArabic('')).toBe('');
    expect(normalizeArabic('   ')).toBe('');
  });

  // Each hamza seat drops to the letter it sits on, which is what the seeded
  // corpus's ids already assume. 48 of its 1719 words had an id normalization
  // could not reproduce without this, and each would have opened a second
  // entry beside the one holding its history.
  it('drops each hamza seat to its underlying letter (REQ-11)', () => {
    expect(normalizeArabic('تُؤَثِّرُ')).toBe('توثر');
    expect(normalizeArabic('يُؤَدِّي')).toBe('يودي');
    expect(normalizeArabic('الْوَظَائِفِ')).toBe('وظايف');
  });

  it('reaches the same key whether or not the source was vowelled', () => {
    expect(normalizeArabic('مَسْؤُول')).toBe(normalizeArabic('مسؤول'));
    expect(normalizeArabic('وَظَائِف')).toBe(normalizeArabic('وظائف'));
  });

  // Documented limitation, not an oversight: the two seats land on different
  // letters, so the variant spellings stay distinct. Unifying them would mean
  // dropping the hamza entirely, which merges words that genuinely differ.
  it('does not unify variants that seat the hamza differently', () => {
    expect(normalizeArabic('مسؤول')).not.toBe(normalizeArabic('مسئول'));
  });

  // Bare hamza is a letter in its own right, not a seat.
  it('leaves bare hamza alone, so شيء does not become شي', () => {
    expect(normalizeArabic('شَيْء')).not.toBe(normalizeArabic('شي'));
  });
});
