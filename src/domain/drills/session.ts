/**
 * Drill session assembly (§10).
 *
 * "Queue = current batch + all due SRS cards, interleaved. Modes rotate across
 * the session so the learner sees each word through more than one retrieval
 * path."
 */
import type { Word, WordId } from '@/domain/types';
import type { Scheduler } from '@/domain/srs/scheduler';
import type { DrillModeId } from './types';

/** Rotation order. Recognition first, free recall last — increasing difficulty. */
export const MODE_ROTATION: readonly DrillModeId[] = ['flashcard', 'multipleChoice', 'writeIn'];

export interface QueueEntry {
  word: Word;
  mode: DrillModeId;
}

/**
 * Interleaves two sources so a long batch never buries the due cards behind it
 * (or the reverse). Alternates while both have entries, then drains.
 */
function interleave<T>(a: readonly T[], b: readonly T[]): T[] {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const first = a[i];
    const second = b[i];
    if (first !== undefined) out.push(first);
    if (second !== undefined) out.push(second);
  }
  return out;
}

export interface BuildQueueOptions {
  batchWordIds: readonly WordId[];
  words: readonly Word[];
  scheduler: Scheduler;
  now: number;
}

/**
 * Builds the session queue. A word appears once; its mode comes from its
 * position in the rotation, so consecutive cards exercise different retrieval
 * paths rather than repeating one.
 */
export function buildSessionQueue({
  batchWordIds,
  words,
  scheduler,
  now,
}: BuildQueueOptions): QueueEntry[] {
  const byId = new Map(words.map((word) => [word.id, word]));

  const batch = batchWordIds
    .map((id) => byId.get(id))
    .filter((word): word is Word => word !== undefined);

  const batchIds = new Set(batch.map((word) => word.id));
  const due = words.filter(
    (word) => !batchIds.has(word.id) && word.srs !== null && scheduler.isDue(word.srs, now),
  );

  return interleave(batch, due).map((word, index) => ({
    word,
    mode: MODE_ROTATION[index % MODE_ROTATION.length]!,
  }));
}

export interface SessionSummary {
  total: number;
  correct: number;
  missed: Word[];
}

/** §10.5: correct count plus the missed items, which "Study again" narrows to. */
export function summarizeSession(results: readonly { word: Word; correct: boolean }[]): SessionSummary {
  const missed = results.filter((result) => !result.correct).map((result) => result.word);
  return { total: results.length, correct: results.length - missed.length, missed };
}
