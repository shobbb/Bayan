/**
 * Length targets, retries, and per-round-type vocabulary density (§3.5).
 */
import type { RoundType } from '@/domain/types';

export interface GenerationConfig {
  targetWordCount: { min: number; max: number };
  maxValidationRetries: number;
  requireFullDiacritics: boolean;
  /** Approx share of unseen vocabulary in a generated round, by round type. */
  newWordDensity: Record<RoundType, number>;
}

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  targetWordCount: { min: 90, max: 140 },
  maxValidationRetries: 1,
  requireFullDiacritics: true,
  newWordDensity: {
    explore: 0.2,
    reinforcement: 0.08,
    pureReinforcement: 0.0,
    backlog: 0.0,
  },
};
