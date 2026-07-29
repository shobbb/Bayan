/**
 * zod schemas for LLM responses (REQ-5): malformed responses are an
 * expected condition, not an exception. Nothing downstream of validation
 * reaches the domain layer with an untyped shape. Schemas for other query
 * kinds (sentence/distractor generation) are added alongside the flows that
 * use them (build order steps 9+).
 */
import { z } from 'zod';

export const llmSegmentSchema = z.object({
  text: z.string().min(1),
  gloss: z.string().nullable(),
  forms: z.string().nullable(),
});

export const llmRoundResponseSchema = z.object({
  titleAr: z.string().min(1),
  titleEn: z.string().min(1),
  segments: z.array(llmSegmentSchema).min(1),
});

export type LlmSegment = z.infer<typeof llmSegmentSchema>;
export type LlmRoundResponse = z.infer<typeof llmRoundResponseSchema>;

/**
 * Batched example sentences for a card batch (§9). Keyed by the word each
 * sentence illustrates so a partial or reordered response still maps back
 * correctly — position would be a fragile join.
 */
export const llmSentenceSchema = z.object({
  word: z.string().min(1),
  sentence: z.string().min(1),
});

export const llmSentencesResponseSchema = z.object({
  sentences: z.array(llmSentenceSchema),
});

export type LlmSentence = z.infer<typeof llmSentenceSchema>;
export type LlmSentencesResponse = z.infer<typeof llmSentencesResponseSchema>;
