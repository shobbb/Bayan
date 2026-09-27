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
  /**
   * Answer with the on-device model rather than the hosted one (§13).
   *
   * Free, offline and unmetered, which is what makes open-ended use
   * affordable — but smaller than the hosted route, so it is opt-in and the
   * two are meant to be compared on real text rather than argued about.
   * Ignored where there is no on-device model: a browser, or hardware without
   * Apple Intelligence or Gemini Nano.
   */
  useLocalModel: boolean;
  /** Approx share of unseen vocabulary in a generated round, by round type. */
  newWordDensity: Record<RoundType, number>;
}

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  targetWordCount: { min: 90, max: 140 },
  maxValidationRetries: 1,
  requireFullDiacritics: true,
  arabicOnlyDefinitions: false,
  useLocalModel: false,
  newWordDensity: {
    explore: 0.2,
    reinforcement: 0.08,
    pureReinforcement: 0.0,
    backlog: 0.0,
  },
};
