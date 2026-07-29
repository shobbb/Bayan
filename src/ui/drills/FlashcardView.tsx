import { useEffect, useState } from 'react';
import type { DrillItem, SelfReport } from '@/domain/drills/types';
import './drills.css';

export interface FlashcardViewProps {
  item: DrillItem;
  onRespond: (report: SelfReport) => void;
}

/**
 * §10.2. Arabic on the front, tap to flip, then Still learning / Know it.
 *
 * The two buttons are the whole response. The view names neither a grade nor an
 * interval — it reports whether the word was known and lets domain decide what
 * that is worth (REQ-39), which is what keeps a scheduling change out of this
 * file entirely.
 *
 * The gloss appears below the Arabic rather than replacing it: the pairing is
 * the thing being learned, so both halves have to be on screen together.
 */
export function FlashcardView({ item, onRespond }: FlashcardViewProps) {
  const [flipped, setFlipped] = useState(false);

  // A new card always starts face down, including when the same component
  // instance is reused for the next word in the queue.
  useEffect(() => {
    setFlipped(false);
  }, [item.word.id, item.mode]);

  return (
    <div className="drill">
      <button
        type="button"
        className={'drill__card' + (flipped ? ' drill__card--flipped' : '')}
        onClick={() => setFlipped((current) => !current)}
        aria-expanded={flipped}
        aria-label={flipped ? 'Hide the translation' : 'Reveal the translation'}
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

        {flipped ? (
          <span className="drill__gloss">{item.word.gloss}</span>
        ) : (
          <span className="drill__flip-hint">Tap to flip</span>
        )}
      </button>

      <div className="drill__controls">
        {flipped ? (
          <div className="drill__report">
            <button
              type="button"
              className="drill__report-button"
              onClick={() => onRespond('stillLearning')}
            >
              Still learning
            </button>
            <button
              type="button"
              className="drill__report-button drill__report-button--known"
              onClick={() => onRespond('known')}
            >
              Know it
            </button>
          </div>
        ) : (
          <p className="drill__hint">Answer it in your head, then flip.</p>
        )}
      </div>
    </div>
  );
}
