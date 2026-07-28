/**
 * The one registry (§18.2). Adding a round type touches its new file, this
 * map, and a label in config — nothing else. No `switch (roundType)` exists
 * anywhere outside this lookup (REQ-E2).
 */
import type { RoundType } from '@/domain/types';
import { exploreStrategy } from './explore';
import { reinforcementStrategy } from './reinforcement';
import { pureReinforcementStrategy } from './pureReinforcement';
import { backlogStrategy } from './backlog';
import type { RoundTypeStrategy } from './types';

export const ROUND_TYPE_STRATEGIES: Readonly<Record<RoundType, RoundTypeStrategy>> = {
  explore: exploreStrategy,
  reinforcement: reinforcementStrategy,
  pureReinforcement: pureReinforcementStrategy,
  backlog: backlogStrategy,
};

export function getRoundTypeStrategy(roundType: RoundType): RoundTypeStrategy {
  return ROUND_TYPE_STRATEGIES[roundType];
}

export type { RoundTypeStrategy, SelectionContext } from './types';
