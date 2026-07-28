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
