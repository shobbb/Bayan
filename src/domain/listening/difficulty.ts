/**
 * How hard a listening lesson is to follow, from how fast it is spoken.
 *
 * Words per minute over the whole recording: the transcript's word count
 * against the recording's length. Pauses count against the rate, which is the
 * point — a recording with room between sentences is easier to follow than
 * one without.
 *
 * Ranked rather than thresholded, into the same five steps the article
 * gallery uses: like the articles' difficulty, it orders these lessons against
 * each other and means nothing in absolute terms. Lessons without a
 * transcript have no rate and so no level.
 */
import type { ListeningLesson } from './types';

/** Runs of Arabic letters or digits; punctuation and bullets are not words. */
const WORD = /[ء-ي٠-٩0-9]+/g;

export function speakingRate(lesson: ListeningLesson): number | null {
  if (!lesson.transcript || lesson.transcript.length === 0 || lesson.durationSec <= 0) return null;
  const words = lesson.transcript.reduce(
    (count, paragraph) => count + (paragraph.match(WORD)?.length ?? 0),
    0,
  );
  return words === 0 ? null : (words / lesson.durationSec) * 60;
}

export const LISTENING_LEVELS = 5;

/** Each lesson's level, 1 (slowest) to 5 (fastest), by id. */
export function listeningDifficulty(lessons: readonly ListeningLesson[]): Map<string, number> {
  const rated = lessons
    .map((lesson) => ({ id: lesson.id, rate: speakingRate(lesson) }))
    .filter((entry): entry is { id: string; rate: number } => entry.rate !== null)
    .sort((a, b) => a.rate - b.rate);

  const levels = new Map<string, number>();
  rated.forEach((entry, rank) => {
    levels.set(entry.id, Math.floor((rank * LISTENING_LEVELS) / rated.length) + 1);
  });
  return levels;
}
