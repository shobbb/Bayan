/**
 * Drill session assembly (§10).
 *
 * "Queue = current batch + all due SRS cards, interleaved. Modes rotate across
 * the session so the learner sees each word through more than one retrieval
 * path."
 */
import type { Word, WordId } from '@/domain/types';
import type { Scheduler } from '@/domain/srs/scheduler';
import { hasGloss, type GlossLanguage } from '@/domain/glossLanguage';
import type { DrillModeId } from './types';

/** Rotation order. Recognition first, free recall last — increasing difficulty. */
export const MODE_ROTATION: readonly DrillModeId[] = ['flashcard', 'multipleChoice', 'writeIn'];

/**
 * The same rotation with writing dropped, for Arabic-only definitions (§13).
 *
 * Not a softening of the method. Write-in is the strictest retrieval path
 * because producing the answer is harder than recognising it — but that holds
 * only when producing it is the part being measured. Typing an Arabic
 * definition on an English keyboard measures the keyboard: the learner who
 * knows the word perfectly still fails, and the one who reaches for a
 * transliteration tool has left the retrieval entirely. What remains is the two
 * modes whose difficulty is still about the word.
 */
export const ARABIC_MODE_ROTATION: readonly DrillModeId[] = ['flashcard', 'multipleChoice'];

/** The rotation for the active definition language. */
export function modeRotationFor(language: GlossLanguage): readonly DrillModeId[] {
  return language === 'arabic' ? ARABIC_MODE_ROTATION : MODE_ROTATION;
}

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
  /** Which definitions the session drills, which decides the rotation (§13). */
  glossLanguage: GlossLanguage;
}

/**
 * Assigns each word its retrieval mode from its position in the rotation, so
 * consecutive cards exercise different paths rather than repeating one.
 *
 * Separate from queue building because the order is decided upstream — by the
 * batch/due interleave here, or by the spacing sort a study source applies
 * (see studySources.ts) — and the mode rotation is the same either way.
 *
 * The language is a required argument rather than one defaulting to English:
 * a call site that forgot it would quietly ask an Arabic-only learner to type
 * an English answer, and that failure is invisible until it is in front of
 * somebody mid-session.
 */
export function withModes(words: readonly Word[], language: GlossLanguage): QueueEntry[] {
  const rotation = modeRotationFor(language);
  return words.map((word, index) => ({
    word,
    mode: rotation[index % rotation.length]!,
  }));
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
  glossLanguage,
}: BuildQueueOptions): QueueEntry[] {
  const byId = new Map(words.map((word) => [word.id, word]));

  // A word with no definition in the active language has no answer side, so it
  // is not a card (REQ-23). This bites when the setting changes under an
  // existing batch: those words are still owed an Arabic definition, and a
  // blank card is a worse way to say so than simply not dealing it.
  const drillable = (word: Word) => hasGloss(word, glossLanguage);

  const batch = batchWordIds
    .map((id) => byId.get(id))
    .filter((word): word is Word => word !== undefined && drillable(word));

  const batchIds = new Set(batch.map((word) => word.id));
  const due = words.filter(
    (word) =>
      !batchIds.has(word.id) &&
      word.srs !== null &&
      scheduler.isDue(word.srs, now) &&
      drillable(word),
  );

  return withModes(interleave(batch, due), glossLanguage);
}

export interface SessionSummary {
  total: number;
  /** Quizlet's two buckets (§10.6): what was recalled, and what still is not. */
  known: number;
  stillLearning: number;
  missed: Word[];
}

/** §10.5: the two counts plus the missed items, which "Keep reviewing" narrows to. */
export function summarizeSession(
  results: readonly { word: Word; correct: boolean }[],
): SessionSummary {
  const missed = results.filter((result) => !result.correct).map((result) => result.word);
  return {
    total: results.length,
    known: results.length - missed.length,
    stillLearning: missed.length,
    missed,
  };
}

/**
 * Where the round boundaries fall in a queue (§10.6).
 *
 * Returned as boundaries rather than as sliced sub-arrays because the queue
 * index is the session's one source of truth for position — handing the caller
 * a second numbering to keep in step with it is how the progress bar and the
 * card being shown drift apart.
 */
export function roundBoundsFor(
  queueLength: number,
  roundSize: number,
  index: number,
): { round: number; roundCount: number; start: number; end: number; positionInRound: number } {
  const size = Math.max(1, Math.floor(roundSize));
  const roundCount = Math.max(1, Math.ceil(queueLength / size));
  const round = Math.min(roundCount - 1, Math.floor(index / size));
  const start = round * size;
  return {
    round,
    roundCount,
    start,
    end: Math.min(queueLength, start + size),
    positionInRound: index - start,
  };
}

/** True at a round boundary that is not the end of the queue (§10.6). */
export function isCheckpoint(queueLength: number, roundSize: number, index: number): boolean {
  const size = Math.max(1, Math.floor(roundSize));
  return index > 0 && index < queueLength && index % size === 0;
}

/**
 * The follow-up pass over what was missed (§10.5). Modes rotate again rather
 * than repeating the one the word was just missed in — a second look through
 * the same retrieval path mostly measures short-term memory of the last screen.
 */
export function reviewQueueFor(
  missed: readonly Word[],
  previous: readonly QueueEntry[],
  language: GlossLanguage,
): QueueEntry[] {
  const rotation = modeRotationFor(language);
  const lastMode = new Map(previous.map((entry) => [entry.word.id, entry.mode]));

  return missed.map((word, index) => {
    const seen = lastMode.get(word.id);
    // indexOf is -1 for a mode not in this rotation — a card missed in write-in
    // before the setting changed — which lands the offset back at 0 rather than
    // throwing away the "not the same mode again" intent entirely.
    const seenAt = seen === undefined ? -1 : rotation.indexOf(seen);
    const offset = seenAt === -1 ? 0 : seenAt + 1;
    return { word, mode: rotation[(offset + index) % rotation.length]! };
  });
}
