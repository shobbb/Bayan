import { useEffect, useMemo, useState } from 'react';
import { formatDuration, type ListeningLesson } from '@/domain/listening/types';
import { listeningLessons } from '@/services/listening/listeningService';
import './ListeningScreen.css';

export interface ListeningScreenProps {
  onOpenLesson: (lesson: ListeningLesson) => void;
}

/**
 * The listening catalog: every lesson, grouped by subject. A lesson is a
 * recording and its glossary, and either can be opened from the lesson itself.
 */
export function ListeningScreen({ onOpenLesson }: ListeningScreenProps) {
  const [lessons, setLessons] = useState<ListeningLesson[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listeningLessons().then((loaded) => {
      if (!cancelled) setLessons(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const byTopic = new Map<string, ListeningLesson[]>();
    for (const lesson of lessons ?? []) {
      byTopic.set(lesson.topic, [...(byTopic.get(lesson.topic) ?? []), lesson]);
    }
    return [...byTopic.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [lessons]);

  return (
    <div className="listening has-bottom-nav">
      <h1 className="listening__title">Listening</h1>
      <p className="listening__note">
        {lessons ? `${lessons.length} lessons, each a recording with its vocabulary.` : 'Loading…'}
      </p>

      {groups.map(([topic, inTopic]) => (
        <section key={topic} className="listening__group">
          <h2 className="listening__topic">{topic}</h2>
          <ul className="listening__list">
            {inTopic.map((lesson) => (
              <li key={lesson.id}>
                <button
                  type="button"
                  className="tile listening__lesson"
                  onClick={() => onOpenLesson(lesson)}
                >
                  <span dir="rtl" lang="ar" className="listening__lesson-title">
                    {lesson.titleAr}
                  </span>
                  <span className="listening__lesson-meta">
                    {lesson.cards.length} words · {formatDuration(lesson.durationSec)}
                  </span>
                  <span dir="rtl" lang="ar" className="listening__lesson-preview">
                    {lesson.cards
                      .slice(0, 3)
                      .map((card) => card.arabic)
                      .join('، ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
