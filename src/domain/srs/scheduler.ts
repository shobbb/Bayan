/**
 * Spaced repetition scheduling (§10.5, REQ-27).
 *
 * SM-2, which the spec names as acceptable. It is not invented here: the ease
 * update and interval progression below are the published algorithm, with the
 * four-grade scale mapped onto its 0-5 quality scale.
 *
 * Everything sits behind the Scheduler interface (REQ-E4) so swapping in FSRS
 * later is one new file plus a config value — no component and no repository
 * knows which implementation is in use.
 */
import type { Grade, SrsState } from '@/domain/types';

export interface Scheduler {
  readonly id: string;
  next(state: SrsState | null, grade: Grade, now: number): SrsState;
  isDue(state: SrsState, now: number): boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** SM-2 quality values for the four grades the UI offers (REQ-39). */
const QUALITY: Record<Grade, number> = {
  again: 2, // below 3: a lapse, the card relearns
  hard: 3,
  good: 4,
  easy: 5,
};

/** Published SM-2 bounds and seeds. */
const MIN_EASE = 1.3;
const INITIAL_EASE = 2.5;
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 6;

export function initialSrsState(now: number): SrsState {
  return { dueAt: now, intervalDays: 0, ease: INITIAL_EASE, reps: 0, lapses: 0 };
}

/** EF' = EF + (0.1 - (5-q)(0.08 + (5-q)0.02)), floored at 1.3. */
function nextEase(ease: number, quality: number): number {
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  return Math.max(MIN_EASE, ease + delta);
}

function nextIntervalDays(state: SrsState, quality: number, ease: number): number {
  // Quality below 3 is a lapse: the card returns to the start of the ladder.
  if (quality < 3) return FIRST_INTERVAL_DAYS;
  if (state.reps === 0) return FIRST_INTERVAL_DAYS;
  if (state.reps === 1) return SECOND_INTERVAL_DAYS;
  return Math.round(state.intervalDays * ease);
}

export const sm2Scheduler: Scheduler = {
  id: 'sm2',

  next(state, grade, now) {
    const current = state ?? initialSrsState(now);
    const quality = QUALITY[grade];
    const lapsed = quality < 3;

    const ease = nextEase(current.ease, quality);
    const intervalDays = nextIntervalDays(current, quality, ease);

    return {
      dueAt: now + intervalDays * DAY_MS,
      intervalDays,
      ease,
      // A lapse restarts the repetition count so the card climbs again.
      reps: lapsed ? 0 : current.reps + 1,
      lapses: lapsed ? current.lapses + 1 : current.lapses,
    };
  },

  isDue(state, now) {
    return state.dueAt <= now;
  },
};

/** The active scheduler. Swapping implementations is a change here only (REQ-E4). */
export const activeScheduler: Scheduler = sm2Scheduler;
