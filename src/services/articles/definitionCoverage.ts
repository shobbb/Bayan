/**
 * Which articles the pre-written definitions have not reached yet.
 *
 * The definitions file is filled one article at a time, so for most of the run
 * most of the library is unwritten. Finding the next unwritten article by
 * opening cards until one shows a translate prompt is the kind of search the
 * grid should answer at a glance instead.
 *
 * "Covered" is deliberately the same question the reader asks, through the same
 * function: segment the article with the bundled definitions as the only known
 * source, and see whether anything is left untranslated. Counting ids against
 * the file by hand would be a second implementation of segmentation that could
 * disagree with the first — and a phrase the reader sees as one segment is one
 * definition, not two.
 *
 * Measured over the full bundle this separates cleanly: the written articles
 * come back with nothing missing, and the nearest unwritten one is short by 24
 * words. There is no threshold to tune.
 */
import { articleToSegments, articleTitleSegments } from '@/domain/articles/segment';
import { modernStandardArabicProfile } from '@/domain/languageProfile';
import { bundledArabicDefinitions } from './bundledDefinitions';
import { untranslatedIds } from './enrichGlosses';
import { loadArticles } from './articleService';

let pending: Promise<ReadonlySet<string>> | null = null;

/**
 * Ids of every article with at least one word the bundled definitions do not
 * define.
 *
 * Derived from the definitions file rather than recorded beside it, so adding
 * an article's definitions is the only step — there is no second list to keep
 * in step, and therefore no way for the marks to go stale against the file.
 *
 * Computed once per session and shared: it is ~330ms of segmentation over the
 * whole bundle, which is cheap enough to do but not to repeat on every render.
 */
export function articlesMissingDefinitions(): Promise<ReadonlySet<string>> {
  pending ??= compute();
  return pending;
}

async function compute(): Promise<ReadonlySet<string>> {
  const [bundle, definitions] = await Promise.all([loadArticles(), bundledArabicDefinitions()]);

  const known = new Map(
    [...definitions].map(
      ([id, entry]) => [id, { gloss: entry.gloss, forms: null, surface: entry.surface }] as const,
    ),
  );
  const ctx = {
    profile: modernStandardArabicProfile,
    known,
    // Phrase boundaries only, matching Arabic mode: a multi-word expression is
    // one segment and wants one definition, so counting its words separately
    // would mark a finished article as unfinished.
    publisherLists: 'boundaries' as const,
  };

  const missing = new Set<string>();
  for (const article of bundle.articles) {
    const segments = [...articleTitleSegments(article, ctx), ...articleToSegments(article, ctx)];
    if (untranslatedIds(segments).length > 0) missing.add(article.id);
  }
  return missing;
}
