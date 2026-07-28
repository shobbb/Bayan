/**
 * Backlog clearing (§12.3): target words restricted to those with
 * `seenCount === 0` — vocabulary sitting in the corpus that has never been
 * shown, typically arriving via state interchange (§14).
 */
import type { Categories } from '@/config';
import type { Word, WordId } from '@/domain/types';
import { drawWords } from '../wordDraw';
import { toWordDrawContext } from '../drawContext';
import { unseenWords, type RoundTypeStrategy, type SelectionContext } from './types';

export const backlogStrategy: RoundTypeStrategy = {
  id: 'backlog',
  label: 'Backlog clearing',

  selectWords(pool: Word[], ctx: SelectionContext): WordId[] {
    return drawWords(
      unseenWords(pool),
      ctx.algorithm.wordDraw.sampleSize,
      ctx.algorithm.wordDraw,
      toWordDrawContext(ctx),
    );
  },

  constrainCategories(available: Categories): Categories {
    return available;
  },

  promptDirectives(): string[] {
    return [
      'This is a backlog round: the target words are new to the learner. Introduce each one in ' +
        'a context clear enough to infer its meaning.',
    ];
  },
};
