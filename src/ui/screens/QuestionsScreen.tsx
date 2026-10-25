import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyProgress,
  isSettled,
  score,
  type ComprehensionProgress,
  type ComprehensionSet,
  type FreeResponseQuestion,
  type FreeResponseVerdict,
  type MultipleChoiceQuestion,
  type QuestionAnswer,
} from '@/domain/articles/comprehension';
import { describeFailure, type Failure } from '@/ui/failure';
import '@/ui/drills/drills.css';
import './QuestionsScreen.css';

export interface QuestionsScreenProps {
  titleAr: string;
  set: ComprehensionSet;
  /** Where the reader left off, or a fresh start. */
  initialProgress: ComprehensionProgress;
  /**
   * Called with every change worth keeping: an answer, a verdict, a move to
   * the next question — and the free-answer draft, a moment after typing stops.
   */
  onSave: (progress: ComprehensionProgress) => void;
  /** Marks a free answer. Rejects when the call fails; nothing is saved then. */
  onGrade: (question: FreeResponseQuestion, answer: string) => Promise<FreeResponseVerdict>;
  onOpenSettings: () => void;
  /** Back to the article, from any question or from the end. */
  onExit: () => void;
}

/** How long typing must pause before the draft is written. */
const DRAFT_SAVE_DELAY_MS = 600;

/**
 * Comprehension questions on the article just read, one at a time.
 *
 * Multiple choice is laid out like the drill's, so the two read as the same
 * gesture: a tap marks the right option and, when wrong, the chosen one too.
 * Free response is answered in the reader's own words and marked by a model,
 * which either passes it or says what is missing; the reader can rework it and
 * submit again, or move on.
 *
 * Saved as it goes, so leaving mid-way resumes on the same question with the
 * same draft. Nothing reaches the corpus: this checks understanding of a text,
 * and the corpus measures words.
 */
export function QuestionsScreen({
  titleAr,
  set,
  initialProgress,
  onSave,
  onGrade,
  onOpenSettings,
  onExit,
}: QuestionsScreenProps) {
  const [progress, setProgress] = useState(initialProgress);
  // The latest progress, for the grading call to build on when it returns.
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [grading, setGrading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  // A draft waiting to be written. Flushed when the screen goes away, so a
  // reader who types and backs out straight away keeps what they typed.
  const pendingDraft = useRef<ComprehensionProgress | null>(null);
  const draftTimer = useRef<number | null>(null);

  const flushDraft = useCallback(() => {
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    if (pendingDraft.current) onSave(pendingDraft.current);
    pendingDraft.current = null;
  }, [onSave]);

  useEffect(() => flushDraft, [flushDraft]);

  /** Applies a change and writes it now. */
  function commit(next: ComprehensionProgress) {
    pendingDraft.current = null;
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    setProgress(next);
    onSave(next);
  }

  function withAnswer(index: number, answer: QuestionAnswer): ComprehensionProgress {
    return {
      ...progress,
      answers: { ...progress.answers, [index]: answer },
      updatedAt: Date.now(),
    };
  }

  const position = progress.position;
  const finished = position >= set.questions.length;
  const question = finished ? undefined : set.questions[position];
  const answer = progress.answers[position];

  function advance() {
    setFailure(null);
    const next = position + 1;
    commit({
      ...progress,
      position: next,
      completedAt: next >= set.questions.length ? Date.now() : progress.completedAt,
      updatedAt: Date.now(),
    });
  }

  function restart() {
    setFailure(null);
    commit(emptyProgress(set, Date.now()));
  }

  function choose(index: number) {
    if (!question || question.kind !== 'multipleChoice' || answer) return;
    commit(
      withAnswer(position, {
        kind: 'multipleChoice',
        chosen: index,
        correct: index === question.correctIndex,
      }),
    );
  }

  function editDraft(text: string) {
    if (!question || question.kind !== 'freeResponse') return;
    const previous = answer?.kind === 'freeResponse' ? answer : null;
    const next = withAnswer(position, {
      kind: 'freeResponse',
      draft: text,
      submitted: previous?.submitted ?? null,
      verdict: previous?.verdict ?? null,
    });
    setProgress(next);
    pendingDraft.current = next;
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(flushDraft, DRAFT_SAVE_DELAY_MS);
  }

  function submit() {
    if (!question || question.kind !== 'freeResponse') return;
    const text = answer?.kind === 'freeResponse' ? answer.draft.trim() : '';
    if (text === '' || grading) return;
    const at = position;
    setFailure(null);
    setGrading(true);
    onGrade(question, text)
      .then((verdict) => {
        const current = progressRef.current;
        commit({
          ...current,
          answers: {
            ...current.answers,
            [at]: { kind: 'freeResponse', draft: text, submitted: text, verdict },
          },
          updatedAt: Date.now(),
        });
      })
      .catch((error: unknown) => setFailure(describeFailure(error)))
      .finally(() => setGrading(false));
  }

  const { correct, total } = score(set, progress);

  return (
    <div className="questions-screen">
      <button
        type="button"
        className="questions-screen__exit"
        onClick={() => {
          flushDraft();
          onExit();
        }}
      >
        ← Article
      </button>

      <h1 dir="rtl" lang="ar" className="questions-screen__title">
        {titleAr}
      </h1>

      {question ? (
        <div className="questions-screen__question">
          <p className="questions-screen__progress">
            Question {position + 1} of {set.questions.length}
            {question.kind === 'freeResponse' ? ' · in your own words' : ''}
          </p>
          <p dir="rtl" lang="ar" className="questions-screen__prompt">
            {question.prompt}
          </p>

          {question.kind === 'multipleChoice' ? (
            <MultipleChoice
              question={question}
              chosen={answer?.kind === 'multipleChoice' ? answer.chosen : null}
              onChoose={choose}
            />
          ) : (
            <FreeResponse
              answer={answer?.kind === 'freeResponse' ? answer : null}
              grading={grading}
              onEdit={editDraft}
              onSubmit={submit}
            />
          )}

          {failure && !grading && (
            <p className="questions-screen__failure" role="status">
              {failure.message}
              {failure.settingsWillHelp && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="questions-screen__link"
                    onClick={onOpenSettings}
                  >
                    Open Settings
                  </button>
                </>
              )}
            </p>
          )}

          {isSettled(answer) && !grading && (
            <button type="button" className="drill__advance" onClick={advance}>
              {position + 1 < set.questions.length ? 'Next question' : 'See result'}
            </button>
          )}

          {/* A free answer can always be left: being stuck on one question
              should not cost the reader the rest of the set. */}
          {question.kind === 'freeResponse' && !isSettled(answer) && !grading && (
            <button type="button" className="questions-screen__link" onClick={advance}>
              Skip this question
            </button>
          )}
        </div>
      ) : (
        <div className="questions-screen__result" role="status">
          <p className="questions-screen__score">
            {correct} of {total} correct
          </p>
          <div className="questions-screen__result-actions">
            <button type="button" className="drill__advance" onClick={onExit}>
              Back to the article
            </button>
            <button type="button" className="drill__secondary" onClick={restart}>
              Start again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MultipleChoice({
  question,
  chosen,
  onChoose,
}: {
  question: MultipleChoiceQuestion;
  chosen: number | null;
  onChoose: (index: number) => void;
}) {
  function stateFor(index: number): string {
    if (chosen === null) return '';
    if (index === question.correctIndex) return ' drill__option--correct';
    return index === chosen ? ' drill__option--wrong' : '';
  }

  return (
    <ul className="drill__options">
      {question.options.map((option, index) => (
        <li key={index}>
          <button
            type="button"
            className={'drill__option questions-screen__option' + stateFor(index)}
            disabled={chosen !== null}
            onClick={() => onChoose(index)}
          >
            <span dir="rtl" lang="ar" className="drill__option-text--arabic">
              {option}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FreeResponse({
  answer,
  grading,
  onEdit,
  onSubmit,
}: {
  answer: Extract<QuestionAnswer, { kind: 'freeResponse' }> | null;
  grading: boolean;
  onEdit: (text: string) => void;
  onSubmit: () => void;
}) {
  const draft = answer?.draft ?? '';
  const verdict = answer?.verdict ?? null;
  const passed = verdict?.pass === true;
  // Marked text that has not been changed since: submitting it again would
  // ask the same question of the grader and pay for the same answer.
  const unchanged = answer?.submitted !== null && answer?.submitted === draft.trim();

  return (
    <div className="questions-screen__free">
      <textarea
        dir="rtl"
        lang="ar"
        className="questions-screen__answer"
        rows={4}
        value={draft}
        readOnly={passed || grading}
        placeholder="اكْتُبْ جَوَابَكَ هُنَا"
        onChange={(event) => onEdit(event.target.value)}
      />

      {verdict && (
        <div
          className={
            'questions-screen__verdict' +
            (verdict.pass ? ' questions-screen__verdict--pass' : ' questions-screen__verdict--retry')
          }
          role="status"
        >
          <p className="questions-screen__verdict-label">
            {verdict.pass ? 'Passed' : 'Not yet'}
          </p>
          <p dir="rtl" lang="ar" className="questions-screen__feedback">
            {verdict.feedback}
          </p>
        </div>
      )}

      {!passed && (
        <button
          type="button"
          className="drill__secondary questions-screen__submit"
          disabled={grading || draft.trim() === '' || unchanged}
          aria-busy={grading}
          onClick={onSubmit}
        >
          {grading ? 'Checking…' : verdict ? 'Submit again' : 'Submit'}
        </button>
      )}
    </div>
  );
}
