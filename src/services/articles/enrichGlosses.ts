/**
 * Filling in translations for words a published article does not gloss.
 *
 * The publisher glosses what its editors thought hard — about 8% of an
 * article's words — and the learner's own corpus covers another third. The rest
 * arrive with an empty gloss (REQ-A8), which is the hook this closes.
 *
 * Results go to the gloss cache, not the corpus. A Word means "the learner has
 * seen this", with counts and SRS state attached; translating an article's
 * vocabulary before it is read would file thousands of words as seen that were
 * not. Reading is still what creates a Word — this only decides what to show.
 */
import type { AppConfig } from '@/config';
import {
  articleToSegments,
  articleTitleSegments,
  type ResolvedSegment,
} from '@/domain/articles/segment';
import type { Article } from '@/domain/articles/types';
import {
  glossFieldFor,
  glossLanguageFor,
  type GlossLanguage,
} from '@/domain/glossLanguage';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { LanguageProfile, WordId } from '@/domain/types';
import { phraseId } from '@/domain/wordIdentity';
import { judgeArabicDefinition } from '@/domain/glossQuality';
import { listWords } from '@/data/wordRepository';
import { getGlosses, putGlosses } from '@/data/glossRepository';
import type { GlossRecord } from '@/data/db';
import { generateGlosses } from '@/services/llm/generate';
import type { LlmClient } from '@/services/llm/client';
import { anthropicClient } from '@/services/llm/client';
import { localLlmClient } from '@/services/llm/localClient';
import { localModelSupported } from '@/services/platform/localModel';
import { getApiKey } from '@/services/platform/storage';
import { MissingApiKeyError } from '@/services/rounds/roundService';

/**
 * Words per request, by the language the definitions are written in.
 *
 * An English gloss is one to three words; an Arabic definition is a phrase of
 * two to six, fully vowelled, and vowelled Arabic tokenizes far worse than
 * English — every diacritic is its own token. The same 100 words therefore cost
 * several times as much output to answer in Arabic, which is what ran the route
 * out of budget mid-array the first time this setting was used in anger.
 *
 * Sized down rather than up because the request is also cheaper to retry when
 * it is smaller: the words that do not arrive stay untranslated and the next
 * tap asks for them again.
 */
const BATCH_SIZE: Record<GlossLanguage | 'local', number> = {
  english: 100,
  arabic: 35,
  /**
   * The on-device model gets one word at a time.
   *
   * Its context window is a fraction of the hosted route's, and observed
   * failures were all the shape a small model produces when overloaded — the
   * answer restarted several times, markdown fences around it, structure
   * punctuated in Arabic. Asking for forty-seven definitions at once, each
   * bound by several simultaneous constraints, is the wrong brief for it.
   * These calls are free and local, so the only cost of asking singly is time.
   */
  local: 1,
};

/**
 * Failures in a row after which an optional pass stops asking.
 *
 * Five rather than one because a small model fails intermittently — a run of
 * bad answers among good ones is its normal behaviour, not a signal. Five in a
 * row with nothing in between is: the words are not the problem, the model is,
 * and it has the same 154 left to get wrong.
 */
const GIVE_UP_AFTER = 5;

export interface EnrichmentResult {
  /** Words that had no translation before this ran. */
  requested: number;
  /** Words the model returned a usable gloss for. */
  filled: number;
  /**
   * Answers refused as unusable before being stored — unvowelled, circular,
   * or carrying English (see domain/glossQuality).
   *
   * Reported rather than swallowed because it is the measure of whether the
   * on-device model is worth using: a pass that fills every word while
   * discarding half of its own answers is a different thing from one that does
   * not, and the reader cannot tell them apart from the result alone.
   */
  rejected: number;
  /**
   * Words still untranslated when both passes were done — a chunk whose
   * response could not be parsed, or one the model answered for nobody.
   *
   * Reported because the alternative is silence. These words come back looking
   * exactly like words that were never asked for, so without a count the offer
   * to translate simply reappears with no indication that it was already tried.
   */
  unanswered: number;
}

/** The distinct forms in these segments that still have no translation. */
export function untranslatedIds(
  segments: readonly ResolvedSegment[],
  profile = modernStandardArabicProfile,
): WordId[] {
  const ids = new Set<WordId>();
  for (const segment of segments) {
    if (segment.gloss === '') ids.add(phraseId(segment.text, profile));
  }
  return [...ids];
}

/** First surface seen for each id, so the model gets the vowelled form. */
function surfacesById(
  segments: readonly ResolvedSegment[],
  profile = modernStandardArabicProfile,
): Map<WordId, string> {
  const out = new Map<WordId, string>();
  for (const segment of segments) {
    if (segment.gloss !== '') continue;
    const id = phraseId(segment.text, profile);
    if (!out.has(id)) out.set(id, segment.text);
  }
  return out;
}

/**
 * Translates everything this article leaves untranslated, and returns the
 * article re-segmented against the filled cache.
 *
 * Scoped to one article rather than the whole library: it is the article in
 * front of the reader that matters, the cost is the reader's, and 9,000 words
 * up front is not a request anyone asked for.
 */
export async function enrichArticle(
  article: Article,
  segments: readonly ResolvedSegment[],
  config: AppConfig,
  now = Date.now(),
): Promise<{ result: EnrichmentResult; segments: ResolvedSegment[] }> {
  // The on-device model is keyless by nature, so a key is only required when
  // the hosted route has to answer. With the on-device model on, a missing key
  // is not fatal — it just means nothing catches what that model gets wrong.
  const local = config.generation.useLocalModel && localModelSupported();
  const hostedKey = (await getApiKey()) ?? '';
  if (!local && !hostedKey) throw new MissingApiKeyError();

  const profile = modernStandardArabicProfile;
  const language = glossLanguageFor(config.generation.arabicOnlyDefinitions);
  const field = glossFieldFor(language);
  const wanted = untranslatedIds(segments, profile);

  const surfaces = surfacesById(segments, profile);

  // Anything already cached from an earlier article costs nothing to reuse —
  // unless it was written for a homograph. A cached gloss whose vowelling
  // conflicts with the word here is one segmentation will refuse to show, so
  // counting it as done would leave the word blank with nothing left to fill
  // it: the offer to translate would never stop asking and never succeed.
  //
  // "Cached" is per language: a record holding an English gloss and no Arabic
  // one is not done in Arabic mode. It is still kept, which is why the write
  // below merges rather than replaces.
  const existing = new Map(
    (await getGlosses(wanted))
      .filter(
        (record) =>
          !(profile.vowelsConflict?.(surfaces.get(record.id) ?? '', record.surface ?? '') ?? false),
      )
      .map((record) => [record.id, record] as const),
  );
  const cached = new Set(
    [...existing.values()].filter((record) => (record[field] ?? '').trim() !== '').map((r) => r.id),
  );
  const missing = wanted.filter((id) => !cached.has(id));

  let filled = 0;
  let rejected = 0;

  /**
   * Asks one model for a set of words and writes what comes back, returning
   * the ids it could not fill.
   *
   * A closure rather than a free function so the two passes cannot drift: the
   * on-device attempt and the hosted one differ only in which client answers
   * and how many words they are asked for at a time.
   */
  async function runPass(
    ids: readonly WordId[],
    client: LlmClient,
    key: string,
    batchSize: number,
    /**
     * Whether a pass that answered nothing at all is an error.
     *
     * True for the hosted route, where every chunk failing means the key, the
     * model name or the token ceiling is wrong and saying "filled 0" would hide
     * it. False for the on-device pass, which is an optimisation: if it answers
     * nothing, the hosted route still has every word to answer, and that is a
     * slower success rather than a failure.
     */
    required: boolean,
  ) {
    const unfilled: WordId[] = [];
    let answered = 0;
    let consecutiveFailures = 0;
    let lastFailure: unknown;

    for (let start = 0; start < ids.length; start += batchSize) {
      const chunk = ids.slice(start, start + batchSize);

      // An optional pass that has failed its last several answers in a row has
      // stopped being an optimisation. At one word per call a long article is
      // a hundred and fifty-nine on-device generations, so grinding through the
      // rest of them to fail each one costs minutes and fills nothing — the
      // hosted route is going to answer these words either way. The required
      // pass never gives up early: there is nothing after it.
      if (!required && consecutiveFailures >= GIVE_UP_AFTER) {
        unfilled.push(...ids.slice(start));
        break;
      }

      // One chunk's failure costs that chunk. It used to cost the article: the
      // on-device model is asked one word at a time, so a single unsalvageable
      // answer out of a hundred and fifty-nine threw out of the whole pass, and
      // the hosted fallback that exists to catch exactly that never ran. The
      // words in a failed chunk are simply still untranslated, which is the
      // state the next pass — and the next tap — already handle.
      let response;
      try {
        response = await generateGlosses(
          {
            words: chunk.map((id) => surfaces.get(id) ?? id),
            languageGuidance: profile.promptGuidance,
            glossLanguage: language,
            terse: client === localLlmClient,
          },
          config.models.wordGlossing,
          key,
          config.generation.maxValidationRetries,
          client,
        );
      } catch (error) {
        lastFailure = error;
        consecutiveFailures += 1;
        unfilled.push(...chunk);
        continue;
      }
      answered += 1;
      consecutiveFailures = 0;

      // Match on the echoed word, normalized — the model is asked to echo it
      // back exactly, but a stray diacritic should not lose the whole entry.
      // phraseId, not normalize, so a multi-word expression echoed back lands on
      // the same key the request was made under.
      const byId = new Map<WordId, (typeof response.glosses)[number]>();
      for (const entry of response.glosses) {
        byId.set(phraseId(entry.word.trim(), profile), entry);
      }

      const records: GlossRecord[] = [];
      for (const id of chunk) {
        const entry = byId.get(id);
        const written = entry?.gloss?.trim() ?? '';
        if (entry === undefined || written === '') {
          unfilled.push(id);
          continue;
        }

        // An Arabic definition is judged before it is kept. The learner cannot
        // check the Arabic (REQ-C2), so an unvowelled or circular answer would
        // be read as fact; refusing it costs one more call, showing it teaches
        // the word wrong. English glosses carry no such checkable constraints.
        if (language === 'arabic') {
          const verdict = judgeArabicDefinition(surfaces.get(id) ?? id, written);
          if (!verdict.ok) {
            console.warn(`Rejected definition for ${surfaces.get(id) ?? id}: ${verdict.reason}`);
            rejected += 1;
            unfilled.push(id);
            continue;
          }
        }

        const previous = existing.get(id);
        records.push({
          id,
          // Both fields carried explicitly, so the language this pass did not
          // buy keeps whatever it already had. Overwriting the record wholesale
          // would throw away a translation already paid for.
          gloss: field === 'gloss' ? written : (previous?.gloss ?? ''),
          glossAr: field === 'glossAr' ? written : (previous?.glossAr ?? null),
          forms: entry.forms?.trim() || previous?.forms || null,
          // Kept so a later article can tell whether this gloss was written for
          // the word in front of it or for a homograph sharing its id.
          surface: surfaces.get(id) ?? id,
          source: 'generated',
          createdAt: now,
        });
      }

      await putGlosses(records);
      filled += records.length;
    }

    // Every chunk failed and this pass was the one that had to work. The
    // original error is rethrown rather than summarized: it carries the raw
    // response the operator needs (REQ-17), and a message written here would
    // replace that with a paraphrase of it.
    if (required && answered === 0 && lastFailure !== undefined) throw lastFailure;

    return unfilled;
  }

  // The on-device model answers first when it is enabled: it is free, private
  // and offline, so anything it gets right costs nothing. What it gets wrong is
  // caught above and asked of the hosted route instead, which makes it a pass
  // that can only help — never a downgrade in what the reader ends up seeing.
  const unfilled = local
    ? await runPass(missing, localLlmClient, '', BATCH_SIZE.local, false)
    : missing;

  const remaining =
    unfilled.length > 0 && (!local || hostedKey)
      ? await runPass(unfilled, anthropicClient, hostedKey, BATCH_SIZE[language], true)
      : unfilled;

  return {
    result: {
      requested: wanted.length,
      filled: filled + cached.size,
      rejected,
      unanswered: remaining.length,
    },
    segments: (await resegment(article, language)).segments,
  };
}

/**
 * Translates a single word on demand — the per-tap counterpart to enrichArticle.
 *
 * A one-word request is the reliable path for the on-device model. The bulk call
 * asks a small model for a JSON array of a hundred objects and it drifts out of
 * the schema — wrapping each word in its own object, repeating a gloss — which
 * fails validation whole. One word is a few tokens it can hold the shape for,
 * and it returns fast enough to sit behind a tap rather than a wait (REQ-A10:
 * still asked for, never spent unprompted).
 */
export async function enrichWord(
  article: Article,
  surface: string,
  config: AppConfig,
  now = Date.now(),
): Promise<{ filled: boolean; segments: ResolvedSegment[] }> {
  const local = config.generation.useLocalModel && localModelSupported();
  const client = local ? localLlmClient : anthropicClient;
  const apiKey = local ? '' : ((await getApiKey()) ?? '');
  if (!local && !apiKey) throw new MissingApiKeyError();

  const profile = modernStandardArabicProfile;
  const language = glossLanguageFor(config.generation.arabicOnlyDefinitions);
  const field = glossFieldFor(language);
  const id = phraseId(surface, profile);

  // A cached record for a homograph — same id, conflicting vowels — must not be
  // built on, for the same reason enrichArticle refuses to count it as done.
  const cached = (await getGlosses([id]))[0];
  const conflict = cached
    ? (profile.vowelsConflict?.(surface, cached.surface ?? '') ?? false)
    : false;
  const previous = conflict ? undefined : cached;

  let filled = (previous?.[field] ?? '').trim() !== '';
  if (!filled) {
    const response = await generateGlosses(
      { words: [surface], languageGuidance: profile.promptGuidance, glossLanguage: language },
      config.models.wordGlossing,
      apiKey,
      config.generation.maxValidationRetries,
      client,
    );
    // One word was asked for, so the first usable entry is it — no positional
    // join to get wrong, and no answer lost to an echoed diacritic.
    const entry =
      response.glosses.find((g) => phraseId(g.word.trim(), profile) === id) ?? response.glosses[0];
    const written = entry?.gloss?.trim();
    if (written) {
      await putGlosses([
        {
          id,
          gloss: field === 'gloss' ? written : (previous?.gloss ?? ''),
          glossAr: field === 'glossAr' ? written : (previous?.glossAr ?? null),
          forms: entry?.forms?.trim() || previous?.forms || null,
          surface,
          source: 'generated',
          createdAt: now,
        },
      ]);
      filled = true;
    }
  }

  return { filled, segments: (await resegment(article, language)).segments };
}

/**
 * Every cache key this article could need: each word in it, plus each of the
 * publisher's phrases under its own normalized key.
 *
 * The phrases have to be asked for explicitly. Splitting the text on whitespace
 * only ever produces single-token keys, so a phrase's definition would sit in
 * the cache, paid for, and never be fetched — the article would offer to define
 * it again on every open.
 */
function cacheKeysFor(article: Article, profile: LanguageProfile): WordId[] {
  const keys = new Set<WordId>();

  for (const token of [article.titleAr, ...article.paragraphs].join(' ').split(/\s+/)) {
    const id = phraseId(token, profile);
    if (id) keys.add(id);
  }

  for (const entry of [...article.vocab, ...article.expressions]) {
    const id = phraseId(entry.term, profile);
    if (id) keys.add(id);
  }

  return [...keys];
}

export interface SegmentedArticle {
  /** Title segments first, then the body — one stream, one set of indices. */
  segments: ResolvedSegment[];
  /** How many of those belong to the headline. */
  titleOffset: number;
}

/**
 * Re-reads the article against the corpus and the now-fuller cache.
 *
 * The headline leads the same array rather than living in one of its own, so a
 * word marked in the title is marked by exactly the machinery that marks one in
 * the body — one index space, one ingestion, one set of stored flags.
 */
export async function resegment(
  article: Article,
  language: GlossLanguage = 'english',
): Promise<SegmentedArticle> {
  const profile = modernStandardArabicProfile;
  const field = glossFieldFor(language);
  const [words, cache] = await Promise.all([
    listWords(DEFAULT_TRACK_ID),
    getGlosses(cacheKeysFor(article, profile)),
  ]);

  const known = new Map<WordId, { gloss: string; forms: string | null; surface?: string }>();
  // The cache is laid down first so a corpus gloss, which the learner has
  // actually met, wins over a generated one for the same form.
  //
  // Both sources are read in the active language only, and a record that has no
  // definition in it is left out entirely rather than falling back to the other
  // one: a word with nothing to show is what the translation pass looks for, and
  // showing English here would defeat the whole setting.
  for (const record of cache) {
    const gloss = (record[field] ?? '').trim();
    if (gloss) known.set(record.id, { gloss, forms: record.forms, surface: record.surface });
  }
  for (const word of words) {
    const gloss = (word[field] ?? '').trim();
    if (gloss) known.set(word.id, { gloss, forms: word.forms, surface: word.surface });
  }

  const ctx = {
    profile,
    known,
    // The publisher's English glosses are not an answer to the question Arabic
    // mode asks, but its phrase boundaries are still the only record of where a
    // multi-word expression ends — so those are kept and the glosses dropped.
    // The phrase is then defined in Arabic under its own id, like any word.
    publisherLists: language === 'arabic' ? ('boundaries' as const) : ('glosses' as const),
  };
  const title = articleTitleSegments(article, ctx);
  return { segments: [...title, ...articleToSegments(article, ctx)], titleOffset: title.length };
}
