/**
 * Generation orchestration: send a composed prompt, validate the response
 * with zod (REQ-5), retry once on validation failure, then surface a
 * user-facing error with the raw response attached for inspection (REQ-17).
 */
import { z } from 'zod';
import type { ModelRoute } from '@/config/models';
import { anthropicClient, type LlmClient } from './client';
import { llmRoundResponseSchema, type LlmRoundResponse } from './schemas';
import { buildRoundGenerationPrompt, type RoundPromptParams } from './prompts';

export class LlmValidationError extends Error {
  readonly rawResponse: string;
  readonly issues: z.ZodIssue[];

  constructor(message: string, rawResponse: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = 'LlmValidationError';
    this.rawResponse = rawResponse;
    this.issues = issues;
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

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const raw = await client.complete({
      model: route.model,
      maxTokens: route.maxTokens,
      temperature: route.temperature,
      prompt,
      apiKey,
    });
    lastRaw = raw;

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      lastIssues = [];
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    lastIssues = result.error.issues;
  }

  throw new LlmValidationError('LLM response failed schema validation', lastRaw, lastIssues);
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
