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

const PAGE_SIZE = 50;

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
export function StatsScreen({ onReplayRound }: StatsScreenProps) {
  const { words, rounds, loading } = useStats();
  const [sort, setSort] = useState<BreakdownSort>('missRate');
  const [statusFilter, setStatusFilter] = useState<WordStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [group, setGroup] = useState<PerformanceGroup>('topic');
  // The corpus runs to thousands of forms; rendering every row at once is slow
  // on a phone. Paged rather than truncated — the total is always shown.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
    <div className="stats-screen has-bottom-nav">
      <header className="stats-screen__header">
        <h1 className="stats-screen__title">Stats</h1>
      </header>

      {loading ? (
        <p className="stats-screen__empty">Loading…</p>
      ) : (
        <>
          {/* Acquisition rate is the figure the method is judged on (REQ-28),
              so it carries the weight and the rest become context (REQ-49). */}
          <div className="stats-screen__summary">
            <p className="stats-screen__headline">
              <span className="stats-screen__value">{percent(summary.acquisitionRate)}</span>
              <span className="stats-screen__label">acquisition rate</span>
            </p>
            <p className="stats-screen__context">
              {/* REQ-29: never labelled as vocabulary size. */}
              {summary.formsTracked} forms tracked · {summary.roundsCompleted} rounds completed
            </p>
          </div>

          <section className="stats-screen__section">
            <h2 className="stats-screen__section-title">Words</h2>

            <div className="stats-screen__controls stats-screen__controls--sort">
              <span className="stats-screen__control-label">Sort</span>
              {SORTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={sort === option.id}
                  className={
                    'stats-screen__chip' + (sort === option.id ? ' stats-screen__chip--on' : '')
                  }
                  onClick={() => {
                    setSort(option.id);
                    setVisibleCount(PAGE_SIZE);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* The status buckets were a separate list above these filters,
                naming the same five things with the same five counts. One
                control carrying its own count replaces both. */}
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
                  onClick={() => {
                    setStatusFilter(status);
                    setVisibleCount(PAGE_SIZE);
                  }}
                >
                  {status === 'all' ? 'All' : WORD_STATUS_LABELS[status]}{' '}
                  <span className="stats-screen__chip-count">
                    {status === 'all' ? summary.formsTracked : summary.statusCounts[status]}
                  </span>
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="stats-screen__empty">No forms match this filter yet.</p>
            ) : (
              <ul className="stats-screen__rows">
                {rows.slice(0, visibleCount).map((row) => {
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
                                <span dir="rtl" lang="ar">{round.titleAr}</span>
                                {` — ${round.topic} / ${round.format}`}
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

            {rows.length > visibleCount && (
              <button
                type="button"
                className="stats-screen__more"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Show more — {visibleCount} of {rows.length}
              </button>
            )}
          </section>

          <details className="stats-screen__section stats-screen__fold">
            <summary className="stats-screen__section-title">Category performance</summary>
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
          </details>

          <details className="stats-screen__section stats-screen__fold">
            <summary className="stats-screen__section-title">History</summary>
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
          </details>
        </>
      )}
    </div>
  );
}
