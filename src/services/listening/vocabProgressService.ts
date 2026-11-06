/**
 * Saving a listening lesson's flashcards as they go, so leaving the deck
 * halfway does not cost the reader their place.
 */
import type { DrillSnapshot } from '@/domain/drills/snapshot';
import {
  getListeningVocabProgress,
  putListeningVocabProgress,
} from '@/data/listeningVocabRepository';

export async function loadLessonVocabProgress(lessonId: string): Promise<DrillSnapshot | null> {
  return (await getListeningVocabProgress(lessonId))?.snapshot ?? null;
}

export async function saveLessonVocabProgress(
  lessonId: string,
  snapshot: DrillSnapshot,
  now = Date.now(),
): Promise<void> {
  await putListeningVocabProgress({ lessonId, snapshot, updatedAt: now });
}
