/**
 * Round planner (§12.3). Composes the bandit and the round-type strategy into
 * a RoundPlan — the input to generation (§8, step 1). It selects; it does not
 * generate and it does not persist.
 */
import type { Categories } from '@/config';
import type { Round, RoundPlan, RoundType } from '@/domain/types';
import { selectArm, type ArmObservation } from './bandit';
import { getRoundTypeStrategy } from './roundTypes';
import type { SelectionContext } from './roundTypes/types';

/**
 * A round's reward is its flag rate — the share of distinct forms the learner
 * marked. Rounds with no distinct forms recorded have not been read yet, so
 * they yield null: still a pull, but no reward (REQ-32).
 */
export function roundFlagRate(round: Round): number | null {
  if (round.flagCount === null || round.distinctForms <= 0) return null;
  return round.flagCount / round.distinctForms;
}

export function topicObservations(rounds: readonly Round[]): ArmObservation[] {
  return rounds.map((round) => ({ arm: round.topic, reward: roundFlagRate(round) }));
}

export function formatObservations(rounds: readonly Round[]): ArmObservation[] {
  return rounds.map((round) => ({ arm: round.format, reward: roundFlagRate(round) }));
}

/**
 * REQ-33: the bandit selects topic and format only. Round type is always the
 * learner's explicit choice and is never inferred — it arrives as an argument.
 */
export function planRound(
  roundType: RoundType,
  categories: Categories,
  ctx: SelectionContext,
): RoundPlan {
  const strategy = getRoundTypeStrategy(roundType);
  const constrained = strategy.constrainCategories(categories, ctx);
  const explorationConstant = ctx.algorithm.bandit.explorationConstant;

  const topic = selectArm(
    constrained.topics,
    topicObservations(ctx.rounds),
    explorationConstant,
    ctx.random,
  );
  const format = selectArm(
    constrained.formats,
    formatObservations(ctx.rounds),
    explorationConstant,
    ctx.random,
  );

  // Whatever the strategy removed is what generation must avoid writing about.
  const allowed = new Set(constrained.topics);
  const excludeTopics = categories.topics.filter((candidate) => !allowed.has(candidate));

  return {
    roundType,
    topic,
    format,
    targetWordIds: strategy.selectWords(ctx.words, ctx),
    excludeTopics,
  };
}
