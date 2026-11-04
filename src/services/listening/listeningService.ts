/**
 * The listening catalog. Code-split, like the definitions: it is dead weight
 * on every screen but this one.
 */
import type { ListeningLesson } from '@/domain/listening/types';

interface LessonsFile {
  version: number;
  lessons: ListeningLesson[];
}

let loaded: ListeningLesson[] | null = null;

export async function listeningLessons(): Promise<ListeningLesson[]> {
  if (loaded) return loaded;
  const { default: file } = (await import('@/assets/listening/lessons.json')) as unknown as {
    default: LessonsFile;
  };
  loaded = file.lessons;
  return loaded;
}
