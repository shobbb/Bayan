/**
 * Reading third-party articles (§ Al Jazeera ingestion).
 *
 * Orchestration only. What a segment means is decided in domain/articles; what
 * a word is worth is decided by the same domain/rounds ingestion a generated
 * round uses. Nothing here decides either.
 *
 * The corpus is shared on purpose: a word met in an article is the same word
 * everywhere else in the app, so it earns a seenCount, joins batches, and shows
 * up in stats exactly as one met in a generated round does. Articles never
 * reach domain/selector — see domain/articles/types.ts for why.
 */
import type { ResolvedSegment } from '@/domain/articles/segment';
import { resegment, untranslatedIds } from './enrichGlosses';
import type { Article, ArticleBundle, ArticleSource } from '@/domain/articles/types';
import { ingestRoundWords } from '@/domain/rounds/ingest';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { Word, WordId } from '@/domain/types';
import { listWords, getWords, upsertWords } from '@/data/wordRepository';
import { getArticleRead, listArticleReads, markArticleRead } from '@/data/articleReadRepository';

let cached: ArticleBundle | null = null;

/**
 * Loads the bundled articles.
 *
 * Imported here rather than at module scope so the asset is code-split: it is
 * roughly a megabyte and only the library and reader ever need it, so it should
 * not be parsed on a launch that goes straight to a drill.
 */
export async function loadArticles(): Promise<ArticleBundle> {
  if (cached) return cached;
  const { default: bundle } = await import('@/assets/articles/articles.json');
  cached = bundle as unknown as ArticleBundle;
  return cached;
}

export interface LibraryEntry {
  article: Article;
  readAt: number | null;
}

/** Everything in the library, most recently read first, then unread. */
export async function listLibrary(): Promise<{ entries: LibraryEntry[]; source: ArticleSource }> {
  const [bundle, reads] = await Promise.all([loadArticles(), listArticleReads()]);
  const readAt = new Map(reads.map((record) => [record.id, record.readAt]));

  const entries = bundle.articles.map((article) => ({
    article,
    readAt: readAt.get(article.id) ?? null,
  }));

  return { entries, source: bundle.source };
}

export interface OpenedArticle {
  article: Article;
  segments: ResolvedSegment[];
  /** Indices flagged on the previous read, so a reopened article keeps them. */
  flaggedIndices: number[];
  /** Distinct forms here that still have no translation anywhere. */
  untranslated: number;
}

/**
 * Prepares an article for the reader.
 *
 * Segmented on open rather than at import time, because gloss resolution
 * consults the learner's corpus — a word learned yesterday should be glossed
 * today, and a segmentation cached at import would never know.
 */
export async function openArticle(id: string): Promise<OpenedArticle> {
  const [bundle, previous] = await Promise.all([loadArticles(), getArticleRead(id)]);

  const article = bundle.articles.find((candidate) => candidate.id === id);
  if (!article) throw new Error('That article is not in the library.');

  // Segmented on open rather than at import time, because gloss resolution
  // consults the learner's corpus and the gloss cache — a word learned or
  // translated yesterday should be glossed today, and a segmentation cached at
  // import would never know.
  const segments = await resegment(article);

  return {
    article,
    segments,
    flaggedIndices: previous?.flaggedIndices ?? [],
    untranslated: untranslatedIds(segments).length,
  };
}

/**
 * Folds a finished article back into the corpus.
 *
 * Uses the same ingestion as a generated round (REQ-11 identity, one increment
 * per reading regardless of repeats) so there is no second set of counting
 * rules that could drift from the first.
 */
export async function finishArticle(
  article: Article,
  segments: readonly ResolvedSegment[],
  notKnownIndices: readonly number[],
  now = Date.now(),
): Promise<void> {
  const profile = modernStandardArabicProfile;
  const existing = await listWords(DEFAULT_TRACK_ID);

  const touched = ingestRoundWords(segments, existing, article.id, DEFAULT_TRACK_ID, profile, now);
  await upsertWords(touched);

  const flaggedIds = new Set<WordId>(
    notKnownIndices
      .map((index) => segments[index])
      .filter((segment): segment is ResolvedSegment => segment?.gloss != null)
      .map((segment) => profile.normalize(segment.text)),
  );

  if (flaggedIds.size > 0) {
    const flagged = await getWords([...flaggedIds]);
    await upsertWords(
      flagged.map((word: Word) => ({
        ...word,
        unclearCount: word.unclearCount + 1,
        lastSeenAt: now,
      })),
    );
  }

  await markArticleRead({
    id: article.id,
    readAt: now,
    flaggedIndices: [...notKnownIndices],
  });
}
