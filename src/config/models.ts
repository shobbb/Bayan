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

// REQ-C2: diacritization quality is the binding constraint on generation
// quality — if output vowelling is unreliable, escalate roundGeneration
// before changing anything else.
export const DEFAULT_MODEL_ROUTES: ModelRoutes = {
  roundGeneration: { model: '<capable>', maxTokens: 4000, temperature: 0.8 },
  sentenceGeneration: { model: '<mid>', maxTokens: 3000, temperature: 0.7 },
  distractorGeneration: { model: '<cheap>', maxTokens: 1000, temperature: 0.9 },
  diacritization: { model: '<capable>', maxTokens: 4000, temperature: 0.2 },
};
