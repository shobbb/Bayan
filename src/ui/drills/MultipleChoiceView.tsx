import type { DrillItem, DrillOutcome } from '@/domain/drills/types';
import './drills.css';

export interface MultipleChoiceViewProps {
  item: DrillItem;
  outcome: DrillOutcome | null;
  onRespond: (index: number) => void;
  onAdvance: () => void;
}

/**
 * §10.3. Arabic prompt, four English options as full-width tap targets. On
 * selection the correct option is marked and, when wrong, the chosen one is
 * marked too — so the learner sees both.
 */
export function MultipleChoiceView({
  item,
  outcome,
  onRespond,
  onAdvance,
}: MultipleChoiceViewProps) {
  const answered = outcome !== null;

  function stateFor(index: number): string {
    if (!answered) return '';
    if (index === item.correctIndex) return ' drill__option--correct';
    // Only the option the learner actually chose is marked wrong.
    return outcome.correct ? '' : ' drill__option--wrong';
  }

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
        <ul className="drill__options">
          {item.options.map((option, index) => (
            <li key={option}>
              <button
                type="button"
                className={'drill__option' + stateFor(index)}
                disabled={answered}
                onClick={() => onRespond(index)}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>

        {answered && (
          <button type="button" className="drill__advance" onClick={onAdvance}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
