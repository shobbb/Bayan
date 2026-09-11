/**
 * Repository over article progress (REQ-3). Articles themselves are a build
 * asset, so this table holds only what is true of *this learner*.
 */
import { db, type ArticleReadRecord } from './db';

export async function getArticleRead(id: string): Promise<ArticleReadRecord | undefined> {
  return db.articleReads.get(id);
}

export async function listArticleReads(): Promise<ArticleReadRecord[]> {
  return db.articleReads.orderBy('readAt').reverse().toArray();
}

export async function markArticleRead(record: ArticleReadRecord): Promise<void> {
  await db.articleReads.put(record);
}
