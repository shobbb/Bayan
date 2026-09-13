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
  /**
   * When the article was finished, or null when it has only been flagged in.
   *
   * Nullable because flags are written the moment they are made, which is
   * before the article has been read to the end — and a flag is not a reading
   * (REQ-51). Records are sorted in JS rather than through an index: a null
   * indexed key is absent from that index in IndexedDB, so ordering by it would
   * quietly drop every article still in progress.
   */
  readAt: number | null;
  /**
   * When the article was last opened. Compared against readAt to tell an open
   * reading from a finished one, so reopening a finished article counts as
   * reading it again without costing it the "read" mark it earned.
   */
  openedAt?: number | null;
  /**
   * Segment index at the top of the viewport when the reader last left, so
   * coming back lands where they were rather than at the title.
   *
   * An index, not a scroll offset: the offset is a fact about one font size on
   * one screen, and would put the reader somewhere arbitrary the moment either
   * changed. A segment is a fact about the text.
   */
  progressIndex?: number | null;
  /**
   * How many segments the text had when that index was taken, so how far in it
   * is can be stated without re-segmenting the article to find out.
   */
  progressTotal?: number | null;
  /** Segment indices currently flagged "didn't know". */
  flaggedIndices: number[];
  /**
   * What each flagged word looked like before this reading flagged it.
   *
   * Carried on the record so unmarking restores the exact previous values
   * rather than guessing at them — a decrement can put unclearCount back, but
   * nothing can reconstruct the previous lastMarkedAt, and leaving it at the
   * time of a mistap would put the word in "marked this week" on the strength
   * of a tap that was taken back.
   */
  priorMarks?: Record<string, { unclearCount: number; lastMarkedAt: number | null }>;
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
