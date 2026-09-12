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
  /** Write the whole corpus to remote storage (§13 Remote backup). */
  syncNow: () => void;
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

export function syncNow(ctx: HomeActionContext): void {
  ctx.syncNow();
}

/**
 * How prominently an action is drawn (REQ-49). Ranked by how often it is
 * reached for, never by how important it sounds.
 *
 * This lives on the descriptor rather than in the view so that ranking an
 * action stays a fact about the action, and the view keeps mapping over the
 * list without ever branching on an id (REQ-E2).
 */
export type ActionRank = 'primary' | 'secondary' | 'tertiary';

/** A Home action as rendered in §7: a label, its rank, and the function it runs. */
export interface HomeActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly rank: ActionRank;
  /** One line on what this round type does, shown with the secondary group. */
  readonly hint?: string;
  run(ctx: HomeActionContext): void;
}

/**
 * The six actions (§7), always enabled (REQ-13). Ranking is not gating: every
 * one of these is on screen and one tap away. Labels match the §7 table.
 *
 * The four round types are deliberately one rank — they are four ways to do the
 * same thing, and drawing them as peers of "Study" is what made this screen
 * read as six unrelated demands.
 */
export const HOME_ACTIONS: readonly HomeActionDescriptor[] = [
  { id: 'studyBatch', label: 'Study', rank: 'primary', run: studyCurrentBatch },
  {
    id: 'explore',
    label: 'Explore',
    rank: 'secondary',
    hint: 'Mostly new vocabulary',
    run: startExploreRound,
  },
  {
    id: 'reinforcement',
    label: 'Reinforcement',
    rank: 'secondary',
    hint: 'Familiar words, a little new',
    run: startReinforcementRound,
  },
  {
    id: 'pureReinforcement',
    label: 'Pure reinforcement',
    rank: 'secondary',
    hint: 'Nothing new at all',
    run: startPureReinforcementRound,
  },
  {
    id: 'backlog',
    label: 'Backlog clearing',
    rank: 'secondary',
    hint: 'Words you have not seen in a while',
    run: startBacklogRound,
  },
  { id: 'generateBatch', label: 'Generate new batch', rank: 'tertiary', run: generateNewBatch },
  { id: 'syncNow', label: 'Back up now', rank: 'tertiary', run: syncNow },
];

/** Actions at a given rank, in declaration order. */
export function actionsRanked(rank: ActionRank): readonly HomeActionDescriptor[] {
  return HOME_ACTIONS.filter((action) => action.rank === rank);
}
