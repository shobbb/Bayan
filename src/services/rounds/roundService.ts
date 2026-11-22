/**
 * The §8 generation flow, end to end:
 *   1. roundPlanner.plan(roundType, state) -> RoundPlan
 *   2. llm.generateRound(plan)             -> validated { titleAr, titleEn, paragraphs }
 *   3. Segment it as an article is, with the definitions already on hand
 *   4. Persist Round, increment seenCount for every distinct word
 *   5. Return it for rendering; defineRoundWords fills in the rest after
 *
 * The model writes the passage only. It used to write a vowelled definition
 * and forms for every word as well, which made its output about twenty times
 * the size of the passage and the wait to match, and most of those definitions
 * were for words the app could already define.
 *
 * Orchestration only: the selection rules live in domain/selector, the counting
 * rules in domain/rounds, the transport in services/llm, and the writes in
 * data/. Nothing here decides anything the domain could decide.
 */
import type { AppConfig } from '@/config';
import { planRound } from '@/domain/selector/roundPlanner';
import { getRoundTypeStrategy } from '@/domain/selector/roundTypes';
import type { SelectionContext } from '@/domain/selector/roundTypes/types';
import { countDistinctForms, ingestRoundWords } from '@/domain/rounds/ingest';
import { glossLanguageFor } from '@/domain/glossLanguage';
import { phraseId } from '@/domain/wordIdentity';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { Round, RoundType, Word } from '@/domain/types';
import { listWords, getWords, upsertWords } from '@/data/wordRepository';
import { listRounds, upsertRound } from '@/data/roundRepository';
import { generateRound } from '@/services/llm/generate';
import {
  enrichArticle,
  enrichWord,
  resegment,
  untranslatedIds,
} from '@/services/articles/enrichGlosses';
import { sentenceAround } from '@/domain/articles/context';
import type { ResolvedSegment } from '@/domain/articles/segment';
import { glossFieldFor } from '@/domain/glossLanguage';
import { paragraphsOf, passageArticle, plainSegments } from '@/domain/rounds/passage';
import { getApiKey } from '@/services/platform/storage';

import { MissingApiKeyError } from './missingApiKey';

export { MissingApiKeyError };

/** Round ids must be stable and unique; time plus randomness is sufficient here. */
function newRoundId(now: number): string {
  return `r_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateRoundOptions {
  now?: number;
  random?: () => number;
}

export async function createRound(
  roundType: RoundType,
  config: AppConfig,
  options: CreateRoundOptions = {},
): Promise<Round> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const now = options.now ?? Date.now();
  const random = options.random ?? Math.random;
  const profile = modernStandardArabicProfile;

  const [words, recentFirst] = await Promise.all([
    listWords(DEFAULT_TRACK_ID),
    listRounds(DEFAULT_TRACK_ID),
  ]);
  // The planner reads rounds oldest-first; the repository returns newest-first.
  const rounds = [...recentFirst].reverse();

  const ctx: SelectionContext = {
    words,
    rounds,
    previousRound: rounds[rounds.length - 1] ?? null,
    algorithm: config.algorithm,
    profile,
    random,
  };

  const plan = planRound(roundType, config.categories, ctx);
  const strategy = getRoundTypeStrategy(roundType);

  const targets: Word[] = await getWords(plan.targetWordIds);
  const route = config.models.roundGeneration;

  const response = await generateRound(
    {
      topic: plan.topic,
      format: plan.format,
      targetWords: targets.map((word) => word.surface),
      excludeTopics: plan.excludeTopics,
      directives: strategy.promptDirectives(),
      languageGuidance: profile.promptGuidance,
      minWords: config.generation.targetWordCount.min,
      maxWords: config.generation.targetWordCount.max,
    },
    route,
    apiKey,
    config.generation.maxValidationRetries,
  );

  const id = newRoundId(now);
  const language = glossLanguageFor(config.generation.arabicOnlyDefinitions);
  // The title is segmented with the body (that is how the article path works)
  // and dropped here: a round shows its title as plain text.
  const segmented = await resegment(passageArticle(id, response.titleAr, response.paragraphs), language);
  const segments = plainSegments(segmented.segments.slice(segmented.titleOffset));

  // Post-generation gate (§12.3): pureReinforcement rejects any new vocabulary.
  // Surfaced rather than silently regenerated — a second call costs real money,
  // and the caller decides whether to spend it.
  const rejection = strategy.validate?.(segments, ctx) ?? null;
  if (rejection) {
    throw new Error(`Generated round rejected: ${rejection}`);
  }

  const round: Round = {
    id,
    trackId: DEFAULT_TRACK_ID,
    titleAr: response.titleAr,
    titleEn: response.titleEn,
    topic: plan.topic,
    format: plan.format,
    roundType,
    segments,
    distinctForms: countDistinctForms(segments, profile),
    flagCount: null, // not read yet — a pull with no reward (REQ-32)
    createdAt: now,
  };

  const updatedWords = ingestRoundWords(
    segments,
    words,
    round.id,
    DEFAULT_TRACK_ID,
    profile,
    now,
    glossLanguageFor(config.generation.arabicOnlyDefinitions),
  );

  await upsertRound(round);
  await upsertWords(updatedWords);

  return round;
}

/** How many distinct words in this round still have no definition. */
export function undefinedWordCount(round: Round): number {
  return untranslatedIds(round.segments as ResolvedSegment[]).length;
}

/**
 * Puts newly written definitions onto the round and onto the learner's words.
 *
 * The words were added when the round was made, some with nothing to show; a
 * word's definition is what its flashcard shows, so filling the cache alone
 * would leave those cards blank. Only empty definitions are written — one the
 * learner already has is never replaced.
 */
async function applyDefinitions(
  round: Round,
  filled: readonly ResolvedSegment[],
  titleOffset: number,
  config: AppConfig,
): Promise<Round> {
  const profile = modernStandardArabicProfile;
  const field = glossFieldFor(glossLanguageFor(config.generation.arabicOnlyDefinitions));
  const segments = plainSegments(filled.slice(titleOffset));

  const byId = new Map<string, { gloss: string; forms: string | null }>();
  for (const segment of segments) {
    if (segment.gloss) byId.set(phraseId(segment.text, profile), { gloss: segment.gloss, forms: segment.forms });
  }
  const words = await getWords([...byId.keys()] as Word['id'][]);
  const updated = words
    .filter((word) => !(word[field] ?? '').trim())
    .map((word) => {
      const found = byId.get(word.id)!;
      return { ...word, [field]: found.gloss, forms: word.forms ?? found.forms };
    });

  const next = { ...round, segments };
  await upsertRound(next);
  if (updated.length > 0) await upsertWords(updated);
  return next;
}

/**
 * Defines every word in the round that has no definition yet, in one batched
 * call — run in the background once the round is open, so its new words have
 * a definition to show and a flashcard to make.
 */
export async function defineRoundWords(round: Round, config: AppConfig): Promise<Round> {
  if (undefinedWordCount(round) === 0) return round;
  const language = glossLanguageFor(config.generation.arabicOnlyDefinitions);
  const article = passageArticle(round.id, round.titleAr, paragraphsOf(round.segments));
  const current = await resegment(article, language);
  const { segments } = await enrichArticle(article, current.segments, config);
  return applyDefinitions(round, segments, current.titleOffset, config);
}

/**
 * Defines (or, with replace, redefines) the one word at this index, as the
 * article reader's Define button does.
 */
export async function defineRoundWord(
  round: Round,
  index: number,
  config: AppConfig,
  replace = false,
): Promise<Round> {
  const target = round.segments[index];
  if (!target || target.gloss === null) return round;
  const language = glossLanguageFor(config.generation.arabicOnlyDefinitions);
  const article = passageArticle(round.id, round.titleAr, paragraphsOf(round.segments));
  await enrichWord(article, target.text, config, {
    replace,
    context: sentenceAround(round.segments as ResolvedSegment[], index),
  });
  const current = await resegment(article, language);
  return applyDefinitions(round, current.segments, current.titleOffset, config);
}

/**
 * "Finish" writes flagCount and updates lastSeenAt (§8 completion). Words the
 * reader flagged as unknown carry the unclear signal.
 */
export async function finishRound(
  round: Round,
  notKnownSegmentIndices: readonly number[],
  now = Date.now(),
): Promise<void> {
  const profile = modernStandardArabicProfile;
  const flaggedIds = new Set(
    notKnownSegmentIndices
      .map((index) => round.segments[index])
      .filter((segment) => segment !== undefined && segment.gloss !== null)
      .map((segment) => phraseId(segment!.text, profile)),
  );

  await upsertRound({ ...round, flagCount: flaggedIds.size });

  if (flaggedIds.size === 0) return;

  const flagged = await getWords([...flaggedIds]);
  await upsertWords(
    flagged.map((word) => ({
      ...word,
      unclearCount: word.unclearCount + 1,
      lastSeenAt: now,
      lastMarkedAt: now,
    })),
  );
}
