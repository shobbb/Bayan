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
  | 'wordGlossing' // translations for words met in published text
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

/**
 * maxTokens is a ceiling, not a reservation — billing follows what the model
 * actually emits, so a generous ceiling costs nothing on a short response and
 * is the difference between working and not on a long one.
 *
 * Sizing is measured, not guessed. A 40-word transcribed round serializes to
 * ~2,990 characters of JSON, i.e. ~75 characters per glossed word once
 * segments carry text + gloss + forms. At the 140-word ceiling in
 * config/generation.ts that is ~10,500 characters, and fully vowelled Arabic
 * tokenizes far worse than English — comfortably past 4,000 tokens, which is
 * where round generation was silently truncating mid-JSON and surfacing as a
 * schema failure.
 */
export const DEFAULT_MODEL_ROUTES: ModelRoutes = {
  roundGeneration: { model: CHEAPEST_MODEL, maxTokens: 16000, temperature: 0.8 },
  // ~40 cards x one vowelled sentence, plus the echoed word for matching.
  sentenceGeneration: { model: CHEAPEST_MODEL, maxTokens: 8000, temperature: 0.7 },
  distractorGeneration: { model: CHEAPEST_MODEL, maxTokens: 2000, temperature: 0.9 },
  // ~100 words a call, each answering with a gloss, forms and a part of speech.
  // Low temperature: a gloss is a lookup, not a composition.
  wordGlossing: { model: CHEAPEST_MODEL, maxTokens: 8000, temperature: 0.2 },
  diacritization: { model: CHEAPEST_MODEL, maxTokens: 8000, temperature: 0.2 },
};
