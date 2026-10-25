import { useState } from 'react';
import type { ComprehensionQuestion } from '@/domain/articles/comprehension';
import '@/ui/drills/drills.css';
import './QuestionsScreen.css';

export interface QuestionsScreenProps {
  titleAr: string;
  questions: readonly ComprehensionQuestion[];
  /** Back to the article, from any question or from the end. */
  onExit: () => void;
}

/**
 * Multiple-choice comprehension questions on the article just read.
 *
 * One question at a time, four options as full-width tap targets, laid out like
 * the drill's multiple choice so the two read as the same gesture. On a tap the
 * right option is marked and, when wrong, the chosen one too. Nothing is
 * recorded: this checks understanding of a text, and the corpus measures words.
 */
export function QuestionsScreen({ titleAr, questions, onExit }: QuestionsScreenProps) {
  const [position, setPosition] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const finished = position >= questions.length;
  const question = finished ? undefined : questions[position];

  function respond(index: number) {
    if (chosen !== null || !question) return;
    setChosen(index);
    if (index === question.correctIndex) setCorrectCount((n) => n + 1);
  }

  function advance() {
    setChosen(null);
    setPosition((n) => n + 1);
  }

  function restart() {
    setChosen(null);
    setCorrectCount(0);
    setPosition(0);
  }

  function stateFor(index: number): string {
    if (chosen === null || !question) return '';
    if (index === question.correctIndex) return ' drill__option--correct';
    return index === chosen ? ' drill__option--wrong' : '';
  }

  return (
    <div className="questions-screen">
      <button type="button" className="questions-screen__exit" onClick={onExit}>
        ← Article
      </button>

      <h1 dir="rtl" lang="ar" className="questions-screen__title">
        {titleAr}
      </h1>

      {question ? (
        <div className="questions-screen__question">
          <p className="questions-screen__progress">
            Question {position + 1} of {questions.length}
          </p>
          <p dir="rtl" lang="ar" className="questions-screen__prompt">
            {question.prompt}
          </p>

          <ul className="drill__options">
            {question.options.map((option, index) => (
              <li key={index}>
                <button
                  type="button"
                  className={'drill__option questions-screen__option' + stateFor(index)}
                  disabled={chosen !== null}
                  onClick={() => respond(index)}
                >
                  <span dir="rtl" lang="ar" className="drill__option-text--arabic">
                    {option}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {chosen !== null && (
            <button type="button" className="drill__advance" onClick={advance}>
              {position + 1 < questions.length ? 'Next question' : 'See result'}
            </button>
          )}
        </div>
      ) : (
        <div className="questions-screen__result" role="status">
          <p className="questions-screen__score">
            {correctCount} of {questions.length} correct
          </p>
          <div className="questions-screen__result-actions">
            <button type="button" className="drill__advance" onClick={onExit}>
              Back to the article
            </button>
            <button type="button" className="drill__secondary" onClick={restart}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
