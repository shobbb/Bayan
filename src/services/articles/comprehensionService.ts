/**
 * Comprehension questions for a published article.
 *
 * Asked for, never automatic: each is a model call on the reader's key
 * (REQ-15) — writing a set, and marking each free answer submitted. The hosted
 * route answers, as it does for round generation. Nothing else is asked if it
 * fails: the reader sees the failure.
 */
import type { AppConfig } from '@/config';
import type { Article } from '@/domain/articles/types';
import {
  progressFor,
  shuffleOptions,
  type ComprehensionProgress,
  type ComprehensionQuestion,
  type ComprehensionSet,
  type FreeResponseQuestion,
  type FreeResponseVerdict,
} from '@/domain/articles/comprehension';
import {
  getComprehension,
  getComprehensionProgress,
  putComprehension,
  putComprehensionProgress,
} from '@/data/comprehensionRepository';
import { generateComprehension, gradeFreeResponse } from '@/services/llm/generate';
import { getApiKey } from '@/services/platform/storage';
import { MissingApiKeyError } from '@/services/rounds/roundService';

/** How many of each kind a set holds. */
export const MULTIPLE_CHOICE_COUNT = 4;
export const FREE_RESPONSE_COUNT = 2;

/** The set already written for this article, if there is one. */
export async function storedComprehension(articleId: string): Promise<ComprehensionSet | null> {
  return (await getComprehension(articleId)) ?? null;
}

/** Writes a fresh set for the article, stores it, and returns it. */
export async function createComprehension(
  article: Article,
  config: AppConfig,
  now = Date.now(),
): Promise<ComprehensionSet> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const response = await generateComprehension(
    {
      titleAr: article.titleAr,
      paragraphs: article.paragraphs,
      multipleChoiceCount: MULTIPLE_CHOICE_COUNT,
      freeResponseCount: FREE_RESPONSE_COUNT,
    },
    config.models.comprehension,
    apiKey,
    config.generation.maxValidationRetries,
  );

  const questions: ComprehensionQuestion[] = response.questions.map((q) =>
    q.type === 'multipleChoice'
      ? shuffleOptions({
          kind: 'multipleChoice',
          prompt: q.question.trim(),
          options: q.options.map((option) => option.trim()),
          correctIndex: q.correctIndex,
        })
      : { kind: 'freeResponse', prompt: q.question.trim(), referenceAnswer: q.answer.trim() },
  );

  const set: ComprehensionSet = { articleId: article.id, questions, createdAt: now };
  await putComprehension(set);
  return set;
}

/** Saved progress through this set, or a fresh start if there is none for it. */
export async function loadComprehensionProgress(
  set: ComprehensionSet,
  now = Date.now(),
): Promise<ComprehensionProgress> {
  return progressFor(set, await getComprehensionProgress(set.articleId), now);
}

export async function saveComprehensionProgress(progress: ComprehensionProgress): Promise<void> {
  await putComprehensionProgress(progress);
}

/** Marks one free answer. */
export async function gradeAnswer(
  article: Article,
  question: FreeResponseQuestion,
  answer: string,
  config: AppConfig,
): Promise<FreeResponseVerdict> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const verdict = await gradeFreeResponse(
    {
      titleAr: article.titleAr,
      paragraphs: article.paragraphs,
      question: question.prompt,
      referenceAnswer: question.referenceAnswer,
      learnerAnswer: answer.trim(),
    },
    config.models.comprehension,
    apiKey,
    config.generation.maxValidationRetries,
  );
  return { pass: verdict.pass, feedback: verdict.feedback.trim() };
}
