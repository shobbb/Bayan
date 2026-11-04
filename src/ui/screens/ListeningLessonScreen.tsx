import { formatDuration, type ListeningLesson } from '@/domain/listening/types';
import './ListeningScreen.css';

export interface ListeningLessonScreenProps {
  lesson: ListeningLesson;
  onVocab: () => void;
  onAudio: () => void;
  onExit: () => void;
}

/** One lesson: its vocabulary as flashcards, or its recording. */
export function ListeningLessonScreen({
  lesson,
  onVocab,
  onAudio,
  onExit,
}: ListeningLessonScreenProps) {
  return (
    <div className="listening">
      <button type="button" className="btn btn--text btn--back listening__exit" onClick={onExit}>
        ← Listening
      </button>
      <h1 dir="rtl" lang="ar" className="listening__title listening__title--ar">
        {lesson.titleAr}
      </h1>
      <p className="listening__note">
        {lesson.topic} · {lesson.id}
      </p>

      <div className="listening__choices">
        <button type="button" className="tile listening__choice" onClick={onVocab}>
          <span className="listening__choice-name">Vocabulary</span>
          <span className="listening__lesson-meta">{lesson.cards.length} flashcards</span>
        </button>
        <button type="button" className="tile listening__choice" onClick={onAudio}>
          <span className="listening__choice-name">Audio</span>
          <span className="listening__lesson-meta">{formatDuration(lesson.durationSec)}</span>
        </button>
      </div>
    </div>
  );
}
