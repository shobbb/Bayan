/**
 * What a study session is drawn from (§10).
 *
 * A registry rather than a branch at the call site, for the same reason the
 * round types and drill modes are registries (REQ-E2): adding a way to study is
 * adding a descriptor here, and no view ever switches on which one was picked.
 *
 * A source decides *which* words. It never decides their order — every source
 * hands its selection to the same spacing sort below, so "drill what I got
 * wrong this week" and "drill the last batch" are the same scheduler seen
 * through two different windows, not two different study algorithms.
 */
import type { Word, WordId } from '@/domain/types';
import type { Scheduler } from '@/domain/srs/scheduler';
import { missRate } from '@/domain/selector/wordDraw';
import { buildSessionQueue, withModes, type QueueEntry } from './session';

export type StudySourceId = 'lastBatch' | 'recentlyMarked';

export interface StudySourceContext {
  words: readonly Word[];
  /** The current batch, which is what one of the sources is. */
  batchWordIds: readonly WordId[];
  scheduler: Scheduler;
  now: number;
  /** Window for the recently-marked source, in days. */
  markedWithinDays: number;
}

export interface StudySource {
  readonly id: StudySourceId;
  readonly label: string;
  /** One line on what this draws from, shown under the label. */
  hint(ctx: StudySourceContext): string;
  build(ctx: StudySourceContext): QueueEntry[];
}

const DAY_MS = 86_400_000;

/** A word can only be a card if it has an answer side (REQ-23). */
function isDrillable(word: Word): boolean {
  return word.gloss.trim() !== '';
}

export function markedSince(ctx: StudySourceContext): number {
  return ctx.now - Math.max(1, ctx.markedWithinDays) * DAY_MS;
}

/**
 * Words flagged "didn't know" inside the window.
 *
 * A record whose flag date is unknown — anything written before the app stored
 * one — is outside every window. "Was this marked this week" has no yes to give
 * for a word whose date nobody recorded.
 */
export function recentlyMarkedWords(ctx: StudySourceContext): Word[] {
  const since = markedSince(ctx);
  return ctx.words.filter(
    (word) => isDrillable(word) && word.lastMarkedAt != null && word.lastMarkedAt >= since,
  );
}

/**
 * Spacing order: overdue first, then never drilled, then not yet due.
 *
 * This is the "sort by what memory needs" half of the scheduler, applied to a
 * set somebody else chose. Within the overdue group the most overdue leads,
 * because that is the card closest to being forgotten; within the untouched
 * group the most-missed leads, since nothing else is known about it yet.
 */
export function orderBySpacing(
  words: readonly Word[],
  scheduler: Scheduler,
  now: number,
): Word[] {
  function group(word: Word): number {
    if (word.srs === null) return 1; // never drilled
    return scheduler.isDue(word.srs, now) ? 0 : 2;
  }

  return [...words].sort((a, b) => {
    const byGroup = group(a) - group(b);
    if (byGroup !== 0) return byGroup;

    if (a.srs !== null && b.srs !== null) {
      // Ascending dueAt serves both the overdue group (longest overdue first)
      // and the not-yet-due group (soonest first).
      const byDue = a.srs.dueAt - b.srs.dueAt;
      if (byDue !== 0) return byDue;
    } else if (a.srs === null && b.srs === null) {
      const byMiss = missRate(b) - missRate(a);
      if (byMiss !== 0) return byMiss;
    }

    // Deterministic, so an unchanged corpus yields an unchanged session.
    return a.id.localeCompare(b.id);
  });
}

/**
 * The sources, in the order they are offered. `lastBatch` is first because it
 * is the one reached for daily.
 */
export const STUDY_SOURCES: readonly StudySource[] = [
  {
    id: 'lastBatch',
    label: 'Last batch',
    hint: () => 'The current batch, plus anything else that has come due',
    // Unchanged §10 behaviour: the batch interleaved with due cards, so a long
    // batch never buries the due ones behind it.
    build: (ctx) =>
      buildSessionQueue({
        batchWordIds: ctx.batchWordIds,
        words: ctx.words,
        scheduler: ctx.scheduler,
        now: ctx.now,
      }),
  },
  {
    id: 'recentlyMarked',
    label: 'Marked recently',
    hint: (ctx) => `Words you flagged in the last ${Math.max(1, ctx.markedWithinDays)} days`,
    // Deliberately not interleaved with due cards. Choosing this source is a
    // statement about what to study; folding the whole due pile back in would
    // make the choice meaningless.
    build: (ctx) => withModes(orderBySpacing(recentlyMarkedWords(ctx), ctx.scheduler, ctx.now)),
  },
];

export function getStudySource(id: StudySourceId): StudySource {
  const source = STUDY_SOURCES.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Unknown study source: ${id}`);
  return source;
}

/** How many cards each source would offer right now, for the chooser. */
export function studySourceCounts(
  ctx: StudySourceContext,
): Record<StudySourceId, number> {
  return {
    lastBatch: getStudySource('lastBatch').build(ctx).length,
    recentlyMarked: getStudySource('recentlyMarked').build(ctx).length,
  };
}
