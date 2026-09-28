/**
 * Whether a definition is fit to show (§13).
 *
 * The prompt asks for several things at once — simple Arabic, fully vowelled,
 * no English, not the headword again — and a small on-device model meets some
 * of them some of the time. Most of those constraints are mechanically
 * checkable, so a definition that fails one can be discarded and re-asked of a
 * bigger model instead of being shown as fact.
 *
 * That asymmetry is the whole point. A wrong gloss is not a blank one: the
 * learner cannot yet check the Arabic (REQ-C2), so anything shown reads as
 * authoritative. Silently dropping a bad definition costs one model call;
 * showing it teaches a word wrong.
 *
 * These are necessary conditions, never sufficient ones. Nothing here can tell
 * that "sport" was defined as "the school" — only that the answer was
 * unvowelled, which that one also was.
 */

const ARABIC_LETTER = /[ء-ي]/;
/** Tashkeel proper, plus the superscript alef that stands in for a long vowel. */
const TASHKEEL = /[ً-ْٰ]/;
const LATIN = /[A-Za-z]/;

/**
 * Diacritics per Arabic letter.
 *
 * Measured against the 274 fully vowelled articles in the corpus, which run
 * 0.44 at the sparsest to 0.90, median 0.81. Unvowelled text scores 0. The
 * threshold below sits under the sparsest real article, so it separates the
 * two populations without a judgement call.
 */
export function tashkeelDensity(text: string): number {
  let letters = 0;
  let marks = 0;
  for (const char of text) {
    if (ARABIC_LETTER.test(char)) letters += 1;
    else if (TASHKEEL.test(char)) marks += 1;
  }
  return letters === 0 ? 0 : marks / letters;
}

/** Below the sparsest fully vowelled article in the corpus (0.442). */
const MIN_TASHKEEL_DENSITY = 0.4;

/**
 * Longest run of shared consonants, ignoring order-breaking gaps — a rough
 * stand-in for "same root", which is what the prompt forbids reusing.
 *
 * Deliberately crude and deliberately conservative: it only reports a run of
 * three or more consonants appearing in the same order in both words, which is
 * what an Arabic root is. A false positive here throws away a good definition
 * and buys a model call; a false negative shows a slightly circular one. The
 * first is the cheaper mistake but not by much, so this does not try to be
 * clever.
 */
function sharesRoot(a: string, b: string): boolean {
  const headword = radicals(a);
  if (headword.length < 3) return false;

  const candidates = b.split(/\s+/).map(radicals);
  for (let i = 0; i + 3 <= headword.length; i++) {
    const run = headword.slice(i, i + 3);
    if (candidates.some((word) => word.includes(run))) return true;
  }
  return false;
}

/**
 * A word's letters with its affixes removed, so a match means shared root
 * letters rather than shared grammar.
 *
 * Measured: without this, the check fired on 1.63% of unrelated word pairs
 * drawn from the corpus, and essentially every one of them was the definite
 * article or a conjunction — الْأَدَوَاتِ against الْأَبْيَضَ shares "الأ" and
 * nothing else. Those are the commonest letters in the language and carry no
 * lexical meaning, so counting them made the check fire on grammar.
 */
function radicals(word: string): string {
  let letters = [...word].filter((c) => ARABIC_LETTER.test(c)).join('');
  for (const proclitic of PROCLITICS) {
    if (letters.startsWith(proclitic) && letters.length > proclitic.length + 1) {
      letters = letters.slice(proclitic.length);
      break;
    }
  }
  if (letters.startsWith(DEFINITE_ARTICLE) && letters.length > DEFINITE_ARTICLE.length + 1) {
    letters = letters.slice(DEFINITE_ARTICLE.length);
  }
  return letters;
}

/** wa-, fa-, bi-, li-, ka- — the same set segmentation peels off (§8). */
const PROCLITICS = ['و', 'ف', 'ب', 'ل', 'ك'] as const;
const DEFINITE_ARTICLE = 'ال';

export type GlossRejection =
  | 'empty'
  | 'containsEnglish'
  | 'notVowelled'
  | 'repeatsHeadword';

export interface GlossVerdict {
  ok: boolean;
  /** Why it was refused, for the log. Never shown to the reader. */
  reason?: GlossRejection;
}

const OK: GlossVerdict = { ok: true };

/**
 * Checks an Arabic definition against the constraints the prompt sets.
 *
 * English glosses are not checked the same way — they have no vowelling to
 * measure and are meant to be Latin — so they pass on non-emptiness alone,
 * which is the condition the rest of the app already applies.
 */
export function judgeArabicDefinition(headword: string, definition: string): GlossVerdict {
  const text = definition.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (LATIN.test(text)) return { ok: false, reason: 'containsEnglish' };

  // Length is deliberately not checked. A long definition is wordier than the
  // prompt asked for, not wrong, and the reader would rather read it than see
  // the word left blank. The looping failure it used to catch is caught by the
  // other checks, and by salvage before it ever reaches here.
  if (tashkeelDensity(text) < MIN_TASHKEEL_DENSITY) {
    return { ok: false, reason: 'notVowelled' };
  }
  if (sharesRoot(headword, text)) return { ok: false, reason: 'repeatsHeadword' };

  return OK;
}
