/**
 * Reinforcement (§12.3): bandit topic/format excluding the previous round's
 * topic, targeting recently-drilled words, requiring different inflections.
 */
import type { Categories } from '@/config';
import type { Word, WordId } from '@/domain/types';
import { drawWords } from '../wordDraw';
import { toWordDrawContext } from '../drawContext';
import { knownWords, previousTopic, type RoundTypeStrategy, type SelectionContext } from './types';

/**
 * "Recently drilled" means the word has entered the SRS. Before any batch
 * exists that set is empty, so this falls back to words the learner has
 * actually seen — the round still reinforces rather than returning nothing.
 */
function reinforcementPool(pool: Word[]): Word[] {
  const drilled = pool.filter((word) => word.srs !== null);
  return drilled.length > 0 ? drilled : knownWords(pool);
}

export const reinforcementStrategy: RoundTypeStrategy = {
  id: 'reinforcement',
  label: 'Reinforcement',

  selectWords(pool: Word[], ctx: SelectionContext): WordId[] {
    return drawWords(
      reinforcementPool(pool),
      ctx.algorithm.wordDraw.sampleSize,
      ctx.algorithm.wordDraw,
      toWordDrawContext(ctx),
    );
  },

  /**
   * REQ-36: reinforcement must change domain, not merely vary word forms —
   * same-domain reinforcement yields weak signal. Never returns an empty topic
   * list: with a single configured topic, repeating it beats planning nothing.
   */
  constrainCategories(available: Categories, ctx: SelectionContext): Categories {
    const excluded = previousTopic(ctx.previousRound);
    if (excluded === null) return available;

    const topics = available.topics.filter((topic) => topic !== excluded);
    return topics.length > 0 ? { ...available, topics } : available;
  },

  promptDirectives(): string[] {
    return [
      'This is a reinforcement round: the target words must appear in a different inflection ' +
        'than the form given in the list, not repeated verbatim.',
    ];
  },
};
