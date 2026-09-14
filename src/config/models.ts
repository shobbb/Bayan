/**
 * Model routing (§3.2). Different query kinds have different cost/quality
 * requirements — route them independently rather than hardcoding one model
 * app-wide.
 *
 * Every route is editable in Settings, which is where a changed model name is
 * meant to be fixed: identifiers move faster than releases, so the defaults
 * below are a starting point rather than a promise.
 */
export type QueryKind =
  | 'roundGeneration' // story/article + glosses + diacritics
  | 'sentenceGeneration' // batched example sentences for cards
  | 'distractorGeneration' // multiple-choice wrong answers
  | 'wordGlossing' // translations for words met in published text
  | 'diacritization'; // optional: re-vowel existing text

/**
 * How hard the model works on a request, and so what it costs.
 *
 * This replaces temperature. The Claude 5 family removed `temperature`,
 * `top_p` and `top_k` outright — sending any of them is a 400 — and put
 * `output_config.effort` in their place. The two are not the same knob:
 * temperature set how random the sampling was, effort sets how much thinking
 * the model spends before answering. There is no randomness dial any more.
 */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelRoute {
  model: string;
  maxTokens: number;
  effort: Effort;
}

export type ModelRoutes = Record<QueryKind, ModelRoute>;

/**
 * One model on every route: the tier below the top.
 *
 * This is a quality floor rather than a cost choice. Everything the app
 * produces is Arabic that the learner cannot yet check — a wrong gloss, a
 * mis-vowelled passage or a distractor that is accidentally correct all read as
 * authoritative, and the learner has no way to tell. The cheapest tier was
 * measurably not good enough at that, and the per-call saving is not worth
 * teaching someone a word that is wrong.
 *
 * Routes stay per-query-kind (REQ-C2) so any one of them can be escalated to
 * the top tier on its own. Diacritization quality remains the binding
 * constraint on generation, so roundGeneration is the first to move if output
 * vowelling proves unreliable.
 */
const DEFAULT_MODEL = 'claude-sonnet-5';

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
  // Writes the passage and vowels every letter of it. REQ-C2 makes that
  // vowelling the binding constraint on the whole method, so it gets the depth.
  roundGeneration: { model: DEFAULT_MODEL, maxTokens: 16000, effort: 'high' },
  // ~40 cards x one vowelled sentence, plus the echoed word for matching.
  sentenceGeneration: { model: DEFAULT_MODEL, maxTokens: 8000, effort: 'medium' },
  // Wrong answers for multiple choice — the one route where being slightly off
  // is the point, and a card survives a weak distractor.
  distractorGeneration: { model: DEFAULT_MODEL, maxTokens: 8000, effort: 'low' },
  // ~100 words a call, each answering with a gloss, forms and a part of speech.
  // A gloss is a lookup rather than a composition, but a wrong one is kept and
  // shown as fact, so this does not go below medium.
  wordGlossing: { model: DEFAULT_MODEL, maxTokens: 8000, effort: 'medium' },
  diacritization: { model: DEFAULT_MODEL, maxTokens: 8000, effort: 'high' },
};
