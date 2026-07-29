import { useEffect, useState } from 'react';
import { listWords } from '@/data/wordRepository';
import { countRounds } from '@/data/roundRepository';
import { getLatestBatch } from '@/data/batchRepository';
import { DEFAULT_TRACK_ID } from '@/domain/languageProfile';

export interface HomeStatus {
  cardsDue: number;
  undrilledBacklog: number;
  roundsCompleted: number;
  currentBatchSize: number;
}

const EMPTY_STATUS: HomeStatus = {
  cardsDue: 0,
  undrilledBacklog: 0,
  roundsCompleted: 0,
  currentBatchSize: 0,
};

/**
 * Status strip figures (§7) — four figures, no styling emphasis on any.
 * "Due" is computed inline here rather than through a Scheduler (REQ-E4):
 * that interface doesn't exist yet (build order step 9). Replace this
 * filter with scheduler.isDue() once it does.
 */
export function useHomeStatus(refreshToken = 0): HomeStatus {
  const [status, setStatus] = useState<HomeStatus>(EMPTY_STATUS);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [words, roundsCompleted, latestBatch] = await Promise.all([
        listWords(DEFAULT_TRACK_ID),
        countRounds(DEFAULT_TRACK_ID),
        getLatestBatch(),
      ]);
      if (cancelled) return;

      const now = Date.now();
      const cardsDue = words.filter((word) => word.srs !== null && word.srs.dueAt <= now).length;
      const undrilledBacklog = words.filter(
        (word) => word.srs === null && word.seenCount > 0,
      ).length;

      setStatus({
        cardsDue,
        undrilledBacklog,
        roundsCompleted,
        currentBatchSize: latestBatch?.wordIds.length ?? 0,
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
    // Re-read when the caller signals that the corpus changed.
  }, [refreshToken]);

  return status;
}
