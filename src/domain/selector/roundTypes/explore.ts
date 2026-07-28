/**
 * Explore (§12.3): bandit topic/format, target words weighted toward unseen,
 * higher new-word density. The pull toward unseen vocabulary comes from the
 * word-draw score itself — the under-sampled and staleness terms both favour
 * words with a low seenCount — so this strategy draws from the whole pool
 * rather than pre-filtering it.
 */
import type { Categories } from '@/config';
import type { Word, WordId } from '@/domain/types';
import { drawWords } from '../wordDraw';
import { toWordDrawContext } from '../drawContext';
import type { RoundTypeStrategy, SelectionContext } from './types';

export const exploreStrategy: RoundTypeStrategy = {
  id: 'explore',
  label: 'Explore',

  selectWords(pool: Word[], ctx: SelectionContext): WordId[] {
    return drawWords(
      pool,
      ctx.algorithm.wordDraw.sampleSize,
      ctx.algorithm.wordDraw,
      toWordDrawContext(ctx),
    );
  },

  constrainCategories(available: Categories): Categories {
    return available; // explore is unconstrained by design
  },

  promptDirectives(): string[] {
    return [
      'This is an exploration round: introduce some vocabulary the learner has not met before, ' +
        'alongside the requested target words.',
    ];
  },
};
