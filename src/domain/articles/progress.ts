/**
 * Which article is being read, and how far into it.
 *
 * Pure: these are rules about records, not the reading of them (§2.1). The
 * service supplies what it loaded and renders what comes back.
 */

/** The subset of an article's progress record these rules need. */
export interface ReadingProgress {
  id: string;
  /** When the article was last opened, or absent for records written before this existed. */
  openedAt?: number | null;
  /** When it was last finished, or null if never. */
  readAt: number | null;
  /** Segment indices currently flagged "didn't know". */
  flaggedIndices?: readonly number[];
  /** Segment index at the top of the viewport when the reader last left. */
  progressIndex?: number | null;
  /** How many segments the text had when that index was taken. */
  progressTotal?: number | null;
  /**
   * How many segments preceded the body when these indices were taken.
   *
   * The headline became part of the segment stream so that marking a word in it
   * counts exactly as marking one below it does. That shifted every index by
   * the length of the title, so stored positions say which base they were
   * written against. Absent means a record written when the body started at
   * zero.
   */
  titleOffset?: number | null;
}

/**
 * Moves stored indices onto the current base.
 *
 * Applied once when an article is opened, and written straight back, so that
 * everything downstream works in one numbering. Without it, adding the headline
 * to the stream would have silently slid every previously flagged word along by
 * the length of the title — highlighting the wrong words, and leaving the right
 * ones marked with no way to unmark them.
 */
export function rebaseIndices(
  record: ReadingProgress | null,
  titleOffset: number,
): { flaggedIndices: number[]; progressIndex: number | null; titleOffset: number } {
  const stored = record?.titleOffset ?? 0;
  const shift = titleOffset - stored;
  const flagged = record?.flaggedIndices ?? [];

  return {
    flaggedIndices: flagged
      .map((index) => index + shift)
      .filter((index) => index >= 0)
      .sort((a, b) => a - b),
    progressIndex:
      record?.progressIndex == null ? null : Math.max(0, record.progressIndex + shift),
    titleOffset,
  };
}

/**
 * How far in, 0–1.
 *
 * Measured against the segment count stored with the index, not against a word
 * count: the index counts every segment, punctuation and paragraph breaks
 * included, so dividing by words overstates it — a third of the way in read as
 * five sixths. Zero when nothing has been stored, which is the honest answer
 * for a reading that has not moved.
 */
export function readingFraction(record: ReadingProgress | null): number {
  const index = record?.progressIndex ?? 0;
  const total = record?.progressTotal ?? 0;
  if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, index / total));
}

/**
 * Whether this article is open rather than done.
 *
 * Compared against readAt rather than simply being "readAt is null", so
 * reopening a finished article counts as reading it again without costing it
 * the "read" mark it earned. Records written before openedAt existed have no
 * opening to compare and are never in progress — the alternative is announcing
 * a "currently reading" for every article the learner has ever finished.
 */
export function isInProgress(record: ReadingProgress): boolean {
  const openedAt = record.openedAt ?? null;
  if (openedAt === null) return false;
  return openedAt > (record.readAt ?? 0);
}

/**
 * The article to offer picking back up, or null when there is none.
 *
 * The most recently opened wins: opening a second article is the clearest
 * possible statement about which one is current, and two half-read articles
 * competing for one line is worse than being one tap from the library.
 */
export function pickCurrentReading<T extends ReadingProgress>(
  records: readonly T[],
): T | null {
  let best: T | null = null;
  for (const record of records) {
    if (!isInProgress(record)) continue;
    if (best === null || (record.openedAt ?? 0) > (best.openedAt ?? 0)) best = record;
  }
  return best;
}

/**
 * Where to put the reader back, or null to start at the top.
 *
 * Clamped against the text actually in front of them: a stored index outlives
 * the reading it came from, and a re-import or a re-segmentation can leave it
 * pointing past the end. Scrolling to nowhere looks like an empty article.
 */
export function resumeIndex(
  record: ReadingProgress | null,
  segmentCount: number,
): number | null {
  const index = record?.progressIndex ?? null;
  if (index === null || segmentCount <= 0) return null;
  if (!Number.isFinite(index) || index <= 0) return null;
  return Math.min(Math.floor(index), segmentCount - 1);
}
