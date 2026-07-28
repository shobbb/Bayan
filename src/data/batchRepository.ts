/**
 * Repository over the batches table (REQ-3). No domain rules — batch
 * composition (§9) is a domain/selector concern, not this repository's.
 */
import { db } from './db';
import type { Batch } from '@/domain/types';

export async function getBatch(id: string): Promise<Batch | undefined> {
  return db.batches.get(id);
}

export async function getLatestBatch(): Promise<Batch | undefined> {
  return db.batches.orderBy('createdAt').last();
}

export async function upsertBatch(batch: Batch): Promise<void> {
  await db.batches.put(batch);
}

export async function deleteBatch(id: string): Promise<void> {
  await db.batches.delete(id);
}
