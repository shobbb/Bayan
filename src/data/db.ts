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

/**
 * Per-article progress. Only progress is stored — the articles themselves ship
 * as a build asset, so there is nothing here to migrate when the content
 * changes and nothing to re-download when the app is reinstalled.
 */
export interface ArticleReadRecord {
  id: string;
  readAt: number;
  /** Segment indices flagged "didn't know" on the last read. */
  flaggedIndices: number[];
}

/**
 * Translations for words met in published articles.
 *
 * Kept out of the `words` table on purpose: a Word is something the learner has
 * actually seen, with counts and SRS state attached, and filling in an article's
 * vocabulary ahead of reading it would file thousands of words as seen that
 * were not. This is a lookup, not corpus membership.
 */
export interface GlossRecord {
  id: WordId;
  gloss: string;
  forms: string | null;
  /** Where it came from, so a generated gloss never overwrites an editorial one. */
  source: 'generated';
  createdAt: number;
}

export class BayanDB extends Dexie {
  words!: Table<Word, WordId>;
  rounds!: Table<Round, string>;
  batches!: Table<Batch, string>;
  settings!: Table<SettingsRecord, string>;
  articleReads!: Table<ArticleReadRecord, string>;
  glosses!: Table<GlossRecord, WordId>;

  constructor() {
    super('bayan');
    this.version(1).stores({
      words: 'id, trackId, seenCount, unclearCount, lastSeenAt',
      rounds: 'id, trackId, createdAt, topic, format, roundType',
      batches: 'id, createdAt',
      settings: 'key',
    });
    // v2 adds article progress. Dexie carries the v1 stores forward untouched,
    // so an existing corpus is not rewritten by this upgrade.
    this.version(2).stores({
      articleReads: 'id, readAt',
    });
    this.version(3).stores({
      glosses: 'id, createdAt',
    });
  }
}

export const db = new BayanDB();
