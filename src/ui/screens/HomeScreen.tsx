import { useMemo } from 'react';
import type { Failure } from '@/ui/failure';
import type { StudySourceId } from '@/domain/drills/studySources';
import type { Round, RoundType } from '@/domain/types';
import { useHomeStatus } from '@/ui/hooks/useHomeStatus';
import { useRecentRounds } from '@/ui/hooks/useRecentRounds';
import { actionsRanked, type HomeActionContext } from './homeActions';
import './HomeScreen.css';

export interface HomeScreenProps {
  onStartRound: (roundType: RoundType) => void;
  onReplayRound: (round: Round) => void;
  /** Still needed for the advisory that names Settings as the fix (REQ-13). */
  onOpenSettings: () => void;
  /** The round type currently being generated, or null when idle. */
  generating: RoundType | null;
  /** Advisory from the last failed attempt (REQ-13). */
  failure: Failure | null;
  /** Non-round work in flight, so its action can show progress. */
  busy: 'batch' | 'study' | 'sync' | null;
  /** Informational result of the last completed action. */
  notice: string | null;
  onGenerateBatch: () => void;
  onStudyBatch: () => void;
  /**
   * The study sources with their live counts, or null while they load. Studying
   * begins with a choice of what to study; the primary action opens that choice
   * rather than starting a session.
   */
  studyOptions: ReadonlyArray<{ id: StudySourceId; label: string; hint: string; count: number }> | null;
  /** Whether the choice is open, and how to start one of them. */
  studyOpen: boolean;
  onChooseStudy: (id: StudySourceId) => void;
  onSyncNow: () => void;
  /** When this device last wrote to remote storage, or null if never. */
  lastBackupAt: number | null;
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

/** Coarse on purpose — a backup's exact minute is not information. */
function relativeTime(timestamp: number, now = Date.now()): string {
  const days = Math.floor((now - timestamp) / 86_400_000);
  if (days >= 2) return `${days} days ago`;
  if (days === 1) return 'yesterday';
  const hours = Math.floor((now - timestamp) / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  return 'just now';
}

function isActionBusy(
  actionId: string,
  generating: RoundType | null,
  busy: 'batch' | 'study' | 'sync' | null,
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
  onOpenSettings,
  generating,
  failure,
  busy,
  notice,
  onGenerateBatch,
  onStudyBatch,
  studyOptions,
  studyOpen,
  onChooseStudy,
  onSyncNow,
  lastBackupAt,
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
    <div className="home-screen has-bottom-nav">
      <header className="home-screen__header">
        <h1 className="home-screen__title">Bayan</h1>
        <button
          type="button"
          className={'home-screen__sync' + (busy === 'sync' ? ' home-screen__sync--busy' : '')}
          aria-label={
            lastBackupAt === null
              ? 'Back up — never backed up'
              : `Back up — last backed up ${relativeTime(lastBackupAt)}`
          }
          aria-busy={busy === 'sync'}
          onClick={onSyncNow}
        >
          {/* Two arrows chasing each other: the conventional sync mark. */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 3v6h-6M3 12a9 9 0 0 1 15-6.7L21 9M3 21v-6h6M21 12a9 9 0 0 1-15 6.7L3 15"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {/* Cards due is the only figure that implies an action, so it carries the
          weight; the rest are context and sit quietly beside it (REQ-49). */}
      <div className="home-screen__status" role="status">
        <p className="home-screen__due">
          <span className="home-screen__due-value">{status.cardsDue}</span>
          <span className="home-screen__due-label">cards due</span>
        </p>
        {/* A backup control that cannot say when it last ran is not worth
            trusting, so the state sits with the other figures rather than
            needing a line of its own. */}
        <p className="home-screen__context">
          {status.currentBatchSize} in batch · {status.undrilledBacklog} undrilled ·{' '}
          {status.roundsCompleted} rounds ·{' '}
          {lastBackupAt === null ? 'never backed up' : `backed up ${relativeTime(lastBackupAt)}`}
        </p>
      </div>

      {actionsRanked('primary').map((action) => (
        <div key={action.id}>
          <button
            type="button"
            className="home-screen__action home-screen__action--primary"
            aria-busy={isActionBusy(action.id, generating, busy)}
            aria-expanded={studyOpen}
            onClick={() => action.run(ctx)}
          >
            {isActionBusy(action.id, generating, busy) ? `${action.label}…` : action.label}
          </button>

          {/* Revealed in place rather than on a screen of its own: it is one
              choice between two, and a whole navigation step to make it would
              cost more than it explains. */}
          {studyOpen && (
            <div className="home-screen__study" role="group" aria-label="What to study">
              {studyOptions === null ? (
                <p className="home-screen__study-empty">Counting…</p>
              ) : (
                studyOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="home-screen__study-option"
                    onClick={() => onChooseStudy(option.id)}
                  >
                    <span className="home-screen__study-label">
                      {option.label}
                      {/* The count is the thing being chosen between, so it is
                          stated rather than left to be discovered by tapping. */}
                      <span className="home-screen__study-count">{option.count}</span>
                    </span>
                    <span className="home-screen__study-hint">{option.hint}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
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
