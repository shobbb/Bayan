/** Repository over each listening lesson's saved flashcard session. */
import { db, type ListeningVocabProgressRecord } from './db';

export async function getListeningVocabProgress(
  lessonId: string,
): Promise<ListeningVocabProgressRecord | undefined> {
  return db.listeningVocabProgress.get(lessonId);
}

export async function putListeningVocabProgress(record: ListeningVocabProgressRecord): Promise<void> {
  await db.listeningVocabProgress.put(record);
}
