/**
 * Adapts a SelectionContext into the narrower context the word draw needs.
 * Kept separate so wordDraw.ts stays independent of round-type concerns and
 * every strategy derives the round index the same way.
 */
import type { WordDrawContext } from './wordDraw';
import type { SelectionContext } from './roundTypes/types';

export function toWordDrawContext(ctx: SelectionContext): WordDrawContext {
  const roundIndexById = new Map<string, number>();
  ctx.rounds.forEach((round, index) => roundIndexById.set(round.id, index));

  return {
    roundIndexById,
    // The round being planned sits one past the last recorded round.
    currentRoundIndex: ctx.rounds.length,
    random: ctx.random,
  };
}
