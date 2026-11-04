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
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ListeningScreen({ onOpenLesson }: ListeningScreenProps) {
  const [lessons, setLessons] = useState<ListeningLesson[] | null>(null);
  const [tag, setTag] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    void listeningLessons().then((loaded) => {
      if (!cancelled) setLessons(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Most-used first, as the article gallery orders its topics, so the rail
  // opens on the tags worth scrolling to.
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lesson of lessons ?? []) {
      for (const name of lesson.tags) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [lessons]);

  const shown = useMemo(
    () => (lessons ?? []).filter((lesson) => tag === 'all' || lesson.tags.includes(tag)),
    [lessons, tag],
  );

  const groups = useMemo(() => {
    const byTopic = new Map<string, ListeningLesson[]>();
    for (const lesson of shown) {
      byTopic.set(lesson.topic, [...(byTopic.get(lesson.topic) ?? []), lesson]);
    }
    return [...byTopic.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown]);

  return (
    <div className="listening has-bottom-nav">
      <h1 className="listening__title">Listening</h1>
      <p className="listening__note">
        {lessons ? `${lessons.length} lessons, each a recording with its vocabulary.` : 'Loading…'}
      </p>

      {tags.length > 1 && (
        <div className="chip-rail" role="group" aria-label="Tag">
          {['all', ...tags].map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={tag === candidate}
              className={'chip' + (tag === candidate ? ' chip--on' : '')}
              onClick={() => setTag(candidate)}
            >
              {candidate === 'all' ? 'All topics' : capitalize(candidate)}
            </button>
          ))}
        </div>
      )}

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
                    {/* Marked only where there is one: about a third of the
                        lessons, and the ones whose words can be tapped. */}
                    {lesson.transcript && (
                      <span className="listening__badge" title="Has transcript">
                        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                          <path
                            d="M3 3.5h10M3 6.5h10M3 9.5h10M3 12.5h6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                        Transcript
                      </span>
                    )}
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
