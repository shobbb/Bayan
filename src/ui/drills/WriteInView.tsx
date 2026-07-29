import { useEffect, useRef, useState } from 'react';
import type { DrillItem, DrillOutcome } from '@/domain/drills/types';
import './drills.css';

export interface WriteInViewProps {
  item: DrillItem;
  outcome: DrillOutcome | null;
  onRespond: (typed: string) => void;
  onAdvance: () => void;
  onOverride: () => void;
}

/**
 * §10.4. Free recall. The canonical gloss is shown either way (REQ-26); a
 * near miss credited by typo tolerance shows what was typed beside it so the
 * discrepancy is visible (REQ-41); and a rejection can be overruled, because
 * gloss matching is imperfect and the learner arbitrates (REQ-42).
 */
export function WriteInView({
  item,
  outcome,
  onRespond,
  onAdvance,
  onOverride,
}: WriteInViewProps) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const answered = outcome !== null;

  useEffect(() => {
    setTyped('');
    inputRef.current?.focus();
  }, [item]);

  return (
    <div className="drill">
      <div className="drill__prompt">
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
      </div>

      <div className="drill__controls">
        {answered ? (
          <div className="drill__answer">
            <p className={outcome.correct ? 'drill__verdict--right' : 'drill__verdict--wrong'}>
              {outcome.correct ? 'Correct' : 'Not quite'}
            </p>
            <p className="drill__gloss">{outcome.canonical}</p>
            {outcome.acceptedAs && (
              <p className="drill__hint">You wrote “{outcome.acceptedAs}”.</p>
            )}
            <div className="drill__row">
              <button type="button" className="drill__advance" onClick={onAdvance}>
                Continue
              </button>
              {!outcome.correct && (
                <button type="button" className="drill__secondary" onClick={onOverride}>
                  I was right
                </button>
              )}
            </div>
          </div>
        ) : (
          <form
            className="drill__form"
            onSubmit={(event) => {
              event.preventDefault();
              onRespond(typed);
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="drill__input"
              value={typed}
              placeholder="English"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
            />
            <button type="submit" className="drill__advance">
              Check
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
