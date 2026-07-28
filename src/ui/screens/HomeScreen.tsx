import { useState } from 'react';
import type { Round, RoundType } from '@/domain/types';
import { useHomeStatus } from '@/ui/hooks/useHomeStatus';
import { useRecentRounds } from '@/ui/hooks/useRecentRounds';
import './HomeScreen.css';

export interface HomeScreenProps {
  onStartRound: (roundType: RoundType) => void;
  onReplayRound: (round: Round) => void;
}

interface HomeAction {
  label: string;
  onSelect: () => void;
}

/**
 * Entry screen (§7). Purpose: expose every action directly, orchestrate
 * nothing. REQ-13: no action is ever disabled or gated — preconditions
 * surface as advisory text only. REQ-16: the six actions are independent,
 * with no ordering dependency between them.
 */
export function HomeScreen({ onStartRound, onReplayRound }: HomeScreenProps) {
  const status = useHomeStatus();
  const rounds = useRecentRounds();
  const [notice, setNotice] = useState<string | null>(null);

  const notBuiltYet = (feature: string) => () =>
    setNotice(`${feature} isn't built in this session yet (build order step 9).`);

  const actions: HomeAction[] = [
    { label: 'Start explore round', onSelect: () => onStartRound('explore') },
    { label: 'Start reinforcement round', onSelect: () => onStartRound('reinforcement') },
    {
      label: 'Start pure reinforcement round',
      onSelect: () => onStartRound('pureReinforcement'),
    },
    { label: 'Start backlog clearing round', onSelect: () => onStartRound('backlog') },
    { label: 'Generate new batch', onSelect: notBuiltYet('Batch generation') },
    { label: 'Study current batch', onSelect: notBuiltYet('Drill sessions') },
  ];

  return (
    <div className="home-screen">
      <header className="home-screen__header">
        <h1 className="home-screen__title">Bayan</h1>
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
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="home-screen__action"
            onClick={action.onSelect}
          >
            {action.label}
          </button>
        ))}
      </div>

      {notice && <p className="home-screen__notice">{notice}</p>}

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
