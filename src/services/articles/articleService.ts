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
import { planArticleFlag, wordIdAt } from '@/domain/articles/flags';
import {
  pickCurrentReading,
  readingFraction,
  rebaseIndices,
  resumeIndex,
} from '@/domain/articles/progress';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';

import { listWords, getWords, upsertWords } from '@/data/wordRepository';
import { getArticleRead, listArticleReads, markArticleRead } from '@/data/articleReadRepository';
import type { ArticleReadRecord } from '@/data/db';

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

/**
 * Everything in the library, in the order the bundle carries.
 *
 * Deliberately unsorted. Each card states its own difficulty, which is what a
 * reader is actually scanning for, and reordering the grid underneath them is a
 * second answer to a question already answered.
 */
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
  /** Where to put the reader back, or null to start at the title. */
  resumeAt: number | null;
  /** How many leading segments are the headline, which renders separately. */
  titleOffset: number;
}

/** The article left open, for the offer to pick it back up. */
export interface CurrentReading {
  article: Article;
  /** Roughly how far in, 0–1, for a progress hint rather than a percentage. */
  progress: number;
}

/**
 * The article the reader is in the middle of, or null.
 *
 * Read from storage rather than held in memory on purpose: the reason it was
 * being lost is that leaving the app discards memory, and an offer to resume
 * that only survives as long as the session would answer the wrong question.
 */
export async function currentReading(): Promise<CurrentReading | null> {
  const reads = await listArticleReads();
  const current = pickCurrentReading(reads);
  if (!current) return null;

  const bundle = await loadArticles();
  const article = bundle.articles.find((candidate) => candidate.id === current.id);
  if (!article) return null; // the bundle changed under a stored reading

  return { article, progress: readingFraction(current) };
}

/**
 * Stores how far into an article the reader has got.
 *
 * Never marks it read: leaving halfway is not finishing (REQ-51), and the two
 * are told apart by comparing openedAt with readAt.
 */
export async function saveReadingProgress(
  articleId: string,
  progressIndex: number,
  progressTotal: number,
  now = Date.now(),
): Promise<void> {
  const record = await getArticleRead(articleId);
  await markArticleRead({
    id: articleId,
    readAt: record?.readAt ?? null,
    openedAt: record?.openedAt ?? now,
    flaggedIndices: record?.flaggedIndices ?? [],
    ...(record?.priorMarks ? { priorMarks: record.priorMarks } : {}),
    titleOffset: record?.titleOffset ?? null,
    progressIndex,
    progressTotal,
  });
}

/**
 * Prepares an article for the reader.
 *
 * Segmented on open rather than at import time, because gloss resolution
 * consults the learner's corpus — a word learned yesterday should be glossed
 * today, and a segmentation cached at import would never know.
 */
export async function openArticle(id: string, now = Date.now()): Promise<OpenedArticle> {
  const [bundle, previous] = await Promise.all([loadArticles(), getArticleRead(id)]);

  const article = bundle.articles.find((candidate) => candidate.id === id);
  if (!article) throw new Error('That article is not in the library.');

  // Segmented on open rather than at import time, because gloss resolution
  // consults the learner's corpus and the gloss cache — a word learned or
  // translated yesterday should be glossed today, and a segmentation cached at
  // import would never know.
  const { segments, titleOffset } = await resegment(article);

  // Moved onto the current base and written straight back, so everything after
  // this point works in one numbering. The headline joining the segment stream
  // shifted every index by its length; without this, previously flagged words
  // would quietly slide along the text.
  const rebased = rebaseIndices(previous ?? null, titleOffset);

  // Stamped on open, which is what makes this the current reading — and what a
  // second article opened later quietly takes over.
  await markArticleRead({
    id,
    readAt: previous?.readAt ?? null,
    openedAt: now,
    progressIndex: rebased.progressIndex,
    progressTotal: previous?.progressTotal ?? null,
    titleOffset,
    flaggedIndices: rebased.flaggedIndices,
    ...(previous?.priorMarks ? { priorMarks: previous.priorMarks } : {}),
  });

  return {
    article,
    segments,
    titleOffset,
    flaggedIndices: rebased.flaggedIndices,
    untranslated: untranslatedIds(segments).length,
    resumeAt: resumeIndex(
      { ...(previous ?? { id, readAt: null }), progressIndex: rebased.progressIndex },
      segments.length,
    ),
  };
}

/**
 * Records a "didn't know" the moment it is tapped, rather than at Finish.
 *
 * A mark is something the reader did, and holding it in component state until
 * they reach the end means backing out of a long article — or the phone
 * reclaiming the tab — throws away everything they noticed. It is also what
 * made the corpus and the "marked recently" count lag behind the screen.
 *
 * Orchestration only: what a mark is worth is decided by planArticleFlag in
 * domain/articles (§2.1). This reads the two records it needs and writes back
 * what that returns.
 */
export async function setArticleFlag(
  article: Article,
  segments: readonly ResolvedSegment[],
  index: number,
  flagged: boolean,
  now = Date.now(),
): Promise<void> {
  const profile = modernStandardArabicProfile;
  const id = wordIdAt(segments, index, profile);
  if (id === null) return;

  const record: ArticleReadRecord = (await getArticleRead(article.id)) ?? {
    id: article.id,
    readAt: null,
    flaggedIndices: [],
  };
  const [word] = await getWords([id]);

  const plan = planArticleFlag({
    segments,
    index,
    flagged,
    state: { flaggedIndices: record.flaggedIndices, priorMarks: record.priorMarks ?? {} },
    word: word ?? null,
    articleId: article.id,
    trackId: DEFAULT_TRACK_ID,
    profile,
    now,
  });
  if (!plan) return;

  if (plan.word) await upsertWords([plan.word]);
  await markArticleRead({
    ...record,
    flaggedIndices: [...plan.state.flaggedIndices],
    priorMarks: { ...plan.state.priorMarks },
  });
}

/**
 * Folds a finished article back into the corpus.
 *
 * Uses the same ingestion as a generated round (REQ-11 identity, one increment
 * per reading regardless of repeats) so there is no second set of counting
 * rules that could drift from the first.
 *
 * Flags are not applied here — setArticleFlag wrote them as they were made.
 * That also ends a quiet inflation: reopening a previously flagged article
 * restored its flags, and finishing it again added another miss to every one of
 * them without the reader having touched anything.
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

  const record = await getArticleRead(article.id);
  await markArticleRead({
    id: article.id,
    readAt: now,
    // Finishing ends the reading: openedAt now sits at or before readAt, so
    // this article stops being the one offered to pick back up, and the stored
    // position is cleared rather than left to resume a reading that is over.
    openedAt: record?.openedAt ?? now,
    titleOffset: record?.titleOffset ?? null,
    progressIndex: null,
    progressTotal: null,
    flaggedIndices: [...notKnownIndices].sort((a, b) => a - b),
    priorMarks: record?.priorMarks ?? {},
  });
}
