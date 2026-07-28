import { useEffect, useState } from 'react';
import { listWords } from '@/data/wordRepository';
import { listRounds } from '@/data/roundRepository';
import { DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { Round, Word } from '@/domain/types';

export interface StatsData {
  words: Word[];
  rounds: Round[];
  loading: boolean;
}

/**
 * Loads the raw rows the Stats view derives from. Deliberately returns rows,
 * not figures: every metric is computed in domain/stats/metrics.ts (REQ-44).
 */
export function useStats(): StatsData {
  const [words, setWords] = useState<Word[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [loadedWords, loadedRounds] = await Promise.all([
        listWords(DEFAULT_TRACK_ID),
        listRounds(DEFAULT_TRACK_ID),
      ]);
      if (cancelled) return;
      setWords(loadedWords);
      setRounds(loadedRounds);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { words, rounds, loading };
}
