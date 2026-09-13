/**
 * Repository over article progress (REQ-3). Articles themselves are a build
 * asset, so this table holds only what is true of *this learner*.
 */
import { db, type ArticleReadRecord } from './db';

export async function getArticleRead(id: string): Promise<ArticleReadRecord | undefined> {
  return db.articleReads.get(id);
}

/**
 * Every article with progress, most recently finished first, then those only
 * flagged in.
 *
 * Sorted in JS rather than through the readAt index: a record whose indexed key
 * is null is absent from that index in IndexedDB, so ordering by it would
 * silently drop every article that has been flagged in but not finished.
 */
export async function listArticleReads(): Promise<ArticleReadRecord[]> {
  const records = await db.articleReads.toArray();
  return records.sort((a, b) => (b.readAt ?? 0) - (a.readAt ?? 0));
}

export async function markArticleRead(record: ArticleReadRecord): Promise<void> {
  await db.articleReads.put(record);
}
