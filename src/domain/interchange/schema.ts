/**
 * The interchange schema (§14.1). One schema, versioned, same shape both
 * directions (REQ-I1). It is a contract with an external tool, not an internal
 * type — changes to it are versioned, not casual.
 *
 * Everything is validated here before a single record is written (REQ-I8).
 */
import { z } from 'zod';

const partOfSpeechSchema = z.enum(['verb', 'noun', 'adjective', 'particle', 'phrase']);

/**
 * External data uses kebab-case for the compound round types. Accept both
 * spellings and normalize to the internal union rather than rejecting a valid
 * export over a naming difference.
 */
const roundTypeSchema = z
  .enum([
    'explore',
    'reinforcement',
    'pureReinforcement',
    'pure-reinforcement',
    'backlog',
    'backlog-clearing',
  ])
  .transform((value) => {
    if (value === 'pure-reinforcement') return 'pureReinforcement' as const;
    if (value === 'backlog-clearing') return 'backlog' as const;
    return value;
  });

const srsStateSchema = z.object({
  dueAt: z.number(),
  intervalDays: z.number(),
  ease: z.number(),
  reps: z.number(),
  lapses: z.number(),
});

const segmentSchema = z.object({
  text: z.string(),
  gloss: z.string().nullable(),
  forms: z.string().nullable(),
});

export const interchangeWordSchema = z.object({
  /** Absent on import ⇒ derived via the language profile's normalize (§14.1). */
  id: z.string().optional(),
  surface: z.string(),
  gloss: z.string().nullable(),
  forms: z.string().nullable(),
  partOfSpeech: partOfSpeechSchema.nullable(),
  seenCount: z.number(),
  unclearCount: z.number(),
  firstSeenAt: z.number().nullable(),
  lastSeenAt: z.number().nullable(),
  roundIds: z.array(z.string()),
  srs: srsStateSchema.nullable(),
});

export const interchangeRoundSchema = z.object({
  id: z.string(),
  titleAr: z.string(),
  titleEn: z.string(),
  topic: z.string(),
  format: z.string(),
  roundType: roundTypeSchema,
  distinctForms: z.number(),
  flagCount: z.number().nullable(),
  createdAt: z.number().nullable(),
  segments: z.array(segmentSchema).nullable(),
  notes: z.string().nullable(),
});

/**
 * Per-article progress. Optional, and the schema version stays at 1: this is
 * purely additive, so a dump written before it existed still validates and a
 * dump carrying it still parses in the external tooling, which ignores keys it
 * does not know. Bumping the version would break that round trip for a field
 * nothing outside the app reads (REQ-I1).
 */
export const interchangeArticleReadSchema = z.object({
  id: z.string(),
  readAt: z.number(),
  flaggedIndices: z.array(z.number()),
});

/**
 * Translations bought from the model for words met in published articles.
 *
 * Carried for the same reason as article progress, and with more at stake:
 * these cost real money to produce, so a restore that dropped them would make
 * the reader pay for them a second time, article by article.
 */
export const interchangeGlossSchema = z.object({
  id: z.string(),
  gloss: z.string(),
  forms: z.string().nullable(),
  createdAt: z.number(),
});

export const stateExportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.number(),
  source: z.enum(['app', 'external']),
  words: z.array(interchangeWordSchema),
  rounds: z.array(interchangeRoundSchema),
  categories: z.object({ topics: z.array(z.string()), formats: z.array(z.string()) }),
  config: z.unknown().nullable(),
  articleReads: z.array(interchangeArticleReadSchema).optional(),
  glosses: z.array(interchangeGlossSchema).optional(),
});

export type StateExport = z.infer<typeof stateExportSchema>;
export type InterchangeWord = z.infer<typeof interchangeWordSchema>;
export type InterchangeRound = z.infer<typeof interchangeRoundSchema>;
export type InterchangeArticleRead = z.infer<typeof interchangeArticleReadSchema>;
export type InterchangeGloss = z.infer<typeof interchangeGlossSchema>;

export interface ValidationFailure {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; value: StateExport }
  | { ok: false; failures: ValidationFailure[] };

/**
 * REQ-I8: on failure, report which records failed and why, and import nothing.
 * Partial writes are prohibited, so parsing is all-or-nothing.
 */
export function parseStateExport(input: unknown): ParseResult {
  const result = stateExportSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };

  return {
    ok: false,
    failures: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}
