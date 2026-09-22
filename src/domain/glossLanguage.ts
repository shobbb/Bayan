/**
 * Which language a word is *defined* in (§10, §13).
 *
 * Distinct from LanguageProfile, which is the language being learned. This is
 * the language of the answer side: English by default, or simple Arabic for a
 * learner who has got far enough that translating is the slower path.
 *
 * The two glosses live side by side on the record rather than one replacing the
 * other. A corpus of two thousand English glosses and a cache of bought ones
 * are both real assets, and a setting that silently invalidated them — or that
 * could not be switched back without paying twice — would not be a setting so
 * much as a one-way door.
 */
import type { Word } from './types';

export type GlossLanguage = 'english' | 'arabic';

/** The setting, resolved. */
export function glossLanguageFor(arabicOnly: boolean): GlossLanguage {
  return arabicOnly ? 'arabic' : 'english';
}

/**
 * The definition to show, in the active language, or '' when this word has
 * none yet.
 *
 * Never falls back to the other language. A learner who asked for Arabic
 * definitions and is shown an English one has been told the setting does not
 * work; an empty gloss is at least honest, and it is what routes the word to
 * the translation pass.
 */
export function glossFor(
  word: Pick<Word, 'gloss' | 'glossAr'>,
  language: GlossLanguage,
): string {
  const gloss = language === 'arabic' ? word.glossAr : word.gloss;
  return (gloss ?? '').trim();
}

/** Whether this word can be shown, or drilled, in the active language. */
export function hasGloss(
  word: Pick<Word, 'gloss' | 'glossAr'>,
  language: GlossLanguage,
): boolean {
  return glossFor(word, language) !== '';
}

/** The field a gloss in this language is written to. */
export function glossFieldFor(language: GlossLanguage): 'gloss' | 'glossAr' {
  return language === 'arabic' ? 'glossAr' : 'gloss';
}
