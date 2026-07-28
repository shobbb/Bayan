/**
 * Round types are strategies, not switch cases (§18.2). Each type lives in its
 * own file and is registered in one map; adding a type touches the new file,
 * the registry, and a label in config — nothing else. There is no
 * `switch (roundType)` anywhere outside that registry (REQ-E2).
 */
import type { AlgorithmConfig, Categories } from '@/config';
import type { LanguageProfile, Round, RoundType, Segment, Word, WordId } from '@/domain/types';

/**
 * Everything a strategy is allowed to see. Passed in rather than fetched:
 * domain/ stays independently unit-testable with no DB and no browser APIs
 * (§2.1, REQ-4).
 */
export interface SelectionContext {
  /** Every tracked word for the active track. */
  words: Word[];
  /** Rounds for the active track, chronological, oldest first. */
  rounds: Round[];
  /** The most recent round, or null before any round exists. */
  previousRound: Round | null;
  algorithm: AlgorithmConfig;
  /** Arabic-specific handling stays behind the profile (REQ-E7). */
  profile: LanguageProfile;
  /** Injected so draws and tie-breaks are deterministic under test. */
  random: () => number;
}

export interface RoundTypeStrategy {
  readonly id: RoundType;
  readonly label: string;
  /** Constrain the candidate word pool. */
  selectWords(pool: Word[], ctx: SelectionContext): WordId[];
  /** Constrain topic/format choice, e.g. exclude the previous round's topic. */
  constrainCategories(available: Categories, ctx: SelectionContext): Categories;
  /** Extra instructions appended to the generation prompt (REQ-E9). */
  promptDirectives(): string[];
  /** Optional post-generation gate. Return null to accept, or a reason to regenerate. */
  validate?(segments: Segment[], ctx: SelectionContext): string | null;
}

/** Words the learner has actually encountered — the "known" pool. */
export function knownWords(pool: Word[]): Word[] {
  return pool.filter((word) => word.seenCount > 0);
}

/** Words present in the corpus but never yet shown — the backlog pool. */
export function unseenWords(pool: Word[]): Word[] {
  return pool.filter((word) => word.seenCount === 0);
}

/** Rounds carry the topic; a strategy may need the most recent one. */
export function previousTopic(previousRound: Round | null): string | null {
  return previousRound?.topic ?? null;
}
