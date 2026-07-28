/**
 * Pure reinforcement (§12.3): target words restricted to known WordIds, with
 * post-generation validation enforcing zero new vocabulary.
 */
import type { Categories } from '@/config';
import { PARAGRAPH_BREAK, type Segment, type Word, type WordId } from '@/domain/types';
import { drawWords } from '../wordDraw';
import { toWordDrawContext } from '../drawContext';
import { knownWords, type RoundTypeStrategy, type SelectionContext } from './types';

export const pureReinforcementStrategy: RoundTypeStrategy = {
  id: 'pureReinforcement',
  label: 'Pure reinforcement',

  selectWords(pool: Word[], ctx: SelectionContext): WordId[] {
    return drawWords(
      knownWords(pool),
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
      'This is a pure reinforcement round: use only vocabulary the learner has already met. ' +
        'Do not introduce any new words.',
    ];
  },

  /**
   * Post-generation gate: every glossed segment must normalize to a WordId the
   * learner already knows. Normalization goes through the language profile so
   * no Arabic-specific handling leaks in here (REQ-E7).
   */
  validate(segments: Segment[], ctx: SelectionContext): string | null {
    const known = new Set<WordId>(knownWords(ctx.words).map((word) => word.id));

    const unknown = segments
      .filter((segment) => segment.gloss !== null && segment.text !== PARAGRAPH_BREAK)
      .map((segment) => ({ text: segment.text, id: ctx.profile.normalize(segment.text) }))
      .filter((entry) => !known.has(entry.id));

    if (unknown.length === 0) return null;

    const sample = unknown.slice(0, 5).map((entry) => entry.text);
    return `Introduced ${unknown.length} unknown word(s): ${sample.join(', ')}`;
  },
};
