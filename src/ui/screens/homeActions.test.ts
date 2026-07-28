import { describe, it, expect, vi } from 'vitest';
import {
  HOME_ACTIONS,
  startExploreRound,
  startReinforcementRound,
  startPureReinforcementRound,
  startBacklogRound,
  generateNewBatch,
  studyCurrentBatch,
} from './homeActions';

function makeContext() {
  return {
    startRound: vi.fn(),
    generateBatch: vi.fn(),
    studyBatch: vi.fn(),
  };
}

describe('home actions', () => {
  it('each round action dispatches its own roundType and nothing else', () => {
    const cases = [
      [startExploreRound, 'explore'],
      [startReinforcementRound, 'reinforcement'],
      [startPureReinforcementRound, 'pureReinforcement'],
      [startBacklogRound, 'backlog'],
    ] as const;

    for (const [action, roundType] of cases) {
      const ctx = makeContext();
      action(ctx);
      expect(ctx.startRound).toHaveBeenCalledTimes(1);
      expect(ctx.startRound).toHaveBeenCalledWith(roundType);
      expect(ctx.generateBatch).not.toHaveBeenCalled();
      expect(ctx.studyBatch).not.toHaveBeenCalled();
    }
  });

  it('generateNewBatch dispatches only the batch build', () => {
    const ctx = makeContext();
    generateNewBatch(ctx);
    expect(ctx.generateBatch).toHaveBeenCalledTimes(1);
    expect(ctx.startRound).not.toHaveBeenCalled();
    expect(ctx.studyBatch).not.toHaveBeenCalled();
  });

  it('studyCurrentBatch dispatches only the drill session', () => {
    const ctx = makeContext();
    studyCurrentBatch(ctx);
    expect(ctx.studyBatch).toHaveBeenCalledTimes(1);
    expect(ctx.startRound).not.toHaveBeenCalled();
    expect(ctx.generateBatch).not.toHaveBeenCalled();
  });

  it('exposes the six §7 actions in order (REQ-16)', () => {
    expect(HOME_ACTIONS).toHaveLength(6);
    expect(HOME_ACTIONS.map((action) => action.id)).toEqual([
      'explore',
      'reinforcement',
      'pureReinforcement',
      'backlog',
      'generateBatch',
      'studyBatch',
    ]);
  });

  it('every action runs exactly one dispatch — no ordering dependency (REQ-16)', () => {
    for (const action of HOME_ACTIONS) {
      const ctx = makeContext();
      action.run(ctx);
      const totalCalls =
        ctx.startRound.mock.calls.length +
        ctx.generateBatch.mock.calls.length +
        ctx.studyBatch.mock.calls.length;
      expect(totalCalls).toBe(1);
    }
  });
});
