import { useState } from 'react';
import type { DrillItem } from '@/domain/drills/types';
import type { Grade } from '@/domain/types';
import './drills.css';

export interface FlashcardViewProps {
  item: DrillItem;
  onRespond: (grade: Grade) => void;
}

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
];

/**
 * §10.2. Front is Arabic only; tapping reveals the gloss while the front stays
 * visible above it, so the pairing is seen together. The four grades map
 * straight to the scheduler with nothing in between (REQ-39).
 */
export function FlashcardView({ item, onRespond }: FlashcardViewProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="drill">
      <button
        type="button"
        className="drill__prompt drill__prompt--tappable"
        onClick={() => setRevealed(true)}
        aria-label={revealed ? undefined : 'Reveal the translation'}
      >
        <span dir="rtl" lang="ar" className="drill__arabic">
          {item.word.surface}
        </span>
        {item.word.forms && (
          <span dir="rtl" lang="ar" className="drill__forms">
            {item.word.forms}
          </span>
        )}
        {item.sentence && (
          <span dir="rtl" lang="ar" className="drill__sentence">
            {item.sentence}
          </span>
        )}
        {revealed && <span className="drill__gloss">{item.word.gloss}</span>}
      </button>

      <div className="drill__controls">
        {revealed ? (
          <div className="drill__grades">
            {GRADES.map((entry) => (
              <button
                key={entry.grade}
                type="button"
                className="drill__grade"
                onClick={() => {
                  setRevealed(false);
                  onRespond(entry.grade);
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="drill__hint">Tap the card to reveal.</p>
        )}
      </div>
    </div>
  );
}
