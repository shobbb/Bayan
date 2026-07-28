import { useEffect, useState } from 'react';
import { listRounds } from '@/data/roundRepository';
import { DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { Round } from '@/domain/types';

export function useRecentRounds(limit = 10): Round[] {
  const [rounds, setRounds] = useState<Round[]>([]);

  useEffect(() => {
    let cancelled = false;
    listRounds(DEFAULT_TRACK_ID, limit).then((result) => {
      if (!cancelled) setRounds(result);
    });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return rounds;
}
