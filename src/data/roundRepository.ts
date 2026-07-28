/**
 * Repository over the rounds table (REQ-3). No domain rules.
 */
import { db } from './db';
import type { Round, TrackId } from '@/domain/types';

export async function getRound(id: string): Promise<Round | undefined> {
  return db.rounds.get(id);
}

export async function listRounds(trackId: TrackId, limit?: number): Promise<Round[]> {
  const rounds = await db.rounds.where('trackId').equals(trackId).sortBy('createdAt');
  const mostRecentFirst = rounds.reverse();
  return limit === undefined ? mostRecentFirst : mostRecentFirst.slice(0, limit);
}

export async function upsertRound(round: Round): Promise<void> {
  await db.rounds.put(round);
}

export async function deleteRound(id: string): Promise<void> {
  await db.rounds.delete(id);
}

export async function countRounds(trackId: TrackId): Promise<number> {
  return db.rounds.where('trackId').equals(trackId).count();
}
