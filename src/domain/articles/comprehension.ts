/**
 * Comprehension questions on a published article.
 *
 * Written by a model from the article's own text and kept per article, so a
 * set is paid for once and taken as many times as the reader likes. Questions
 * test whether the text was understood, not whether a word was known — that is
 * what flags and drills are for — so nothing here touches the corpus.
 */

/** Which kinds of question exist. Only one so far; the field keeps room for more. */
export type ComprehensionQuestionKind = 'multipleChoice';

export interface ComprehensionQuestion {
  kind: ComprehensionQuestionKind;
  /** The question, in Arabic. */
  prompt: string;
  /** Four options, in Arabic, in the order shown. */
  options: string[];
  /** Index into `options` of the one answer the text supports. */
  correctIndex: number;
}

export interface ComprehensionSet {
  articleId: string;
  questions: ComprehensionQuestion[];
  createdAt: number;
}

/**
 * Moves each question's correct option to a random position.
 *
 * Models put the right answer first far more often than a quarter of the time,
 * and a reader learns that pattern faster than they read the text. The options
 * themselves are left untouched.
 */
export function shuffleOptions(
  question: ComprehensionQuestion,
  random: () => number = Math.random,
): ComprehensionQuestion {
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
