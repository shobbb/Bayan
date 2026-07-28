import { describe, it, expect } from 'vitest';
import { scoreArms, selectArm, type ArmObservation } from './bandit';

const C = 0.7;
const first = () => 0; // deterministic tie-break: always take the first leader

describe('category bandit', () => {
  it('scores unpulled arms Infinity so every category gets covered (REQ-31)', () => {
    const scored = scoreArms(['travel', 'food'], [{ arm: 'travel', reward: 0.1 }], C);
    const food = scored.find((entry) => entry.arm === 'food');

    expect(food?.score).toBe(Number.POSITIVE_INFINITY);
    expect(food?.pulls).toBe(0);
  });

  it('rewards difficulty — the higher flag rate scores higher (REQ-30)', () => {
    const observations: ArmObservation[] = [
      { arm: 'easy', reward: 0.05 },
      { arm: 'hard', reward: 0.6 },
    ];
    const scored = scoreArms(['easy', 'hard'], observations, C);
    const easy = scored.find((entry) => entry.arm === 'easy')!;
    const hard = scored.find((entry) => entry.arm === 'hard')!;

    // Equal pulls, so the exploration bonus cancels and reward decides.
    expect(hard.score).toBeGreaterThan(easy.score);
    expect(selectArm(['easy', 'hard'], observations, C, first)).toBe('hard');
  });

  it('counts a round awaiting completion as a pull with no reward (REQ-32)', () => {
    const scored = scoreArms(['travel'], [{ arm: 'travel', reward: null }], C);
    const travel = scored[0]!;

    expect(travel.pulls).toBe(1);
    expect(travel.score).not.toBe(Number.POSITIVE_INFINITY);
    expect(travel.meanReward).toBe(0);
  });

  it('averages only recorded rewards, ignoring pending rounds', () => {
    const scored = scoreArms(
      ['travel'],
      [
        { arm: 'travel', reward: 0.4 },
        { arm: 'travel', reward: null },
        { arm: 'travel', reward: 0.6 },
      ],
      C,
    );

    expect(scored[0]!.pulls).toBe(3);
    expect(scored[0]!.meanReward).toBeCloseTo(0.5, 10);
  });

  it('ignores observations for arms outside the candidate set', () => {
    const scored = scoreArms(['travel'], [{ arm: 'retired-topic', reward: 0.9 }], C);
    expect(scored[0]!.pulls).toBe(0);
  });

  it('breaks ties through the injected random source', () => {
    const arms = ['a', 'b', 'c'];
    expect(selectArm(arms, [], C, () => 0)).toBe('a');
    expect(selectArm(arms, [], C, () => 0.99)).toBe('c');
  });

  it('throws when given no arms', () => {
    expect(() => selectArm([], [], C, first)).toThrow();
  });
});
