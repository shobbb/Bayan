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
import { articleToSegments, type ResolvedSegment } from '@/domain/articles/segment';
import type { Article } from '@/domain/articles/types';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { WordId } from '@/domain/types';
import { listWords } from '@/data/wordRepository';
import { getGlosses, putGlosses } from '@/data/glossRepository';
import { generateGlosses } from '@/services/llm/generate';
import { getApiKey } from '@/services/platform/storage';
import { MissingApiKeyError } from '@/services/rounds/roundService';

/**
 * Words per request. Large enough that a typical article is one call, small
 * enough to stay well inside the route's output budget — a truncated response
 * costs the whole batch, and the budget is the thing that bit round generation.
 */
const BATCH_SIZE = 100;

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
    if (segment.gloss === '') ids.add(profile.normalize(segment.text));
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
    const id = profile.normalize(segment.text);
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
  const apiKey = await getApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const profile = modernStandardArabicProfile;
  const wanted = untranslatedIds(segments, profile);

  // Anything already cached from an earlier article costs nothing to reuse.
  const cached = new Set((await getGlosses(wanted)).map((record) => record.id));
  const missing = wanted.filter((id) => !cached.has(id));
  const surfaces = surfacesById(segments, profile);

  let filled = 0;
  for (let start = 0; start < missing.length; start += BATCH_SIZE) {
    const chunk = missing.slice(start, start + BATCH_SIZE);
    const response = await generateGlosses(
      {
        words: chunk.map((id) => surfaces.get(id) ?? id),
        languageGuidance: profile.promptGuidance,
      },
      config.models.wordGlossing,
      apiKey,
      config.generation.maxValidationRetries,
    );

    // Match on the echoed word, normalized — the model is asked to echo it
    // back exactly, but a stray diacritic should not lose the whole entry.
    const byId = new Map<WordId, (typeof response.glosses)[number]>();
    for (const entry of response.glosses) {
      byId.set(profile.normalize(entry.word.trim()), entry);
    }

    const records = chunk
      .map((id) => ({ id, entry: byId.get(id) }))
      .filter((row): row is { id: WordId; entry: NonNullable<typeof row.entry> } =>
        Boolean(row.entry?.gloss?.trim()),
      )
      .map(({ id, entry }) => ({
        id,
        gloss: entry.gloss.trim(),
        forms: entry.forms?.trim() || null,
        source: 'generated' as const,
        createdAt: now,
      }));

    await putGlosses(records);
    filled += records.length;
  }

  return {
    result: { requested: wanted.length, filled: filled + cached.size },
    segments: await resegment(article),
  };
}

/** Re-reads the article against the corpus and the now-fuller cache. */
export async function resegment(article: Article): Promise<ResolvedSegment[]> {
  const profile = modernStandardArabicProfile;
  const [words, cache] = await Promise.all([
    listWords(DEFAULT_TRACK_ID),
    getGlosses(
      article.paragraphs
        .join(' ')
        .split(/\s+/)
        .map((token) => profile.normalize(token))
        .filter(Boolean),
    ),
  ]);

  const known = new Map<WordId, { gloss: string; forms: string | null }>();
  // The cache is laid down first so a corpus gloss, which the learner has
  // actually met, wins over a generated one for the same form.
  for (const record of cache) known.set(record.id, { gloss: record.gloss, forms: record.forms });
  for (const word of words) {
    if (word.gloss) known.set(word.id, { gloss: word.gloss, forms: word.forms });
  }

  return articleToSegments(article, { profile, known });
}
