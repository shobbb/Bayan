/**
 * Length targets, retries, and per-round-type vocabulary density (§3.5).
 */
import type { RoundType } from '@/domain/types';

export interface GenerationConfig {
  targetWordCount: { min: number; max: number };
  maxValidationRetries: number;
  requireFullDiacritics: boolean;
  /**
   * Define words in simple Arabic rather than English (§13).
   *
   * Changes what the model is asked for, which definition is shown, and which
   * drill modes run — writing an answer is dropped, since typing Arabic on an
   * English keyboard measures the keyboard.
   */
  arabicOnlyDefinitions: boolean;
  /** Approx share of unseen vocabulary in a generated round, by round type. */
  newWordDensity: Record<RoundType, number>;
}

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  targetWordCount: { min: 90, max: 140 },
  maxValidationRetries: 1,
  requireFullDiacritics: true,
  arabicOnlyDefinitions: false,
  newWordDensity: {
    explore: 0.2,
    reinforcement: 0.08,
    pureReinforcement: 0.0,
    backlog: 0.0,
  },
};
