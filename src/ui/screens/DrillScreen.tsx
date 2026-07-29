import { useCallback, useMemo, useState } from 'react';
import { useConfig } from '@/ui/context/ConfigContext';
import { getDrillMode, overrideAsCorrect } from '@/domain/drills/modes';
import { summarizeSession } from '@/domain/drills/session';
import type { QueueEntry } from '@/domain/drills/session';
import type { DrillOutcome, PrepareContext } from '@/domain/drills/types';
import type { Grade, Word } from '@/domain/types';
import { recordAnswer } from '@/services/batch/batchService';
import { FlashcardView } from '@/ui/drills/FlashcardView';
import { MultipleChoiceView } from '@/ui/drills/MultipleChoiceView';
import { WriteInView } from '@/ui/drills/WriteInView';
import './DrillScreen.css';

export interface DrillScreenProps {
  queue: QueueEntry[];
  corpus: Word[];
  sentences: Readonly<Record<string, string>>;
  onExit: () => void;
}

interface Result {
  word: Word;
  correct: boolean;
}

/**
 * Shared shell (§10.1): progress above, prompt in the upper half, response
 * controls in the lower half where a thumb reaches. The shell never inspects a
 * mode's response shape — it hands the mode a response and receives an outcome
 * (REQ-E3).
 */
export function DrillScreen({ queue, corpus, sentences, onExit }: DrillScreenProps) {
  const config = useConfig();
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<DrillOutcome | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  const ctx = useMemo<PrepareContext>(
    () => ({
      corpus,
      sentences,
      maxLevenshteinDistance: config.algorithm.grading.maxLevenshteinDistance,
      random: Math.random,
    }),
    [corpus, sentences, config],
  );

  const entry = queue[index];
  const mode = entry ? getDrillMode(entry.mode) : null;

  // Re-prepared per position, so multiple-choice options reshuffle (REQ-40).
  const item = useMemo(
    () => (entry && mode ? mode.prepare(entry.word, ctx) : null),
    [entry, mode, ctx],
  );

  const commit = useCallback(
    (settled: DrillOutcome) => {
      if (!entry) return;
      // REQ-27: every response writes SrsState through the scheduler.
      void recordAnswer(entry.word, settled.grade);
      setResults((prev) => [...prev, { word: entry.word, correct: settled.correct }]);
    },
    [entry],
  );

  const handleRespond = useCallback(
    (response: unknown) => {
      if (!item || !mode) return;
      const settled = mode.grade(response, item, ctx);
      setOutcome(settled);

      // The flashcard is already a graded self-report, so it advances at once;
      // the other modes show the answer first.
      if (item.mode === 'flashcard') {
        commit(settled);
        setOutcome(null);
        setIndex((i) => i + 1);
      }
    },
    [item, mode, ctx, commit],
  );

  const handleAdvance = useCallback(() => {
    if (!outcome) return;
    commit(outcome);
    setOutcome(null);
    setIndex((i) => i + 1);
  }, [outcome, commit]);

  /** REQ-42: the learner arbitrates when gloss matching gets it wrong. */
  const handleOverride = useCallback(() => {
    if (!outcome) return;
    setOutcome(overrideAsCorrect(outcome));
  }, [outcome]);

  if (!entry || !item || !mode) {
    const summary = summarizeSession(results);
    return (
      <div className="drill-screen">
        <header className="drill-screen__header">
          <button type="button" className="drill-screen__exit" onClick={onExit}>
            ← Home
          </button>
        </header>

        <section className="drill-screen__summary">
          <p className="drill-screen__score">
            {summary.correct} / {summary.total}
          </p>
          {summary.missed.length === 0 ? (
            <p className="drill-screen__note">
              {summary.total === 0 ? 'Nothing due to drill.' : 'Everything recalled.'}
            </p>
          ) : (
            <>
              <p className="drill-screen__note">Missed</p>
              <ul className="drill-screen__missed">
                {summary.missed.map((word) => (
                  <li key={word.id} className="drill-screen__missed-row">
                    <span dir="rtl" lang="ar" className="drill-screen__missed-arabic">
                      {word.surface}
                    </span>
                    <span className="drill-screen__note">{word.gloss}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    );
  }

  const progress = (index / queue.length) * 100;

  return (
    <div className="drill-screen">
      <header className="drill-screen__header">
        <button type="button" className="drill-screen__exit" onClick={onExit}>
          ← Home
        </button>
        <span className="drill-screen__count">
          {index + 1} / {queue.length}
        </span>
      </header>

      <div className="drill-screen__bar" aria-hidden="true">
        <div className="drill-screen__bar-fill" style={{ width: `${progress}%` }} />
      </div>

      {item.mode === 'flashcard' && <FlashcardView item={item} onRespond={handleRespond} />}
      {item.mode === 'multipleChoice' && (
        <MultipleChoiceView
          item={item}
          outcome={outcome}
          onRespond={handleRespond}
          onAdvance={handleAdvance}
        />
      )}
      {item.mode === 'writeIn' && (
        <WriteInView
          item={item}
          outcome={outcome}
          onRespond={handleRespond}
          onAdvance={handleAdvance}
          onOverride={handleOverride}
        />
      )}
    </div>
  );
}

export type { Grade };
