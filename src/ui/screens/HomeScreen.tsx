import { useMemo } from 'react';
import type { Round, RoundType } from '@/domain/types';
import { useHomeStatus } from '@/ui/hooks/useHomeStatus';
import { useRecentRounds } from '@/ui/hooks/useRecentRounds';
import { HOME_ACTIONS, type HomeActionContext } from './homeActions';
import './HomeScreen.css';

export interface HomeScreenProps {
  onStartRound: (roundType: RoundType) => void;
  onReplayRound: (round: Round) => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  /** The round type currently being generated, or null when idle. */
  generating: RoundType | null;
  /** Advisory text from the last failed attempt (REQ-13). */
  failure: string | null;
  /** Non-round work in flight, so its action can show progress. */
  busy: 'batch' | 'study' | null;
  /** Informational result of the last completed action. */
  notice: string | null;
  onGenerateBatch: () => void;
  onStudyBatch: () => void;
  /** Bumped whenever the corpus changes, so the status strip re-reads. */
  refreshToken: number;
}

/** The two non-round actions report progress through their own busy key. */
function busyKeyFor(actionId: string): 'batch' | 'study' | null {
  if (actionId === 'generateBatch') return 'batch';
  if (actionId === 'studyBatch') return 'study';
  return null;
}

/**
 * Entry screen (§7). Purpose: expose every action directly, orchestrate
 * nothing. The six actions live in homeActions.ts as independent functions
 * (REQ-16); this view only supplies the dispatch context and maps over the
 * registry — it never branches on which action was pressed (REQ-E2). No action
 * is disabled or gated; unmet preconditions surface as advisory text (REQ-13).
 */
export function HomeScreen({
  onStartRound,
  onReplayRound,
  onOpenStats,
  onOpenSettings,
  generating,
  failure,
  busy,
  notice,
  onGenerateBatch,
  onStudyBatch,
  refreshToken,
}: HomeScreenProps) {
  const status = useHomeStatus(refreshToken);
  const rounds = useRecentRounds(10, refreshToken);

  const ctx = useMemo<HomeActionContext>(
    () => ({
      startRound: onStartRound,
      generateBatch: onGenerateBatch,
      studyBatch: onStudyBatch,
    }),
    [onStartRound, onGenerateBatch, onStudyBatch],
  );

  return (
    <div className="home-screen">
      <header className="home-screen__header">
        <h1 className="home-screen__title">Bayan</h1>
        <div className="home-screen__header-actions">
          <button type="button" className="home-screen__stats-link" onClick={onOpenStats}>
            Stats
          </button>
          <button
            type="button"
            className="home-screen__settings"
            aria-label="Settings"
            onClick={onOpenSettings}
          >
            {/* Placeholder until the Settings view (§13) is built. */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className="home-screen__status" role="status">
        <div className="home-screen__status-item">
          <span className="home-screen__status-value">{status.cardsDue}</span>
          <span className="home-screen__status-label">cards due</span>
        </div>
        <div className="home-screen__status-item">
          <span className="home-screen__status-value">{status.undrilledBacklog}</span>
          <span className="home-screen__status-label">undrilled backlog</span>
        </div>
        <div className="home-screen__status-item">
          <span className="home-screen__status-value">{status.roundsCompleted}</span>
          <span className="home-screen__status-label">rounds completed</span>
        </div>
        <div className="home-screen__status-item">
          <span className="home-screen__status-value">{status.currentBatchSize}</span>
          <span className="home-screen__status-label">current batch size</span>
        </div>
      </div>

      <div className="home-screen__grid">
        {HOME_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="home-screen__action"
            aria-busy={generating === action.id || busy === busyKeyFor(action.id)}
            onClick={() => action.run(ctx)}
          >
            {generating === action.id || busy === busyKeyFor(action.id)
              ? `${action.label}…`
              : action.label}
          </button>
        ))}
      </div>

      {generating !== null && (
        <p className="home-screen__notice" role="status">
          Generating a round. This takes a few seconds.
        </p>
      )}

      {busy === 'batch' && (
        <p className="home-screen__notice" role="status">
          Building a batch and writing example sentences. This takes a moment.
        </p>
      )}

      {failure && !generating && (
        <p className="home-screen__notice" role="status">
          {failure}{' '}
          <button type="button" className="home-screen__notice-action" onClick={onOpenSettings}>
            Open Settings
          </button>
        </p>
      )}

      {notice && (
        <p className="home-screen__notice" role="status">
          {notice}
        </p>
      )}

      <section>
        <h2 className="home-screen__rounds-title">Recent rounds</h2>
        {rounds.length === 0 ? (
          <p className="home-screen__empty">No rounds yet. Start a round to begin.</p>
        ) : (
          <ul className="home-screen__round-list">
            {rounds.map((round) => (
              <li key={round.id}>
                <button
                  type="button"
                  className="home-screen__round-item"
                  onClick={() => onReplayRound(round)}
                >
                  {round.titleEn} — {round.topic} / {round.format}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
