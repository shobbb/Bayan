import { useMemo, useState } from 'react';
import { useStats } from '@/ui/hooks/useStats';
import {
  WORD_STATUS_LABELS,
  filterByStatus,
  performanceByFormat,
  performanceByRoundType,
  performanceByTopic,
  sortBreakdown,
  summarize,
  toBreakdownRows,
  toHistory,
  type BreakdownSort,
  type CategoryPerformance,
  type WordStatus,
} from '@/domain/stats/metrics';
import type { Round } from '@/domain/types';
import './StatsScreen.css';

export interface StatsScreenProps {
  onBack: () => void;
  onReplayRound: (round: Round) => void;
}

const SORTS: { id: BreakdownSort; label: string }[] = [
  { id: 'missRate', label: 'Miss rate' },
  { id: 'seenCount', label: 'Seen' },
  { id: 'lastSeen', label: 'Last seen' },
];

const STATUS_FILTERS: (WordStatus | 'all')[] = [
  'all',
  'stillFailing',
  'flaggedThenPassed',
  'flaggedOnceNeverReshown',
  'neverFlagged',
  'notYetShown',
];

const PERFORMANCE_GROUPS = [
  { id: 'topic', label: 'By topic' },
  { id: 'format', label: 'By format' },
  { id: 'roundType', label: 'By round type' },
] as const;

type PerformanceGroup = (typeof PERFORMANCE_GROUPS)[number]['id'];

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Read-only (§11). Every figure comes from domain/stats/metrics.ts — this
 * component formats and arranges, it never computes a metric (REQ-44).
 */
export function StatsScreen({ onBack, onReplayRound }: StatsScreenProps) {
  const { words, rounds, loading } = useStats();
  const [sort, setSort] = useState<BreakdownSort>('missRate');
  const [statusFilter, setStatusFilter] = useState<WordStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [group, setGroup] = useState<PerformanceGroup>('topic');

  const summary = useMemo(() => summarize(words, rounds), [words, rounds]);
  const rows = useMemo(
    () => sortBreakdown(filterByStatus(toBreakdownRows(words), statusFilter), sort),
    [words, statusFilter, sort],
  );
  const history = useMemo(() => toHistory(rounds), [rounds]);
  const roundsById = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds]);

  const performance: CategoryPerformance[] = useMemo(() => {
    if (group === 'format') return performanceByFormat(rounds);
    if (group === 'roundType') return performanceByRoundType(rounds);
    return performanceByTopic(rounds);
  }, [rounds, group]);

  return (
    <div className="stats-screen">
      <header className="stats-screen__header">
        <button type="button" className="stats-screen__back" onClick={onBack}>
          ← Home
        </button>
        <h1 className="stats-screen__title">Stats</h1>
      </header>

      {loading ? (
        <p className="stats-screen__empty">Loading…</p>
      ) : (
        <>
          <div className="stats-screen__summary">
            <div className="stats-screen__figure">
              <span className="stats-screen__value">{summary.formsTracked}</span>
              {/* REQ-29: never labelled as vocabulary size. */}
              <span className="stats-screen__label">forms tracked</span>
            </div>
            <div className="stats-screen__figure">
              <span className="stats-screen__value">{percent(summary.acquisitionRate)}</span>
              <span className="stats-screen__label">acquisition rate</span>
            </div>
            <div className="stats-screen__figure">
              <span className="stats-screen__value">{summary.roundsCompleted}</span>
              <span className="stats-screen__label">rounds completed</span>
            </div>
          </div>

          <section className="stats-screen__section">
            <h2 className="stats-screen__section-title">Word status</h2>
            <ul className="stats-screen__status-list">
              {(Object.keys(WORD_STATUS_LABELS) as WordStatus[]).map((status) => (
                <li key={status} className="stats-screen__status-row">
                  <span>{WORD_STATUS_LABELS[status]}</span>
                  <span className="stats-screen__status-count">{summary.statusCounts[status]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="stats-screen__section">
            <h2 className="stats-screen__section-title">Word breakdown</h2>

            <div className="stats-screen__controls">
              {SORTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={sort === option.id}
                  className={
                    'stats-screen__chip' + (sort === option.id ? ' stats-screen__chip--on' : '')
                  }
                  onClick={() => setSort(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="stats-screen__controls">
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={statusFilter === status}
                  className={
                    'stats-screen__chip' +
                    (statusFilter === status ? ' stats-screen__chip--on' : '')
                  }
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'all' ? 'All' : WORD_STATUS_LABELS[status]}
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="stats-screen__empty">No forms match this filter yet.</p>
            ) : (
              <ul className="stats-screen__rows">
                {rows.map((row) => {
                  const expanded = expandedId === row.id;
                  const appearances = row.roundIds
                    .map((id) => roundsById.get(id))
                    .filter((round): round is Round => round !== undefined);

                  return (
                    <li key={row.id} className="stats-screen__row-item">
                      <button
                        type="button"
                        className="stats-screen__row"
                        aria-expanded={expanded}
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                      >
                        <span dir="rtl" lang="ar" className="stats-screen__row-arabic">
                          {row.surface}
                        </span>
                        <span className="stats-screen__row-gloss">{row.gloss}</span>
                        <span className="stats-screen__row-figures">
                          {row.unclearCount}/{row.seenCount} · {percent(row.missRate)}
                        </span>
                      </button>

                      {expanded && (
                        <div className="stats-screen__appearances">
                          <span className="stats-screen__meta">
                            {WORD_STATUS_LABELS[row.status]} · last seen{' '}
                            {formatDate(row.lastSeenAt)}
                          </span>
                          {appearances.length === 0 ? (
                            <span className="stats-screen__meta">No stored rounds.</span>
                          ) : (
                            appearances.map((round) => (
                              <button
                                key={round.id}
                                type="button"
                                className="stats-screen__appearance"
                                onClick={() => onReplayRound(round)}
                              >
                                {round.titleEn} — {round.topic} / {round.format}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="stats-screen__section">
            <h2 className="stats-screen__section-title">Category performance</h2>
            <div className="stats-screen__controls">
              {PERFORMANCE_GROUPS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={group === option.id}
                  className={
                    'stats-screen__chip' + (group === option.id ? ' stats-screen__chip--on' : '')
                  }
                  onClick={() => setGroup(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {performance.length === 0 ? (
              <p className="stats-screen__empty">No rounds recorded yet.</p>
            ) : (
              <ul className="stats-screen__rows">
                {performance.map((entry) => (
                  <li key={entry.key} className="stats-screen__perf-row">
                    <span>{entry.key}</span>
                    <span className="stats-screen__row-figures">
                      {percent(entry.flagRate)}
                      {/* A single round is not a signal, so sample size sits beside every rate. */}
                      <span className="stats-screen__meta"> · n={entry.sampleSize}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="stats-screen__section">
            <h2 className="stats-screen__section-title">History</h2>
            {history.length === 0 ? (
              <p className="stats-screen__empty">No rounds yet.</p>
            ) : (
              <ul className="stats-screen__rows">
                {history.map((entry) => {
                  const round = roundsById.get(entry.id);
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="stats-screen__row"
                        disabled={!entry.replayable || !round}
                        onClick={() => round && onReplayRound(round)}
                      >
                        <span>
                          {formatDate(entry.createdAt)} · {entry.roundType}
                        </span>
                        <span className="stats-screen__row-gloss">
                          {entry.topic} / {entry.format}
                        </span>
                        <span className="stats-screen__row-figures">
                          {percent(entry.flagRate)}
                          {!entry.replayable && (
                            <span className="stats-screen__meta"> · history only</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
