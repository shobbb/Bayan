/**
 * The one way a span of text becomes a WordId (REQ-11, REQ-29).
 *
 * The app counts *forms*, not lemmas, and its unit of vocabulary is sometimes
 * more than one word: a publisher expression like "يُطْلَقُ عَلَيْهِ" is a single
 * thing to learn, and word by word it reads "is released upon him". So an id
 * has to be derivable from a phrase as readily as from a word.
 *
 * The rule is: **normalize each whitespace-separated word, join with a single
 * space**. For a one-word span that is exactly `profile.normalize`, so nothing
 * about single-word identity changes.
 *
 * It is deliberately not `profile.normalize(wholePhrase)`, which is the obvious
 * thing and is wrong. Arabic normalization strips a leading definite article,
 * so run over a whole phrase it strips the first word's and leaves every other
 * one's — "المَوادّ الغِذائِيَّة" becomes "مواد الغذاييه", and the same phrase
 * written without the first article becomes something else again. A word's
 * identity would then depend on its position inside a phrase, which is exactly
 * the kind of silent mismatch the WordId brand exists to prevent. Measured over
 * the 284 imported articles, per-word keys match 625 of the 1,194 multi-word
 * publisher entries against the body text; whole-string keys match 592.
 */
import type { LanguageProfile, WordId } from './types';

export function phraseId(text: string, profile: LanguageProfile): WordId {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => profile.normalize(word))
    .join(' ') as WordId;
}

/** True when this id names more than one word — a publisher expression. */
export function isPhraseId(id: WordId): boolean {
  return id.includes(' ');
}
