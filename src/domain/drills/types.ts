/**
 * Drill modes (§10, §18.3). Each mode owns its own preparation and grading;
 * the session runner never inspects a mode's response shape — it receives a
 * Grade and hands it to the scheduler (REQ-E3).
 *
 * §18.3 sketches this interface with a `component` field. That part lives in
 * ui/ instead, keyed by the same ids: domain must stay independently unit
 * testable with no browser or React dependency (REQ-4, §2.1). Everything that
 * decides anything — what to ask, what counts as correct — is here, where it
 * can be tested without rendering.
 */
import type { Grade, Word } from '@/domain/types';

export type DrillModeId = 'flashcard' | 'multipleChoice' | 'writeIn';

export interface DrillItem {
  readonly mode: DrillModeId;
  readonly word: Word;
  /** Arabic example sentence from the batch, when one was generated (§9). */
  readonly sentence: string | null;
  /** Multiple-choice options, already shuffled. Empty for other modes. */
  readonly options: readonly string[];
  /** Index of the correct option within `options`. -1 when not applicable. */
  readonly correctIndex: number;
}

export interface PrepareContext {
  /** The wider corpus, for drawing distractors. */
  corpus: readonly Word[];
  /** Example sentences by word id, from the current batch. */
  sentences: Readonly<Record<string, string>>;
  /** Typo tolerance for written answers (REQ-26). */
  maxLevenshteinDistance: number;
  random: () => number;
}

/**
 * The outcome of grading, richer than the Grade alone so the view can show the
 * learner what happened (REQ-41) without re-deriving it.
 */
export interface DrillOutcome {
  grade: Grade;
  correct: boolean;
  /** The canonical gloss, shown on both correct and incorrect responses (REQ-26). */
  canonical: string;
  /** Set when typo tolerance credited an inexact answer (REQ-41). */
  acceptedAs?: string;
}

export interface DrillModeLogic {
  readonly id: DrillModeId;
  readonly label: string;
  prepare(word: Word, ctx: PrepareContext): DrillItem;
  grade(response: unknown, item: DrillItem, ctx: PrepareContext): DrillOutcome;
}

/** Glosses often carry several senses; each is independently acceptable (REQ-26). */
export function glossAlternatives(gloss: string): string[] {
  return gloss
    .split(/[,;/]|\bor\b/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}
