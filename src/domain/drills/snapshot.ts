/**
 * A drill session as it stands, in a form that can be stored and put back.
 *
 * By word id rather than by Word, so it survives the words being rebuilt — a
 * listening lesson's cards are made fresh from the bundle on every open — and
 * so a stored session never carries a stale copy of a word's record.
 */
import type { Word, WordId } from '@/domain/types';
import type { DrillModeId } from './types';
import type { QueueEntry } from './session';

export interface DrillSnapshot {
  /** The current pass, in order: the whole deck, or the review of what was missed. */
  session: { id: WordId; mode: DrillModeId }[];
  /** How far into it, which is also how many of `results` belong to this pass. */
  index: number;
  results: { id: WordId; correct: boolean }[];
  /** Counts from earlier passes, so a review reads as the same session continuing. */
  carried: { known: number; stillLearning: number };
  /** Paused at a checkpoint between rounds. */
  resting: boolean;
}

export interface RestoredDrill {
  session: QueueEntry[];
  index: number;
  results: { word: Word; correct: boolean }[];
  carried: { known: number; stillLearning: number };
  resting: boolean;
}

export function snapshotOf(state: RestoredDrill): DrillSnapshot {
  return {
    session: state.session.map((entry) => ({ id: entry.word.id, mode: entry.mode })),
    index: state.index,
    results: state.results.map((result) => ({ id: result.word.id, correct: result.correct })),
    carried: { ...state.carried },
    resting: state.resting,
  };
}

/**
 * Puts a stored session back against the words as they are now, or returns
 * null when there is nothing worth resuming.
 *
 * Nothing to resume is: a session whose words are no longer all there (the
 * deck changed under it, so its positions mean something else now), and one
 * that was finished with every card recalled — the next open is a fresh pass,
 * not a summary of the last one.
 */
export function restoreDrill(
  snapshot: DrillSnapshot | null | undefined,
  words: readonly Word[],
): RestoredDrill | null {
  if (!snapshot) return null;
  const byId = new Map(words.map((word) => [word.id, word] as const));

  const session: QueueEntry[] = [];
  for (const { id, mode } of snapshot.session) {
    const word = byId.get(id);
    if (!word) return null;
    session.push({ word, mode });
  }

  const results: { word: Word; correct: boolean }[] = [];
  for (const { id, correct } of snapshot.results) {
    const word = byId.get(id);
    if (!word) return null;
    results.push({ word, correct });
  }

  const index = Math.min(Math.max(0, Math.floor(snapshot.index)), session.length);
  if (session.length === 0) return null;

  const finished = index >= session.length;
  if (finished && results.every((result) => result.correct)) return null;

  return {
    session,
    index,
    results,
    carried: { ...snapshot.carried },
    resting: snapshot.resting && !finished,
  };
}
