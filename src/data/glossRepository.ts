/**
 * Repository over the gloss cache (REQ-3).
 *
 * Separate from wordRepository because these are translations, not corpus
 * membership: a cached gloss says what a word means, never that it has been
 * read. Reading is what creates a Word.
 */
import { db, type GlossRecord } from './db';
import type { WordId } from '@/domain/types';

export async function getGlosses(ids: readonly WordId[]): Promise<GlossRecord[]> {
  if (ids.length === 0) return [];
  return (await db.glosses.bulkGet([...ids])).filter((r): r is GlossRecord => r !== undefined);
}

export async function listGlosses(): Promise<GlossRecord[]> {
  return db.glosses.toArray();
}

export async function putGlosses(records: readonly GlossRecord[]): Promise<void> {
  if (records.length === 0) return;
  await db.glosses.bulkPut([...records]);
}

export async function countGlosses(): Promise<number> {
  return db.glosses.count();
}
