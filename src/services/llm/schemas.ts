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

/**
 * Batched glosses for words met in reading (§ article source, REQ-A8). Keyed by
 * the echoed word for the same reason sentences are: a positional join would
 * silently mispair a reordered or partial response.
 */
export const llmGlossSchema = z.object({
  word: z.string().min(1),
  gloss: z.string().min(1),
  forms: z.string().nullable().optional(),
  partOfSpeech: z.enum(['verb', 'noun', 'adjective', 'particle', 'phrase']).nullable().optional(),
});

export const llmGlossesResponseSchema = z.object({
  glosses: z.array(llmGlossSchema),
});

export type LlmGloss = z.infer<typeof llmGlossSchema>;
export type LlmGlossesResponse = z.infer<typeof llmGlossesResponseSchema>;

export type LlmSentence = z.infer<typeof llmSentenceSchema>;
export type LlmSentencesResponse = z.infer<typeof llmSentencesResponseSchema>;

/**
 * Comprehension questions on one article: multiple choice and free response.
 *
 * Each multiple-choice question is checked on its own terms — four distinct
 * options and an answer that points at one of them — because one whose answer
 * index is out of range, or whose "wrong" option repeats the right one, cannot
 * be marked fairly. A free-response question carries the answer the text
 * supports, which the grader is given as a guide.
 */
export const llmMultipleChoiceQuestionSchema = z
  .object({
    type: z.literal('multipleChoice'),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(4),
    correctIndex: z.number().int().min(0).max(3),
  })
  .refine((q) => new Set(q.options.map((o) => o.trim())).size === q.options.length, {
    message: 'options must be distinct',
    path: ['options'],
  });

export const llmFreeResponseQuestionSchema = z.object({
  type: z.literal('freeResponse'),
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const llmComprehensionQuestionSchema = z.union([
  llmMultipleChoiceQuestionSchema,
  llmFreeResponseQuestionSchema,
]);

export const llmComprehensionResponseSchema = z.object({
  questions: z.array(llmComprehensionQuestionSchema).min(1),
});

export type LlmComprehensionResponse = z.infer<typeof llmComprehensionResponseSchema>;

/** The grader's verdict on one free answer. */
export const llmGradeResponseSchema = z.object({
  pass: z.boolean(),
  feedback: z.string().min(1),
});

export type LlmGradeResponse = z.infer<typeof llmGradeResponseSchema>;
