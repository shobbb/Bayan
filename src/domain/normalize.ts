/**
 * Arabic form normalization (§6, REQ-11). This is the highest-risk
 * component in the app: without it the same word accumulates as several
 * unrelated entries and every downstream metric silently degrades.
 *
 * Pure function — no Date.now(), no Math.random(), no I/O (REQ-4).
 * Display always uses the stored vowelled `surface`; normalization is for
 * identity only, never for rendering (REQ-12).
 *
 * Diacritic code points are written as explicit \u escapes rather than
 * literal combining marks in source: the latter are zero-width and would
 * stack invisibly onto whatever precedes them, making this file unreadable
 * and unsafe to hand-edit.
 */
import type { WordId } from './types';

// Tatweel (U+0640), fathatan..sukun (U+064B-U+0652), dagger alif (U+0670) -
// all zero-width combining marks or elongation, never part of identity.
// Built via RegExp + \u escapes rather than a literal character class: the
// combining marks would otherwise stack invisibly onto the source text
// itself, making this file unreadable and unsafe to hand-edit.
// Each code point below is a distinct diacritic matched individually for
// removal, not an accidental multi-codepoint grapheme.
// eslint-disable-next-line no-misleading-character-class
const DIACRITICS_AND_TATWEEL = new RegExp('[\\u0640\\u064B-\\u0652\\u0670]', 'g');

// Hamza carriers: alef with madda (U+0622), alef with hamza above (U+0623),
// alef with hamza below (U+0625), alef wasla (U+0671) -> bare alef (U+0627).
const HAMZA_ALEF_VARIANTS = /[آأإٱ]/g;
const BARE_ALEF = 'ا'; // ا

const TEH_MARBUTA = /ة/g; // ة -> ه
const HEH = 'ه'; // ه
const ALEF_MAKSURA = /ى/g; // ى -> ي
const YEH = 'ي'; // ي

// Whitespace and common Arabic/Latin punctuation at either edge of the token.
// ، = ، ؛ = ؛ ؟ = ؟ « = « » = »
const EDGE_PUNCTUATION =
  /^[\s.,;:!?"'`()[\]{}\-،؛؟ـ«»]+|[\s.,;:!?"'`()[\]{}\-،؛؟ـ«»]+$/g;

const ALEF_LAM_PREFIX = BARE_ALEF + 'ل'; // ال

/**
 * Normalizes a vowelled or unvowelled Arabic surface form into its identity
 * key (REQ-11):
 * - strips harakat, shadda, sukun, and tatweel
 * - collapses hamza carriers (أ إ آ ٱ) to ا
 * - normalizes ة -> ه and ى -> ي
 * - strips the definite article ال prefix only when the remainder is >= 3 characters
 * - trims surrounding whitespace and punctuation
 */
export function normalizeArabic(input: string): WordId {
  let s = input;
  s = s.replace(HAMZA_ALEF_VARIANTS, BARE_ALEF);
  s = s.replace(DIACRITICS_AND_TATWEEL, '');
  s = s.replace(TEH_MARBUTA, HEH);
  s = s.replace(ALEF_MAKSURA, YEH);
  s = s.trim().replace(EDGE_PUNCTUATION, '').toLowerCase();

  if (s.startsWith(ALEF_LAM_PREFIX) && s.length - ALEF_LAM_PREFIX.length >= 3) {
    s = s.slice(ALEF_LAM_PREFIX.length);
  }

  return s as WordId;
}
