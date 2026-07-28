/**
 * Stats computation (§11). Every figure the Stats view shows is derived here —
 * no component recomputes a metric, so a number shown in two places is
 * computed once (REQ-44). Pure: takes rows as arguments, reads no DB (§2.1).
 */
import type { Round, Word, WordId } from '@/domain/types';
import { missRate } from '@/domain/selector/wordDraw';
import { roundFlagRate } from '@/domain/selector/roundPlanner';

export type WordStatus =
  | 'neverFlagged'
  | 'flaggedThenPassed'
  | 'stillFailing'
  | 'flaggedOnceNeverReshown'
  /** In the corpus but never shown — the backlog pool. Outside the §11 buckets. */
  | 'notYetShown';

export const WORD_STATUS_LABELS: Readonly<Record<WordStatus, string>> = {
  neverFlagged: 'never flagged',
  flaggedThenPassed: 'flagged, then passed',
  stillFailing: 'still failing',
  flaggedOnceNeverReshown: 'flagged once, never re-shown',
  notYetShown: 'not yet shown',
};

/**
 * Buckets derive from aggregate counts, which is all a Word carries:
 * flagged on every showing reads as still failing; flagged on some but not all
 * means the learner has passed it at least once since.
 */
export function wordStatus(word: Word): WordStatus {
  if (word.seenCount === 0) return 'notYetShown';
  if (word.unclearCount === 0) return 'neverFlagged';
  // Seen once and flagged that once: untested, not yet a failure (REQ-28).
  if (word.seenCount === 1) return 'flaggedOnceNeverReshown';
  return word.unclearCount >= word.seenCount ? 'stillFailing' : 'flaggedThenPassed';
}

export function statusCounts(words: readonly Word[]): Record<WordStatus, number> {
  const counts: Record<WordStatus, number> = {
    neverFlagged: 0,
    flaggedThenPassed: 0,
    stillFailing: 0,
    flaggedOnceNeverReshown: 0,
    notYetShown: 0,
  };
  for (const word of words) counts[wordStatus(word)] += 1;
  return counts;
}

/**
 * REQ-28: passed / (passed + stillFailing), over words seen >= 2 only. Words
 * seen once are untested, not failures — including them understates the figure
 * by roughly 3x. Returns null when nothing has been tested yet rather than a
 * misleading zero.
 */
export function acquisitionRate(words: readonly Word[]): number | null {
  const tested = words.filter((word) => word.seenCount >= 2);
  let passed = 0;
  let failing = 0;

  for (const word of tested) {
    const status = wordStatus(word);
    if (status === 'flaggedThenPassed') passed += 1;
    else if (status === 'stillFailing') failing += 1;
  }

  const denominator = passed + failing;
  return denominator === 0 ? null : passed / denominator;
}

export interface StatsSummary {
  /** REQ-29: never presented as vocabulary size — inflections are separate rows. */
  formsTracked: number;
  statusCounts: Record<WordStatus, number>;
  acquisitionRate: number | null;
  roundsCompleted: number;
}

export function summarize(words: readonly Word[], rounds: readonly Round[]): StatsSummary {
  return {
    formsTracked: words.length,
    statusCounts: statusCounts(words),
    acquisitionRate: acquisitionRate(words),
    roundsCompleted: rounds.length,
  };
}

export interface WordBreakdownRow {
  id: WordId;
  surface: string;
  gloss: string;
  seenCount: number;
  unclearCount: number;
  missRate: number;
  lastSeenAt: number;
  status: WordStatus;
  roundIds: string[];
}

export function toBreakdownRows(words: readonly Word[]): WordBreakdownRow[] {
  return words.map((word) => ({
    id: word.id,
    surface: word.surface,
    gloss: word.gloss,
    seenCount: word.seenCount,
    unclearCount: word.unclearCount,
    missRate: missRate(word), // single definition, shared with the selector (REQ-44)
    lastSeenAt: word.lastSeenAt,
    status: wordStatus(word),
    roundIds: word.roundIds,
  }));
}

export type BreakdownSort = 'missRate' | 'seenCount' | 'lastSeen';

/** Matches REQ-28's threshold: below this a form is untested, not failing. */
const TESTED_THRESHOLD = 2;

/**
 * REQ-45: default sort is miss rate descending across forms seen >= 2. Forms
 * seen once sort last regardless of rate — a single flag is not a failure
 * rate, and letting them top the list would misrepresent what is going wrong.
 */
export function sortBreakdown(
  rows: readonly WordBreakdownRow[],
  sort: BreakdownSort = 'missRate',
): WordBreakdownRow[] {
  const sorted = [...rows];

  if (sort === 'seenCount') {
    return sorted.sort((a, b) => b.seenCount - a.seenCount || a.surface.localeCompare(b.surface));
  }
  if (sort === 'lastSeen') {
    return sorted.sort((a, b) => b.lastSeenAt - a.lastSeenAt || a.surface.localeCompare(b.surface));
  }

  return sorted.sort((a, b) => {
    const aTested = a.seenCount >= TESTED_THRESHOLD;
    const bTested = b.seenCount >= TESTED_THRESHOLD;
    if (aTested !== bTested) return aTested ? -1 : 1;
    return b.missRate - a.missRate || b.seenCount - a.seenCount;
  });
}

export function filterByStatus(
  rows: readonly WordBreakdownRow[],
  status: WordStatus | 'all',
): WordBreakdownRow[] {
  return status === 'all' ? [...rows] : rows.filter((row) => row.status === status);
}

export interface CategoryPerformance {
  key: string;
  /** Mean flag rate across rounds with a recorded outcome; null when none have one. */
  flagRate: number | null;
  /** Surfaced next to every rate — a single round is not a signal (§11). */
  sampleSize: number;
}

function performanceBy(
  rounds: readonly Round[],
  key: (round: Round) => string,
): CategoryPerformance[] {
  const groups = new Map<string, Round[]>();
  for (const round of rounds) {
    const group = groups.get(key(round));
    if (group) group.push(round);
    else groups.set(key(round), [round]);
  }

  const entries: CategoryPerformance[] = [];
  for (const [name, group] of groups) {
    const rates = group
      .map((round) => roundFlagRate(round))
      .filter((rate): rate is number => rate !== null);
    entries.push({
      key: name,
      flagRate: rates.length > 0 ? rates.reduce((sum, r) => sum + r, 0) / rates.length : null,
      sampleSize: group.length,
    });
  }

  return entries.sort((a, b) => (b.flagRate ?? -1) - (a.flagRate ?? -1) || a.key.localeCompare(b.key));
}

export function performanceByTopic(rounds: readonly Round[]): CategoryPerformance[] {
  return performanceBy(rounds, (round) => round.topic);
}

export function performanceByFormat(rounds: readonly Round[]): CategoryPerformance[] {
  return performanceBy(rounds, (round) => round.format);
}

export function performanceByRoundType(rounds: readonly Round[]): CategoryPerformance[] {
  return performanceBy(rounds, (round) => round.roundType);
}

export interface RoundHistoryEntry {
  id: string;
  createdAt: number;
  roundType: string;
  topic: string;
  format: string;
  flagRate: number | null;
  /** REQ-I6: history-only rounds carry no segments and cannot be re-read. */
  replayable: boolean;
}

export function toHistory(rounds: readonly Round[]): RoundHistoryEntry[] {
  return [...rounds]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((round) => ({
      id: round.id,
      createdAt: round.createdAt,
      roundType: round.roundType,
      topic: round.topic,
      format: round.format,
      flagRate: roundFlagRate(round),
      replayable: round.segments.length > 0,
    }));
}
