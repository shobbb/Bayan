/**
 * Comprehension questions on a published article.
 *
 * Written by a model from the article's own text and kept per article, so a
 * set is paid for once and taken as many times as the reader likes. Questions
 * test whether the text was understood, not whether a word was known — that is
 * what flags and drills are for — so nothing here touches the corpus.
 */

export type ComprehensionQuestionKind = 'multipleChoice' | 'freeResponse';

export interface MultipleChoiceQuestion {
  kind: 'multipleChoice';
  /** The question, in Arabic. */
  prompt: string;
  /** Four options, in Arabic, in the order shown. */
  options: string[];
  /** Index into `options` of the one answer the text supports. */
  correctIndex: number;
}

/**
 * A question answered in the reader's own words and judged by a model.
 *
 * The reference answer is what the model that wrote the question took the
 * text to say. It is handed to the grader as a guide, never shown to the
 * reader: a free answer that reaches the same point in other words passes.
 */
export interface FreeResponseQuestion {
  kind: 'freeResponse';
  prompt: string;
  referenceAnswer: string;
}

export type ComprehensionQuestion = MultipleChoiceQuestion | FreeResponseQuestion;

export interface ComprehensionSet {
  articleId: string;
  questions: ComprehensionQuestion[];
  createdAt: number;
}

/** What the grader said about one submitted free answer. */
export interface FreeResponseVerdict {
  pass: boolean;
  /** Short, in Arabic: what is missing or wrong, or a word of confirmation. */
  feedback: string;
}

export type QuestionAnswer =
  | { kind: 'multipleChoice'; chosen: number; correct: boolean }
  | {
      kind: 'freeResponse';
      /** What is in the box now, saved as it is typed. */
      draft: string;
      /** The text last submitted, and what came back for it. */
      submitted: string | null;
      verdict: FreeResponseVerdict | null;
    };

/**
 * A reader's way through one set, saved as they go so leaving mid-way —
 * backing out, the app being killed — costs nothing.
 *
 * Tied to the set it was made on by `setCreatedAt`: progress on a set that has
 * since been replaced describes questions that no longer exist.
 */
export interface ComprehensionProgress {
  articleId: string;
  setCreatedAt: number;
  /** By question index. A question with no entry has not been touched. */
  answers: Record<number, QuestionAnswer>;
  /** The question on screen; equal to the question count once finished. */
  position: number;
  completedAt: number | null;
  updatedAt: number;
}

export function emptyProgress(set: ComprehensionSet, now: number): ComprehensionProgress {
  return {
    articleId: set.articleId,
    setCreatedAt: set.createdAt,
    answers: {},
    position: 0,
    completedAt: null,
    updatedAt: now,
  };
}

/** Saved progress if it belongs to this set, otherwise a fresh start. */
export function progressFor(
  set: ComprehensionSet,
  saved: ComprehensionProgress | null | undefined,
  now: number,
): ComprehensionProgress {
  if (!saved || saved.setCreatedAt !== set.createdAt) return emptyProgress(set, now);
  return { ...saved, position: Math.min(saved.position, set.questions.length) };
}

/** Whether a question has been answered well enough to count. */
export function isAnsweredCorrectly(answer: QuestionAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.kind === 'multipleChoice' ? answer.correct : answer.verdict?.pass === true;
}

/** Whether a question is finished with, right or wrong. */
export function isSettled(answer: QuestionAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.kind === 'multipleChoice' || answer.verdict !== null;
}

export function score(
  set: ComprehensionSet,
  progress: ComprehensionProgress,
): { correct: number; total: number } {
  const correct = set.questions.filter((_, index) =>
    isAnsweredCorrectly(progress.answers[index]),
  ).length;
  return { correct, total: set.questions.length };
}

/**
 * Moves the correct option to a random position.
 *
 * Models put the right answer first far more often than a quarter of the time,
 * and a reader learns that pattern faster than they read the text. The options
 * themselves are left untouched.
 */
export function shuffleOptions(
  question: MultipleChoiceQuestion,
  random: () => number = Math.random,
): MultipleChoiceQuestion {
  const order = question.options.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return {
    ...question,
    options: order.map((index) => question.options[index]!),
    correctIndex: order.indexOf(question.correctIndex),
  };
}
