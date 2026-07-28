/**
 * Dexie schema (§2.2, REQ-3). This is the only file that defines table
 * shapes; migrations are added as new `.version()` calls, never by mutating
 * an existing one. No domain rules live here — see domain/ for those.
 */
import Dexie, { type Table } from 'dexie';
import type { Word, Round, Batch, WordId } from '@/domain/types';

export interface SettingsRecord {
  key: string;
  value: unknown;
}

export class BayanDB extends Dexie {
  words!: Table<Word, WordId>;
  rounds!: Table<Round, string>;
  batches!: Table<Batch, string>;
  settings!: Table<SettingsRecord, string>;

  constructor() {
    super('bayan');
    this.version(1).stores({
      words: 'id, trackId, seenCount, unclearCount, lastSeenAt',
      rounds: 'id, trackId, createdAt, topic, format, roundType',
      batches: 'id, createdAt',
      settings: 'key',
    });
  }
}

export const db = new BayanDB();
