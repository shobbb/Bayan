/**
 * Turning a publisher article into the reader's Segment list (§8).
 *
 * Pure: it takes the article and a lookup of already-known words and returns
 * segments, so gloss resolution is testable without a database (REQ-4).
 *
 * Resolution order, highest trust first:
 *   1. a publisher expression (longest phrase wins, so an idiom stays one tap)
 *   2. a publisher vocabulary entry
 *   3. the learner's own corpus, which already holds a gloss for this form
 *   4. nothing — the token renders as plain text and is not tappable
 *
 * Publisher glosses are editorial and outrank the corpus deliberately: they
 * were written for this sentence, where a corpus gloss was written for some
 * other one.
 */
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { LanguageProfile, Segment, WordId } from '@/domain/types';
import type { Article, ArticleGloss, GlossSource } from './types';

/**
 * Words, and everything else as its own token.
 *
 * `\p{L}\p{M}\p{N}` keeps Arabic letters with their combining marks together
 * (and copes with the Latin and digits these articles mix in for names and
 * years), while every other non-space character becomes a segment of its own so
 * punctuation renders tight against the word before it.
 */
const TOKEN = /[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;

export interface ResolvedSegment extends Segment {
  /** Non-null only where a gloss was found, for the provenance marker (§7). */
  glossSource: GlossSource;
}

interface PhraseEntry {
  gloss: string;
  forms: string | null;
  /** How many word tokens this phrase spans. */
  length: number;
}

function phraseKey(words: readonly string[], profile: LanguageProfile): string {
  return words.map((word) => profile.normalize(word)).join(' ');
}

/**
 * Single-letter words fused to the front of the next word: wa- (and), fa- (so),
 * bi- (with), li- (for), ka- (like). Arabic writes them with no space, so
 * "وَفِي" arrives as one token and misses a lookup that would have found "فِي".
 *
 * Stripping is only ever *attempted* — the stripped form is used solely when it
 * resolves to something already known. That matters because the same letters
 * are ordinary root letters: وزير (minister) is not wa- + زير, and a rule that
 * stripped unconditionally would mangle it. Requiring a hit makes the
 * distinction for us.
 *
 * Identity is untouched. "وَفِي" still enters the corpus as its own form, which
 * is what REQ-29 says the app counts — forms, not lemmas. This only decides
 * which gloss to show it.
 */
const PROCLITICS = ['و', 'ف', 'ب', 'ل', 'ك'] as const;
const DEFINITE_ARTICLE = 'ال';
/** Below this the remainder is too short to be a word rather than a fragment. */
const MIN_STEM_LENGTH = 2;

function candidateKeys(key: WordId): WordId[] {
  const out: WordId[] = [key];
  for (const proclitic of PROCLITICS) {
    if (!key.startsWith(proclitic)) continue;
    const stem = key.slice(proclitic.length);
    if (stem.length < MIN_STEM_LENGTH) continue;
    out.push(stem as WordId);
    if (stem.startsWith(DEFINITE_ARTICLE) && stem.length - DEFINITE_ARTICLE.length >= MIN_STEM_LENGTH) {
      out.push(stem.slice(DEFINITE_ARTICLE.length) as WordId);
    }
  }
  return out;
}

/**
 * Indexes the publisher's lists by normalized phrase.
 *
 * Expressions are added after vocabulary so that when the same key appears in
 * both, the expression's gloss wins — it is the more specific reading.
 */
export function indexGlosses(
  article: Article,
  profile: LanguageProfile,
): { byPhrase: Map<string, PhraseEntry>; maxWords: number } {
  const byPhrase = new Map<string, PhraseEntry>();
  let maxWords = 1;

  for (const entry of [...article.vocab, ...article.expressions] as ArticleGloss[]) {
    const words = entry.term.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const key = phraseKey(words, profile);
    if (key.trim() === '') continue;
    byPhrase.set(key, { gloss: entry.gloss, forms: entry.forms, length: words.length });
    maxWords = Math.max(maxWords, words.length);
  }

  return { byPhrase, maxWords };
}

function isWord(token: string): boolean {
  return /[\p{L}\p{N}]/u.test(token);
}

/**
 * Arabic script only. Latin names and years appear in these articles and are
 * not vocabulary — giving them a gloss slot would file "2018" as a word in the
 * learner's corpus.
 */
const ARABIC_LETTER = /[ء-ي]/;

function isArabicWord(token: string): boolean {
  return ARABIC_LETTER.test(token);
}

export interface SegmentContext {
  profile: LanguageProfile;
  /** Glosses the learner's corpus already holds, keyed by normalized id. */
  known: ReadonlyMap<WordId, { gloss: string; forms: string | null }>;
}

/**
 * Segments one article. Paragraphs are separated by PARAGRAPH_BREAK sentinels,
 * matching what the reader already renders for generated rounds.
 */
export function articleToSegments(article: Article, ctx: SegmentContext): ResolvedSegment[] {
  const { profile, known } = ctx;
  const { byPhrase, maxWords } = indexGlosses(article, profile);
  const segments: ResolvedSegment[] = [];

  article.paragraphs.forEach((paragraph, index) => {
    if (index > 0) {
      segments.push({ text: PARAGRAPH_BREAK, gloss: null, forms: null, glossSource: null });
    }

    const tokens = paragraph.match(TOKEN) ?? [];
    let cursor = 0;

    while (cursor < tokens.length) {
      const token = tokens[cursor]!;

      if (!isWord(token)) {
        segments.push({ text: token, gloss: null, forms: null, glossSource: null });
        cursor += 1;
        continue;
      }

      // Longest phrase first, so a multi-word expression is one tappable unit
      // rather than being shadowed by a single-word entry for its first word.
      let matched = false;
      for (let span = Math.min(maxWords, tokens.length - cursor); span >= 1; span--) {
        const window = tokens.slice(cursor, cursor + span);
        if (!window.every(isWord)) continue;

        const entry =
          byPhrase.get(phraseKey(window, profile)) ??
          (span === 1
            ? candidateKeys(phraseKey(window, profile) as WordId)
                .map((key) => byPhrase.get(key))
                .find(Boolean)
            : undefined);
        if (!entry) continue;

        segments.push({
          text: window.join(' '),
          gloss: entry.gloss,
          forms: entry.forms,
          glossSource: 'publisher',
        });
        cursor += span;
        matched = true;
        break;
      }
      if (matched) continue;

      // Exact first, then with a proclitic peeled off — never the other way
      // round, so a word that really does start with these letters wins.
      const keys = candidateKeys(profile.normalize(token));
      const corpus = keys.map((key) => known.get(key)).find(Boolean);
      if (corpus) {
        segments.push({
          text: token,
          gloss: corpus.gloss,
          forms: corpus.forms,
          glossSource: 'corpus',
        });
        cursor += 1;
        continue;
      }

      // No gloss from anywhere. An Arabic word still gets an empty gloss rather
      // than a null one, which is the difference between "we have no
      // translation yet" and "this is punctuation": the empty string keeps the
      // word tappable, keeps it flaggable, and — because ingestion keys on
      // gloss !== null — keeps it counted in the corpus as something the
      // learner has now seen. It lands there with needsEnrichment set, which
      // is the existing hook for a fill-missing-glosses pass (REQ-I5).
      //
      // Roughly 60% of an article's words arrive here, since the publisher only
      // glosses what it considers hard. Dropping them would mean most of what
      // is read never counts as read.
      segments.push({
        text: token,
        gloss: isArabicWord(token) ? '' : null,
        forms: null,
        glossSource: null,
      });
      cursor += 1;
    }
  });

  return segments;
}

/**
 * Share of Arabic words carrying an actual translation.
 *
 * Counts a non-empty gloss only: an empty one means the word is tracked and
 * tappable but has nothing to show yet, which is not coverage.
 */
export function glossCoverage(segments: readonly ResolvedSegment[]): number {
  const words = segments.filter(
    (segment) => segment.text !== PARAGRAPH_BREAK && isArabicWord(segment.text),
  );
  if (words.length === 0) return 0;
  return words.filter((segment) => segment.gloss).length / words.length;
}
