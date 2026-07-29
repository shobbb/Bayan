/**
 * The three drill modes (§10.2–10.4). Each owns its grading (REQ-E3).
 */
import type { Grade, Word } from '@/domain/types';
import { pickDistractors, shuffle } from './distractors';
import { levenshtein } from './levenshtein';
import {
  glossAlternatives,
  type DrillItem,
  type DrillModeLogic,
  type DrillOutcome,
  type PrepareContext,
} from './types';

const OPTION_COUNT = 4;

function sentenceFor(word: Word, ctx: PrepareContext): string | null {
  return ctx.sentences[word.id] ?? null;
}

function baseItem(word: Word, ctx: PrepareContext, mode: DrillItem['mode']): DrillItem {
  return { mode, word, sentence: sentenceFor(word, ctx), options: [], correctIndex: -1 };
}

/**
 * §10.2. The learner self-reports, so the four buttons map straight onto the
 * scheduler with no correct/incorrect abstraction in between (REQ-39).
 */
export const flashcardMode: DrillModeLogic = {
  id: 'flashcard',
  label: 'Flashcard',

  prepare(word, ctx) {
    return baseItem(word, ctx, 'flashcard');
  },

  grade(response, item) {
    const grade = response as Grade;
    return {
      grade,
      // "Again" is the only self-report that means the word was not recalled.
      correct: grade !== 'again',
      canonical: item.word.gloss,
    };
  },
};

/** §10.3. Four English options over an Arabic prompt. */
export const multipleChoiceMode: DrillModeLogic = {
  id: 'multipleChoice',
  label: 'Multiple choice',

  prepare(word, ctx) {
    const distractors = pickDistractors(word, ctx.corpus, OPTION_COUNT - 1, ctx.random);
    // REQ-40: shuffled per presentation — a stable correct position is
    // learnable and would corrupt the signal.
    const options = shuffle([word.gloss.trim(), ...distractors], ctx.random);

    return {
      mode: 'multipleChoice',
      word,
      sentence: sentenceFor(word, ctx),
      options,
      correctIndex: options.indexOf(word.gloss.trim()),
    };
  },

  grade(response, item) {
    const correct = typeof response === 'number' && response === item.correctIndex;
    return {
      grade: correct ? 'good' : 'again',
      correct,
      canonical: item.word.gloss,
    };
  },
};

/** §10.4. Free recall, the strictest retrieval path. */
export const writeInMode: DrillModeLogic = {
  id: 'writeIn',
  label: 'Write in',

  prepare(word, ctx) {
    return baseItem(word, ctx, 'writeIn');
  },

  grade(response, item, ctx) {
    const typed = String(response ?? '').trim();
    const canonical = item.word.gloss;
    const normalized = typed.toLowerCase();
    const accepted = glossAlternatives(canonical);

    if (typed === '') {
      return { grade: 'again', correct: false, canonical };
    }

    // Any listed sense counts, exactly (REQ-26).
    if (accepted.includes(normalized)) {
      return { grade: 'good', correct: true, canonical };
    }

    // Otherwise allow a near miss, and report what was typed so the learner
    // sees the discrepancy even though it was credited (REQ-41).
    const nearest = accepted.reduce(
      (best, candidate) => Math.min(best, levenshtein(normalized, candidate)),
      Number.POSITIVE_INFINITY,
    );

    if (nearest <= ctx.maxLevenshteinDistance) {
      // Credited, but graded below an exact recall: it was not quite known.
      return { grade: 'hard', correct: true, canonical, acceptedAs: typed };
    }

    return { grade: 'again', correct: false, canonical, acceptedAs: typed };
  },
};

/**
 * The registry. Adding a mode touches its definition, this map, and a
 * component in ui/ — nothing else branches on mode (REQ-E2).
 */
export const DRILL_MODES: Readonly<Record<DrillModeLogic['id'], DrillModeLogic>> = {
  flashcard: flashcardMode,
  multipleChoice: multipleChoiceMode,
  writeIn: writeInMode,
};

export function getDrillMode(id: DrillModeLogic['id']): DrillModeLogic {
  return DRILL_MODES[id];
}

/**
 * REQ-42: the learner can overrule a rejection, because gloss matching is
 * imperfect and they are the authority on whether they knew the word.
 */
export function overrideAsCorrect(outcome: DrillOutcome): DrillOutcome {
  return { ...outcome, grade: 'good', correct: true };
}
