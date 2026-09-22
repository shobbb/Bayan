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
 *
 * `SegmentContext.publisherLists` splits step 1-2 in half: the publisher's
 * lists say both where a phrase ends and what it means, and Arabic-only mode
 * (§13) wants the first without the second. See that field.
 */
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { LanguageProfile, Segment, WordId } from '@/domain/types';
import { phraseId } from '@/domain/wordIdentity';
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
  /** The form as the publisher wrote it, for the vowel-conflict check. */
  term: string;
}

function phraseKey(words: readonly string[], profile: LanguageProfile): WordId {
  return phraseId(words.join(' '), profile);
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
    byPhrase.set(key, {
      gloss: entry.gloss,
      forms: entry.forms,
      length: words.length,
      term: entry.term,
    });
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
  /**
   * Glosses the learner's corpus already holds, keyed by normalized id.
   *
   * `surface` is the vowelled form the gloss was recorded against. Identity is
   * diacritic-blind, so one id can hold two different words — أَشْهَرِ (most
   * famous) and أَشْهُرٍ (months) are both "اشهر" — and without the surface there
   * is nothing to notice that with.
   */
  known: ReadonlyMap<WordId, { gloss: string; forms: string | null; surface?: string }>;
  /**
   * What the publisher's vocabulary and expression lists are used for (§13).
   *
   * Those lists do two separable jobs: they say **where a phrase begins and
   * ends**, and they say **what it means in English**. Under Arabic-only
   * definitions the second is unusable — showing it would mean the one setting
   * that promises no English delivers it on the words the publisher thought
   * hardest — but the first is not, and it is not recoverable from anywhere
   * else. Only the publisher knows that "يُطْلَقُ عَلَيْهِ" is a unit; word by
   * word it reads "is released upon him", and no per-word definition will ever
   * assemble "is called" out of that.
   *
   * - `'glosses'` (the default): boundaries and English glosses, as before.
   * - `'boundaries'`: boundaries only. A multi-word entry still groups into one
   *   tappable segment, but its meaning is looked up in `known` under the
   *   phrase's own id, exactly as a single word is — so the phrase is defined
   *   in Arabic by the same pass, cached under the same key, and costs the same
   *   one call. A single-word entry is ignored outright, since the ordinary
   *   lookup below handles those and handles them better.
   */
  publisherLists?: 'glosses' | 'boundaries';
}

/**
 * A stored gloss is refused when the two forms state a vowel differently: same
 * letters, both vowelled at the same place, and disagreeing. The word then
 * falls through to no gloss, which is what offers it to the translation pass —
 * and that pass is given the vowelled form in front of the reader, so it comes
 * back right.
 */
function conflicts(profile: LanguageProfile, token: string, surface?: string): boolean {
  return surface !== undefined && (profile.vowelsConflict?.(token, surface) ?? false);
}

/**
 * Segments one article. Paragraphs are separated by PARAGRAPH_BREAK sentinels,
 * matching what the reader already renders for generated rounds.
 */
function segmentRun(
  text: string,
  byPhrase: ReadonlyMap<string, PhraseEntry>,
  maxWords: number,
  ctx: SegmentContext,
  into: ResolvedSegment[],
): void {
  const { profile, known } = ctx;
  const tokens = text.match(TOKEN) ?? [];
  let cursor = 0;

  while (cursor < tokens.length) {
    const token = tokens[cursor]!;

    if (!isWord(token)) {
      into.push({ text: token, gloss: null, forms: null, glossSource: null });
      cursor += 1;
      continue;
    }

    // Under 'boundaries' the publisher's spans are still honoured, but only
    // where they group more than one word — a single-word entry has no boundary
    // to contribute, so it drops through to the ordinary lookup below.
    const boundariesOnly = ctx.publisherLists === 'boundaries';
    const minSpan = boundariesOnly ? 2 : 1;

    // Longest phrase first, so a multi-word expression is one tappable unit
    // rather than being shadowed by a single-word entry for its first word.
    let matched = false;
    for (let span = Math.min(maxWords, tokens.length - cursor); span >= minSpan; span--) {
      const window = tokens.slice(cursor, cursor + span);
      if (!window.every(isWord)) continue;

      const key = phraseKey(window, profile);
      const entry =
        byPhrase.get(key) ??
        (span === 1
          ? candidateKeys(key as WordId)
              .map((candidate) => byPhrase.get(candidate))
              .find(Boolean)
          : undefined);
      if (!entry) continue;
      // Publisher lists collide on a bare id exactly as the corpus does.
      if (span === 1 && conflicts(profile, token, entry.term)) continue;

      if (boundariesOnly) {
        // The span is the publisher's; the meaning is not. A phrase is looked
        // up under its own id, so it is defined, cached and counted by exactly
        // the machinery a single word is — and when nothing holds it yet, the
        // empty gloss offers the whole phrase to the definition pass rather
        // than its words one at a time.
        const held = known.get(key as WordId);
        into.push({
          text: window.join(' '),
          gloss: held?.gloss ?? '',
          forms: held?.forms ?? null,
          glossSource: held ? 'corpus' : null,
        });
      } else {
        into.push({
          text: window.join(' '),
          gloss: entry.gloss,
          forms: entry.forms,
          glossSource: 'publisher',
        });
      }
      cursor += span;
      matched = true;
      break;
    }
    if (matched) continue;

    // Exact first, then with a proclitic peeled off — never the other way
    // round, so a word that really does start with these letters wins.
    const keys = candidateKeys(profile.normalize(token));
    const corpus = keys
      .map((key) => known.get(key))
      .find((entry) => entry !== undefined && !conflicts(profile, token, entry.surface));
    if (corpus) {
      into.push({
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
    into.push({
      text: token,
      gloss: isArabicWord(token) ? '' : null,
      forms: null,
      glossSource: null,
    });
    cursor += 1;
  }
}

/**
 * The headline, segmented exactly as the body is.
 *
 * A headline is the densest Arabic on the page and routinely carries the word
 * the article is about, so leaving it as flat text made the one line most worth
 * a tap the only line that refused one. It resolves against the same publisher
 * glosses and the same corpus, so a word met here is the same word met below.
 */
export function articleTitleSegments(article: Article, ctx: SegmentContext): ResolvedSegment[] {
  const { byPhrase, maxWords } = indexGlosses(article, ctx.profile);
  const segments: ResolvedSegment[] = [];
  segmentRun(article.titleAr, byPhrase, maxWords, ctx, segments);
  return segments;
}

/**
 * Segments one article. Paragraphs are separated by PARAGRAPH_BREAK sentinels,
 * matching what the reader already renders for generated rounds.
 */
export function articleToSegments(article: Article, ctx: SegmentContext): ResolvedSegment[] {
  const { byPhrase, maxWords } = indexGlosses(article, ctx.profile);
  const segments: ResolvedSegment[] = [];

  article.paragraphs.forEach((paragraph, index) => {
    if (index > 0) {
      segments.push({ text: PARAGRAPH_BREAK, gloss: null, forms: null, glossSource: null });
    }
    segmentRun(paragraph, byPhrase, maxWords, ctx, segments);
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
