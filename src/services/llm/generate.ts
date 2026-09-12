/**
 * Generation orchestration: send a composed prompt, validate the response
 * with zod (REQ-5), retry once on validation failure, then surface a
 * user-facing error with the raw response attached for inspection (REQ-17).
 */
import { z } from 'zod';
import type { ModelRoute } from '@/config/models';
import { anthropicClient, type LlmClient } from './client';
import {
  llmGlossesResponseSchema,
  llmRoundResponseSchema,
  llmSentencesResponseSchema,
  type LlmGlossesResponse,
  type LlmRoundResponse,
  type LlmSentencesResponse,
} from './schemas';
import {
  buildGlossPrompt,
  buildRoundGenerationPrompt,
  buildSentenceGenerationPrompt,
  type GlossPromptParams,
  type RoundPromptParams,
  type SentencePromptParams,
} from './prompts';

export class LlmValidationError extends Error {
  readonly rawResponse: string;
  readonly issues: z.ZodIssue[];
  /** The last attempt ran out of output budget, so rawResponse is cut off. */
  readonly truncated: boolean;

  constructor(message: string, rawResponse: string, issues: z.ZodIssue[], truncated = false) {
    super(message);
    this.name = 'LlmValidationError';
    this.rawResponse = rawResponse;
    this.issues = issues;
    this.truncated = truncated;
  }

  /**
   * Operator-facing detail for REQ-17 ("the raw response is available for
   * inspection"). Without this the raw text is attached to an error nobody
   * ever reads, and every distinct failure reads as the same one sentence.
   */
  describe(): string {
    const parts: string[] = [];
    if (this.truncated) {
      parts.push(
        'The response was cut off because it hit the model output limit ' +
          '(max_tokens). Raise maxTokens for this route, or lower the round ' +
          'word count.',
      );
    }
    if (this.issues.length > 0) {
      const listed = this.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
      parts.push(`Schema issues:\n${listed.join('\n')}`);
    } else if (!this.truncated) {
      parts.push('The response was not valid JSON.');
    }
    const tail = this.rawResponse.slice(-400);
    if (tail) parts.push(`Response ends:\n…${tail}`);
    return parts.join('\n\n');
  }
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  return JSON.parse(candidate);
}

async function generateAndValidate<T>(
  client: LlmClient,
  route: ModelRoute,
  apiKey: string,
  prompt: string,
  schema: z.ZodType<T>,
  maxRetries: number,
): Promise<T> {
  let lastRaw = '';
  let lastIssues: z.ZodIssue[] = [];
  let lastTruncated = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const completion = await client.complete({
      model: route.model,
      maxTokens: route.maxTokens,
      temperature: route.temperature,
      prompt,
      apiKey,
    });
    lastRaw = completion.text;
    lastTruncated = completion.truncated;

    // A truncated response is a budget problem, not a compliance problem.
    // Retrying spends another full generation to arrive at the same cut-off,
    // so stop and say what actually went wrong.
    if (completion.truncated) break;

    let parsed: unknown;
    try {
      parsed = extractJson(completion.text);
    } catch {
      lastIssues = [];
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    lastIssues = result.error.issues;
  }

  throw new LlmValidationError(
    lastTruncated
      ? 'LLM response was truncated at the output limit'
      : 'LLM response failed schema validation',
    lastRaw,
    lastIssues,
    lastTruncated,
  );
}

/** §8 generation flow, step 2: llm.generateRound(plan) -> validated { titleAr, titleEn, segments }. */
export async function generateRound(
  params: RoundPromptParams,
  route: ModelRoute,
  apiKey: string,
  maxRetries: number,
  client: LlmClient = anthropicClient,
): Promise<LlmRoundResponse> {
  const prompt = buildRoundGenerationPrompt(params);
  return generateAndValidate(client, route, apiKey, prompt, llmRoundResponseSchema, maxRetries);
}

/** §9: one batched call for all of a batch's example sentences. */
export async function generateSentences(
  params: SentencePromptParams,
  route: ModelRoute,
  apiKey: string,
  maxRetries: number,
  client: LlmClient = anthropicClient,
): Promise<LlmSentencesResponse> {
  const prompt = buildSentenceGenerationPrompt(params);
  return generateAndValidate(client, route, apiKey, prompt, llmSentencesResponseSchema, maxRetries);
}

/** Batched glosses for words met in reading but never translated (REQ-A10). */
export async function generateGlosses(
  params: GlossPromptParams,
  route: ModelRoute,
  apiKey: string,
  maxRetries: number,
  client: LlmClient = anthropicClient,
): Promise<LlmGlossesResponse> {
  const prompt = buildGlossPrompt(params);
  return generateAndValidate(client, route, apiKey, prompt, llmGlossesResponseSchema, maxRetries);
}
