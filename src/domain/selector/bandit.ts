/**
 * UCB1 category bandit (§12.1), run over topics and formats independently.
 *
 *   score(arm) = flagRate(arm) + C * sqrt(2 * ln(totalPulls) / pulls(arm))
 *
 * Pure: it takes observations rather than reading the DB, so it is testable
 * without mocking (§2.1).
 */

export interface ArmObservation {
  arm: string;
  /**
   * Reward for this pull, or null when the round has no recorded outcome yet.
   * A null still counts as a pull (REQ-32) — a round awaiting completion must
   * not read as unpulled and send the bandit back to explore it again.
   */
  reward: number | null;
}

export interface ArmScore {
  arm: string;
  score: number;
  pulls: number;
  /** Mean of recorded rewards; 0 when this arm has been pulled but never scored. */
  meanReward: number;
}

/**
 * Reward is difficulty, not success (REQ-30): a high flag rate scores higher
 * and is therefore more likely to be selected. This is inverted relative to a
 * conventional bandit and is intentional — the app steers toward what the
 * learner finds hard. Do not "correct" it.
 */
export function scoreArms(
  arms: readonly string[],
  observations: readonly ArmObservation[],
  explorationConstant: number,
): ArmScore[] {
  const armSet = new Set(arms);
  const relevant = observations.filter((observation) => armSet.has(observation.arm));
  const totalPulls = relevant.length;

  return arms.map((arm) => {
    const forArm = relevant.filter((observation) => observation.arm === arm);
    const pulls = forArm.length;
    const rewards = forArm
      .map((observation) => observation.reward)
      .filter((reward): reward is number => reward !== null);
    const meanReward =
      rewards.length > 0 ? rewards.reduce((sum, reward) => sum + reward, 0) / rewards.length : 0;

    // REQ-31: unpulled arms score Infinity, which guarantees category coverage
    // before any arm is judged.
    if (pulls === 0) {
      return { arm, score: Number.POSITIVE_INFINITY, pulls, meanReward };
    }

    const bonus = explorationConstant * Math.sqrt((2 * Math.log(totalPulls)) / pulls);
    return { arm, score: meanReward + bonus, pulls, meanReward };
  });
}

/**
 * Highest score wins; ties are broken uniformly at random so that the initial
 * all-Infinity state doesn't always open on the same category.
 */
export function selectArm(
  arms: readonly string[],
  observations: readonly ArmObservation[],
  explorationConstant: number,
  random: () => number,
): string {
  if (arms.length === 0) throw new Error('selectArm requires at least one arm');

  const scored = scoreArms(arms, observations, explorationConstant);
  const best = scored.reduce((max, entry) => (entry.score > max ? entry.score : max), -Infinity);
  const leaders = scored.filter((entry) => entry.score === best);

  const index = Math.min(leaders.length - 1, Math.floor(random() * leaders.length));
  const chosen = leaders[index];
  // leaders is non-empty: `best` is drawn from `scored`, which mirrors `arms`.
  if (!chosen) throw new Error('selectArm: no candidate arm');
  return chosen.arm;
}
