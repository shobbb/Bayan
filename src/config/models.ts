/**
 * Model routing (§3.2). Different query kinds have different cost/quality
 * requirements — route them independently rather than hardcoding one model
 * app-wide. Model identifiers are left as placeholders; resolve at setup time
 * (model names change frequently and hardcoding current ones guarantees
 * staleness).
 */
export type QueryKind =
  | 'roundGeneration' // story/article + glosses + diacritics
  | 'sentenceGeneration' // batched example sentences for cards
  | 'distractorGeneration' // multiple-choice wrong answers
  | 'diacritization'; // optional: re-vowel existing text

export interface ModelRoute {
  model: string;
  maxTokens: number;
  temperature: number;
}

export type ModelRoutes = Record<QueryKind, ModelRoute>;

/**
 * Cheapest available model on every route while the method is under test —
 * an explicit cost choice, not a quality judgement.
 *
 * REQ-C2: diacritization quality is the binding constraint on generation
 * quality. If output vowelling proves unreliable, escalate `roundGeneration`
 * to a more capable model before changing anything else — that is the whole
 * reason routes are per-query-kind rather than one model app-wide.
 */
const CHEAPEST_MODEL = 'claude-haiku-4-5';

export const DEFAULT_MODEL_ROUTES: ModelRoutes = {
  roundGeneration: { model: CHEAPEST_MODEL, maxTokens: 4000, temperature: 0.8 },
  sentenceGeneration: { model: CHEAPEST_MODEL, maxTokens: 3000, temperature: 0.7 },
  distractorGeneration: { model: CHEAPEST_MODEL, maxTokens: 1000, temperature: 0.9 },
  diacritization: { model: CHEAPEST_MODEL, maxTokens: 4000, temperature: 0.2 },
};
