/**
 * Comprehension questions for a published article.
 *
 * Asked for, never automatic: it is a model call on the reader's key (REQ-15).
 * The hosted route answers, as it does for round generation — writing
 * questions with a correct answer key is composition, and nothing else is
 * asked if it fails: the reader sees the failure.
 */
import type { AppConfig } from '@/config';
import type { Article } from '@/domain/articles/types';
import {
  shuffleOptions,
  type ComprehensionQuestion,
  type ComprehensionSet,
} from '@/domain/articles/comprehension';
import { getComprehension, putComprehension } from '@/data/comprehensionRepository';
import { generateComprehension } from '@/services/llm/generate';
import { getApiKey } from '@/services/platform/storage';
import { MissingApiKeyError } from '@/services/rounds/roundService';

/** How many questions a set holds. */
export const COMPREHENSION_QUESTION_COUNT = 5;

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
      count: COMPREHENSION_QUESTION_COUNT,
    },
    config.models.comprehension,
    apiKey,
    config.generation.maxValidationRetries,
  );

  const questions: ComprehensionQuestion[] = response.questions.map((q) =>
    shuffleOptions({
      kind: 'multipleChoice',
      prompt: q.question.trim(),
      options: q.options.map((option) => option.trim()),
      correctIndex: q.correctIndex,
    }),
  );

  const set: ComprehensionSet = { articleId: article.id, questions, createdAt: now };
  await putComprehension(set);
  return set;
}
