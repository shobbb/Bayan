/**
 * The three drill modes (§10.2–10.4). Each owns its grading (REQ-E3).
 */
import type { Grade, Word } from '@/domain/types';
import { glossFor } from '@/domain/glossLanguage';
import { pickDistractors, shuffle } from './distractors';
import { levenshtein } from './levenshtein';
import {
  glossAlternatives,
  type DrillItem,
  type DrillModeLogic,
  type DrillOutcome,
  type PrepareContext,
  type SelfReport,
} from './types';

const OPTION_COUNT = 4;

function sentenceFor(word: Word, ctx: PrepareContext): string | null {
  return ctx.sentences[word.id] ?? null;
}

function baseItem(word: Word, ctx: PrepareContext, mode: DrillItem['mode']): DrillItem {
  return {
    mode,
    word,
    answer: glossFor(word, ctx.glossLanguage),
    answerLanguage: ctx.glossLanguage,
    sentence: sentenceFor(word, ctx),
    options: [],
    correctIndex: -1,
  };
}

/**
 * The one place a two-way self-report becomes a scheduler grade (REQ-39).
 *
 * Deliberately not four-way. Asking mid-recall whether a word was "hard" or
 * "easy" is asking the learner to predict a scheduling interval, and the answer
 * is noisier than what the graded modes measure directly — so the granularity
 * that survives is the kind that is observed (REQ-47), not the kind that is
 * self-reported. SM-2 already lengthens intervals on a run of `good`; a
 * synthetic `easy` here would be second-guessing the scheduler with worse
 * information than it has.
 */
export function gradeForSelfReport(report: SelfReport): Grade {
  return report === 'known' ? 'good' : 'again';
}

/** §10.2. Flip to reveal, then Still learning / Know it — nothing else. */
export const flashcardMode: DrillModeLogic = {
  id: 'flashcard',
  label: 'Flashcard',

  prepare(word, ctx) {
    return baseItem(word, ctx, 'flashcard');
  },

  grade(response, item) {
    const report: SelfReport = response === 'known' ? 'known' : 'stillLearning';
    return {
      grade: gradeForSelfReport(report),
      correct: report === 'known',
      canonical: item.answer,
      canonicalLanguage: item.answerLanguage,
    };
  },
};

/**
 * §10.3. Four options over an Arabic prompt — English glosses, or Arabic
 * definitions when the setting asks for them (§13).
 *
 * The distractors come out in the right language for free: they are drawn from
 * the corpus rather than written by a model, so asking for the same field the
 * answer came from is the whole of the change.
 */
export const multipleChoiceMode: DrillModeLogic = {
  id: 'multipleChoice',
  label: 'Multiple choice',

  prepare(word, ctx) {
    const answer = glossFor(word, ctx.glossLanguage);
    const distractors = pickDistractors(
      word,
      ctx.corpus,
      OPTION_COUNT - 1,
      ctx.random,
      ctx.glossLanguage,
    );
    // REQ-40: shuffled per presentation — a stable correct position is
    // learnable and would corrupt the signal.
    const options = shuffle([answer, ...distractors], ctx.random);

    return {
      mode: 'multipleChoice',
      word,
      answer,
      answerLanguage: ctx.glossLanguage,
      sentence: sentenceFor(word, ctx),
      options,
      correctIndex: options.indexOf(answer),
    };
  },

  grade(response, item) {
    const correct = typeof response === 'number' && response === item.correctIndex;
    return {
      grade: correct ? 'good' : 'again',
      correct,
      canonical: item.answer,
      canonicalLanguage: item.answerLanguage,
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
    const canonical = item.answer;
    const canonicalLanguage = item.answerLanguage;
    const normalized = typed.toLowerCase();
    const accepted = glossAlternatives(canonical);

    if (typed === '') {
      return { grade: 'again', correct: false, canonical, canonicalLanguage };
    }

    // Any listed sense counts, exactly (REQ-26).
    if (accepted.includes(normalized)) {
      return { grade: 'good', correct: true, canonical, canonicalLanguage };
    }

    // Otherwise allow a near miss, and report what was typed so the learner
    // sees the discrepancy even though it was credited (REQ-41).
    const nearest = accepted.reduce(
      (best, candidate) => Math.min(best, levenshtein(normalized, candidate)),
      Number.POSITIVE_INFINITY,
    );

    if (nearest <= ctx.maxLevenshteinDistance) {
      // Credited, but graded below an exact recall: it was not quite known.
      return { grade: 'hard', correct: true, canonical, canonicalLanguage, acceptedAs: typed };
    }

    return { grade: 'again', correct: false, canonical, canonicalLanguage, acceptedAs: typed };
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
