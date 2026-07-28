/**
 * Repository over the words table (REQ-3: repositories are the only IndexedDB
 * callers). No domain rules — ranking and selection logic live in domain/.
 */
import { db } from './db';
import type { Word, WordId, TrackId } from '@/domain/types';

export async function getWord(id: WordId): Promise<Word | undefined> {
  return db.words.get(id);
}

export async function getWords(ids: WordId[]): Promise<Word[]> {
  const rows = await db.words.bulkGet(ids);
  return rows.filter((w): w is Word => w !== undefined);
}

export async function listWords(trackId: TrackId): Promise<Word[]> {
  return db.words.where('trackId').equals(trackId).toArray();
}

export async function upsertWord(word: Word): Promise<void> {
  await db.words.put(word);
}

export async function upsertWords(words: Word[]): Promise<void> {
  await db.words.bulkPut(words);
}

export async function deleteWord(id: WordId): Promise<void> {
  await db.words.delete(id);
}

export async function countWords(trackId: TrackId): Promise<number> {
  return db.words.where('trackId').equals(trackId).count();
}
