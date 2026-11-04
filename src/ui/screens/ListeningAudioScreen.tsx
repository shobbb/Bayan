import { formatDuration, type ListeningLesson } from '@/domain/listening/types';
import './ListeningScreen.css';

export interface ListeningAudioScreenProps {
  lesson: ListeningLesson;
  onExit: () => void;
}

/**
 * The lesson's recording, with the system's own player: play, pause, scrub and
 * volume are all there already, and they are the controls the reader knows.
 */
export function LessonPlayer({ lesson }: { lesson: ListeningLesson }) {
  return (
    <audio className="listening__player" controls preload="metadata" src={lesson.audio}>
      Audio playback is not supported here.
    </audio>
  );
}

/**
 * A lesson with no transcript: the recording alone. A lesson with one opens in
 * the reader instead, with this player above its text.
 */
export function ListeningAudioScreen({ lesson, onExit }: ListeningAudioScreenProps) {
  return (
    <div className="listening">
      <button type="button" className="btn btn--text btn--back listening__exit" onClick={onExit}>
        ← Lesson
      </button>
      <h1 dir="rtl" lang="ar" className="listening__title listening__title--ar">
        {lesson.titleAr}
      </h1>
      <p className="listening__note">{formatDuration(lesson.durationSec)}</p>
      <LessonPlayer lesson={lesson} />
    </div>
  );
}
