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
import { listWords } from '@/data/wordRepository';
import { getGlosses, putGlosses } from '@/data/glossRepository';
import type { GlossRecord } from '@/data/db';
import { generateGlosses } from '@/services/llm/generate';
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
const BATCH_SIZE: Record<GlossLanguage, number> = {
  english: 100,
  arabic: 35,
};

export interface EnrichmentResult {
  /** Words that had no translation before this ran. */
  requested: number;
  /** Words the model returned a usable gloss for. */
  filled: number;
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
  // The on-device model is keyless by nature, so the key is only required when
  // the hosted route is the one that will answer. Demanding it regardless would
  // block the one path that exists precisely to need nothing.
  const local = config.generation.useLocalModel && localModelSupported();
  const client = local ? localLlmClient : anthropicClient;

  const apiKey = local ? '' : ((await getApiKey()) ?? '');
  if (!local && !apiKey) throw new MissingApiKeyError();

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

  const batchSize = BATCH_SIZE[language];
  let filled = 0;
  for (let start = 0; start < missing.length; start += batchSize) {
    const chunk = missing.slice(start, start + batchSize);
    const response = await generateGlosses(
      {
        words: chunk.map((id) => surfaces.get(id) ?? id),
        languageGuidance: profile.promptGuidance,
        glossLanguage: language,
      },
      config.models.wordGlossing,
      apiKey,
      config.generation.maxValidationRetries,
      client,
    );

    // Match on the echoed word, normalized — the model is asked to echo it
    // back exactly, but a stray diacritic should not lose the whole entry.
    // phraseId, not normalize, so a multi-word expression echoed back lands on
    // the same key the request was made under.
    const byId = new Map<WordId, (typeof response.glosses)[number]>();
    for (const entry of response.glosses) {
      byId.set(phraseId(entry.word.trim(), profile), entry);
    }

    const records = chunk
      .map((id) => ({ id, entry: byId.get(id) }))
      .filter((row): row is { id: WordId; entry: NonNullable<typeof row.entry> } =>
        Boolean(row.entry?.gloss?.trim()),
      )
      .map(({ id, entry }): GlossRecord => {
        const previous = existing.get(id);
        const written = entry.gloss.trim();
        return {
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
        };
      });

    await putGlosses(records);
    filled += records.length;
  }

  return {
    result: { requested: wanted.length, filled: filled + cached.size },
    segments: (await resegment(article, language)).segments,
  };
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
