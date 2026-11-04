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
export function ListeningAudioScreen({ lesson, onExit }: ListeningAudioScreenProps) {
  return (
    <div className="listening">
      <button type="button" className="listening__exit" onClick={onExit}>
        ← {lesson.topic} {lesson.number}
      </button>
      <h1 className="listening__title">
        {lesson.topic} {lesson.number}
      </h1>
      <p className="listening__note">{formatDuration(lesson.durationSec)}</p>

      <audio className="listening__player" controls preload="metadata" src={lesson.audio}>
        Audio playback is not supported here.
      </audio>
    </div>
  );
}
