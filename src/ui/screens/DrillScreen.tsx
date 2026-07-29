import { useCallback, useMemo, useState } from 'react';
import { useConfig } from '@/ui/context/ConfigContext';
import { getDrillMode, overrideAsCorrect } from '@/domain/drills/modes';
import {
  isCheckpoint,
  reviewQueueFor,
  roundBoundsFor,
  summarizeSession,
  type QueueEntry,
} from '@/domain/drills/session';
import type { DrillOutcome, PrepareContext } from '@/domain/drills/types';
import type { Grade, Word } from '@/domain/types';
import { recordAnswer, undoAnswer } from '@/services/batch/batchService';
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
  /** The record as it stood before the answer, so undo can restore it (REQ-46). */
  word: Word;
  correct: boolean;
}

/**
 * Shared shell (§10.1): progress above, prompt in the upper half, response
 * controls in the lower half where a thumb reaches. The shell never inspects a
 * mode's response shape — it hands the mode a response and receives an outcome
 * (REQ-E3).
 *
 * The session runs as short rounds with a checkpoint between them (§10.6) and
 * ends on the two counts plus a pass over what was missed. Every response is
 * written as it happens, so a checkpoint, an exit, and a crash all preserve the
 * same progress.
 */
export function DrillScreen({ queue, corpus, sentences, onExit }: DrillScreenProps) {
  const config = useConfig();
  const [session, setSession] = useState<QueueEntry[]>(queue);
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<DrillOutcome | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [resting, setResting] = useState(false);
  /** Counts carried across a review pass, so "known" does not reset to zero. */
  const [carried, setCarried] = useState({ known: 0, stillLearning: 0 });

  const roundSize = config.algorithm.drill.roundSize;

  const ctx = useMemo<PrepareContext>(
    () => ({
      corpus,
      sentences,
      maxLevenshteinDistance: config.algorithm.grading.maxLevenshteinDistance,
      random: Math.random,
    }),
    [corpus, sentences, config],
  );

  const entry = session[index];
  const mode = entry ? getDrillMode(entry.mode) : null;

  // Re-prepared per position, so multiple-choice options reshuffle (REQ-40).
  const item = useMemo(
    () => (entry && mode ? mode.prepare(entry.word, ctx) : null),
    [entry, mode, ctx],
  );

  const advance = useCallback(
    (settled: DrillOutcome) => {
      if (!entry) return;
      // REQ-27: every response writes SrsState through the scheduler.
      void recordAnswer(entry.word, settled.grade);
      setResults((prev) => [...prev, { word: entry.word, correct: settled.correct }]);
      setOutcome(null);

      const next = index + 1;
      setIndex(next);
      if (isCheckpoint(session.length, roundSize, next)) setResting(true);
    },
    [entry, index, session.length, roundSize],
  );

  const handleRespond = useCallback(
    (response: unknown) => {
      if (!item || !mode) return;
      const settled = mode.grade(response, item, ctx);

      // A flashcard is already a settled self-report, so it moves on at once;
      // the graded modes show the answer first.
      if (item.mode === 'flashcard') advance(settled);
      else setOutcome(settled);
    },
    [item, mode, ctx, advance],
  );

  const handleAdvance = useCallback(() => {
    if (outcome) advance(outcome);
  }, [outcome, advance]);

  /** REQ-42: the learner arbitrates when gloss matching gets it wrong. */
  const handleOverride = useCallback(() => {
    if (outcome) setOutcome(overrideAsCorrect(outcome));
  }, [outcome]);

  /** REQ-46: restores the card exactly as it was, not an inverted schedule. */
  const handleUndo = useCallback(() => {
    const last = results[results.length - 1];
    if (!last) return;
    void undoAnswer(last.word);
    setResults((prev) => prev.slice(0, -1));
    setOutcome(null);
    setResting(false);
    setIndex((i) => Math.max(0, i - 1));
  }, [results]);

  const summary = summarizeSession(results);
  const known = carried.known + summary.known;
  const stillLearning = carried.stillLearning + summary.stillLearning;

  const counters = (
    <div className="drill-screen__counts" role="status">
      <span className="drill-screen__count drill-screen__count--learning">
        {stillLearning} <span className="drill-screen__count-label">still learning</span>
      </span>
      <span className="drill-screen__count drill-screen__count--known">
        {known} <span className="drill-screen__count-label">known</span>
      </span>
    </div>
  );

  const header = (
    <header className="drill-screen__header">
      <button type="button" className="drill-screen__exit" onClick={onExit}>
        ← Home
      </button>
      {results.length > 0 && (
        <button type="button" className="drill-screen__undo" onClick={handleUndo}>
          Undo
        </button>
      )}
    </header>
  );

  // A checkpoint between rounds (§10.6). A resting point, not a reward screen —
  // no streak, no congratulation (REQ-15).
  if (resting && entry) {
    const bounds = roundBoundsFor(session.length, roundSize, index);
    // `bounds.round` is the zero-based index of the round about to start, which
    // is the same number as the one-based count of rounds finished.
    const roundsDone = bounds.round;
    return (
      <div className="drill-screen">
        {header}
        {counters}
        <section className="drill-screen__summary">
          <p className="drill-screen__note">
            Round {roundsDone} of {bounds.roundCount} done — {session.length - index} cards left.
          </p>
          <button
            type="button"
            className="drill-screen__continue"
            onClick={() => setResting(false)}
          >
            Continue
          </button>
        </section>
      </div>
    );
  }

  if (!entry || !item || !mode) {
    const keepReviewing = () => {
      // Carry the counts so a review pass reads as the same session continuing.
      setCarried({ known, stillLearning });
      setSession(reviewQueueFor(summary.missed, session));
      setResults([]);
      setIndex(0);
      setOutcome(null);
    };

    return (
      <div className="drill-screen">
        {header}
        {counters}

        <section className="drill-screen__summary">
          {summary.total === 0 ? (
            <p className="drill-screen__note">Nothing due to drill.</p>
          ) : summary.missed.length === 0 ? (
            <p className="drill-screen__note">Everything recalled.</p>
          ) : (
            <>
              <button type="button" className="drill-screen__continue" onClick={keepReviewing}>
                Keep reviewing {summary.missed.length}
              </button>
              <p className="drill-screen__note">Still learning</p>
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

  const bounds = roundBoundsFor(session.length, roundSize, index);
  const roundLength = bounds.end - bounds.start;
  const progress = (bounds.positionInRound / roundLength) * 100;

  return (
    <div className="drill-screen">
      {header}
      {counters}

      <div className="drill-screen__bar" aria-hidden="true">
        <div className="drill-screen__bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="drill-screen__position">
        {bounds.positionInRound + 1} / {roundLength}
        {bounds.roundCount > 1 && ` · round ${bounds.round + 1} of ${bounds.roundCount}`}
      </p>

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
