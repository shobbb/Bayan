import { useMemo } from 'react';
import type { Failure } from '@/ui/failure';
import type { Round, RoundType } from '@/domain/types';
import { useHomeStatus } from '@/ui/hooks/useHomeStatus';
import { useRecentRounds } from '@/ui/hooks/useRecentRounds';
import { actionsRanked, type HomeActionContext } from './homeActions';
import './HomeScreen.css';

export interface HomeScreenProps {
  onStartRound: (roundType: RoundType) => void;
  onReplayRound: (round: Round) => void;
  onOpenStats: () => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
  /** The round type currently being generated, or null when idle. */
  generating: RoundType | null;
  /** Advisory from the last failed attempt (REQ-13). */
  failure: Failure | null;
  /** Non-round work in flight, so its action can show progress. */
  busy: 'batch' | 'study' | null;
  /** Informational result of the last completed action. */
  notice: string | null;
  onGenerateBatch: () => void;
  onStudyBatch: () => void;
  /** Bumped whenever the corpus changes, so the status strip re-reads. */
  refreshToken: number;
}

/**
 * The two non-round actions report progress through their own busy key; the
 * four round actions report through `generating`. Comparing a round action's
 * (absent) busy key against an idle `busy` is null === null, which read as
 * "in progress" and left all four round buttons permanently showing a
 * trailing ellipsis and aria-busy="true".
 */
const BUSY_KEY_BY_ACTION: Readonly<Record<string, 'batch' | 'study'>> = {
  generateBatch: 'batch',
  studyBatch: 'study',
};

function isActionBusy(
  actionId: string,
  generating: RoundType | null,
  busy: 'batch' | 'study' | null,
): boolean {
  const key = BUSY_KEY_BY_ACTION[actionId];
  return key !== undefined ? busy === key : generating === actionId;
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
  onOpenLibrary,
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

      {/* Cards due is the only figure that implies an action, so it carries the
          weight; the rest are context and sit quietly beside it (REQ-49). */}
      <div className="home-screen__status" role="status">
        <p className="home-screen__due">
          <span className="home-screen__due-value">{status.cardsDue}</span>
          <span className="home-screen__due-label">cards due</span>
        </p>
        <p className="home-screen__context">
          {status.currentBatchSize} in batch · {status.undrilledBacklog} undrilled ·{' '}
          {status.roundsCompleted} rounds
        </p>
      </div>

      {actionsRanked('primary').map((action) => (
        <button
          key={action.id}
          type="button"
          className="home-screen__action home-screen__action--primary"
          aria-busy={isActionBusy(action.id, generating, busy)}
          onClick={() => action.run(ctx)}
        >
          {isActionBusy(action.id, generating, busy) ? `${action.label}…` : action.label}
        </button>
      ))}

      <section className="home-screen__reading">
        <h2 className="home-screen__group-title">Read a round</h2>
        <div className="home-screen__grid">
          {actionsRanked('secondary').map((action) => {
            const actionBusy = isActionBusy(action.id, generating, busy);
            return (
              <button
                key={action.id}
                type="button"
                className="home-screen__action"
                aria-busy={actionBusy}
                onClick={() => action.run(ctx)}
              >
                <span className="home-screen__action-label">
                  {actionBusy ? `${action.label}…` : action.label}
                </span>
                {action.hint && <span className="home-screen__action-hint">{action.hint}</span>}
              </button>
            );
          })}
        </div>

        {/* The other way to read. Grouped with the round types rather than
            with the batch actions, because it is the same activity from a
            different source — but a link, not a fifth button: it opens a
            library rather than starting something. */}
        <button type="button" className="home-screen__action-link" onClick={onOpenLibrary}>
          Or browse published articles →
        </button>
      </section>

      <div className="home-screen__tertiary">
        {actionsRanked('tertiary').map((action) => {
          const actionBusy = isActionBusy(action.id, generating, busy);
          return (
            <button
              key={action.id}
              type="button"
              className="home-screen__action-link"
              aria-busy={actionBusy}
              onClick={() => action.run(ctx)}
            >
              {actionBusy ? `${action.label}…` : action.label}
            </button>
          );
        })}
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
        <div className="home-screen__notice" role="status">
          <p className="home-screen__notice-text">
            {failure.message}
            {failure.settingsWillHelp && (
              <>
                {' '}
                <button
                  type="button"
                  className="home-screen__notice-action"
                  onClick={onOpenSettings}
                >
                  Open Settings
                </button>
              </>
            )}
          </p>
          {/* REQ-17: the raw response stays reachable, but folded away — it is
              for diagnosing a bad generation, not for reading mid-session. */}
          {failure.detail && (
            <details className="home-screen__notice-details">
              <summary>What came back</summary>
              <pre className="home-screen__notice-raw">{failure.detail}</pre>
            </details>
          )}
        </div>
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
                  <span dir="rtl" lang="ar" className="home-screen__round-title">
                    {round.titleAr}
                  </span>
                  <span className="home-screen__round-meta">
                    {round.topic} · {round.format}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
