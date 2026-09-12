import { describe, it, expect, vi } from 'vitest';
import {
  HOME_ACTIONS,
  actionsRanked,
  startExploreRound,
  startReinforcementRound,
  startPureReinforcementRound,
  startBacklogRound,
  generateNewBatch,
  studyCurrentBatch,
  syncNow,
} from './homeActions';

function makeContext() {
  return {
    startRound: vi.fn(),
    generateBatch: vi.fn(),
    studyBatch: vi.fn(),
    syncNow: vi.fn(),
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

  it('syncNow dispatches only the backup', () => {
    const ctx = makeContext();
    syncNow(ctx);

    expect(ctx.syncNow).toHaveBeenCalledTimes(1);
    expect(ctx.startRound).not.toHaveBeenCalled();
    expect(ctx.generateBatch).not.toHaveBeenCalled();
    expect(ctx.studyBatch).not.toHaveBeenCalled();
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

  it('exposes every §7 action (REQ-16)', () => {
    expect(HOME_ACTIONS).toHaveLength(7);
    expect(new Set(HOME_ACTIONS.map((action) => action.id))).toEqual(
      new Set([
        'explore',
        'reinforcement',
        'pureReinforcement',
        'backlog',
        'generateBatch',
        'studyBatch',
        'syncNow',
      ]),
    );
  });

  // REQ-49: ranked, but every action still on screen. Ranking is presentation,
  // and the moment it starts removing actions it has become gating (REQ-13).
  it('ranks the actions without dropping any', () => {
    const ranked = [
      ...actionsRanked('primary'),
      ...actionsRanked('secondary'),
      ...actionsRanked('tertiary'),
    ];

    expect(ranked).toHaveLength(HOME_ACTIONS.length);
    expect(new Set(ranked.map((a) => a.id))).toEqual(new Set(HOME_ACTIONS.map((a) => a.id)));
  });

  it('keeps exactly one primary action, so the rank means something', () => {
    expect(actionsRanked('primary')).toHaveLength(1);
  });

  // The four round types are one family; splitting them across ranks would put
  // four ways of doing the same thing at different levels of the pyramid.
  it('keeps the four round types at one rank, each explained', () => {
    const rounds = actionsRanked('secondary');

    expect(rounds.map((a) => a.id)).toEqual([
      'explore',
      'reinforcement',
      'pureReinforcement',
      'backlog',
    ]);
    for (const action of rounds) {
      expect(action.hint, action.id).toBeTruthy();
    }
  });

  it('every action runs exactly one dispatch — no ordering dependency (REQ-16)', () => {
    for (const action of HOME_ACTIONS) {
      const ctx = makeContext();
      action.run(ctx);
      // Summed across the whole context rather than a hand-written list, so a
      // new dispatch is covered the moment it is added.
      const totalCalls = Object.values(ctx).reduce((sum, fn) => sum + fn.mock.calls.length, 0);
      expect(totalCalls, action.id).toBe(1);
    }
  });
});
