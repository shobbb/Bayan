/**
 * The six Home actions (§7). Each is an independent exported function with no
 * ordering dependency on the others (REQ-16): it performs exactly one dispatch
 * and never sequences another action. Any future flow that chains these
 * composes them from above — the sequencing does not live in here.
 *
 * Actions dispatch through a HomeActionContext rather than reaching into
 * services directly, so navigation and the (not-yet-built) batch/drill entry
 * points are supplied by the caller. That keeps each action trivially testable
 * and keeps the Home view orchestrating nothing (§7).
 */
import type { RoundType } from '@/domain/types';

export interface HomeActionContext {
  /** Begin a new reading round of the given type (§8 generation flow). */
  startRound: (roundType: RoundType) => void;
  /** Build a ~40-card batch from the current corpus (§9). */
  generateBatch: () => void;
  /** Open a drill session over the current batch plus due cards (§10). */
  studyBatch: () => void;
}

export function startExploreRound(ctx: HomeActionContext): void {
  ctx.startRound('explore');
}

export function startReinforcementRound(ctx: HomeActionContext): void {
  ctx.startRound('reinforcement');
}

export function startPureReinforcementRound(ctx: HomeActionContext): void {
  ctx.startRound('pureReinforcement');
}

export function startBacklogRound(ctx: HomeActionContext): void {
  ctx.startRound('backlog');
}

export function generateNewBatch(ctx: HomeActionContext): void {
  ctx.generateBatch();
}

export function studyCurrentBatch(ctx: HomeActionContext): void {
  ctx.studyBatch();
}

/** A Home action as rendered in the §7 grid: a label and the function it runs. */
export interface HomeActionDescriptor {
  readonly id: string;
  readonly label: string;
  run(ctx: HomeActionContext): void;
}

/**
 * Display order for the action grid (§7): six actions, equal visual weight,
 * always enabled (REQ-13). The view maps over this list — it never branches on
 * an action id (REQ-E2). Labels match the §7 table.
 */
export const HOME_ACTIONS: readonly HomeActionDescriptor[] = [
  { id: 'explore', label: 'Explore', run: startExploreRound },
  { id: 'reinforcement', label: 'Reinforcement', run: startReinforcementRound },
  { id: 'pureReinforcement', label: 'Pure reinforcement', run: startPureReinforcementRound },
  { id: 'backlog', label: 'Backlog clearing', run: startBacklogRound },
  { id: 'generateBatch', label: 'Generate new batch', run: generateNewBatch },
  { id: 'studyBatch', label: 'Study current batch', run: studyCurrentBatch },
];
