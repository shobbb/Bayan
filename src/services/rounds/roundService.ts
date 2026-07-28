/**
 * The §8 generation flow, end to end:
 *   1. roundPlanner.plan(roundType, state) -> RoundPlan
 *   2. llm.generateRound(plan)             -> validated { titleAr, titleEn, segments }
 *   3. Persist Round, increment seenCount for every distinct word
 *   4. Return it for rendering
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
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { Round, RoundType, Word } from '@/domain/types';
import { listWords, getWords, upsertWords } from '@/data/wordRepository';
import { listRounds, upsertRound } from '@/data/roundRepository';
import { generateRound } from '@/services/llm/generate';
import { getApiKey } from '@/services/platform/storage';

export class MissingApiKeyError extends Error {
  constructor() {
    super('No API key set. Add one in Settings to generate rounds.');
    this.name = 'MissingApiKeyError';
  }
}

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

  // Post-generation gate (§12.3): pureReinforcement rejects any new vocabulary.
  // Surfaced rather than silently regenerated — a second call costs real money,
  // and the caller decides whether to spend it.
  const rejection = strategy.validate?.(response.segments, ctx) ?? null;
  if (rejection) {
    throw new Error(`Generated round rejected: ${rejection}`);
  }

  const round: Round = {
    id: newRoundId(now),
    trackId: DEFAULT_TRACK_ID,
    titleAr: response.titleAr,
    titleEn: response.titleEn,
    topic: plan.topic,
    format: plan.format,
    roundType,
    segments: response.segments,
    distinctForms: countDistinctForms(response.segments, profile),
    flagCount: null, // not read yet — a pull with no reward (REQ-32)
    createdAt: now,
  };

  const updatedWords = ingestRoundWords(
    response.segments,
    words,
    round.id,
    DEFAULT_TRACK_ID,
    profile,
    now,
  );

  await upsertRound(round);
  await upsertWords(updatedWords);

  return round;
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
      .map((segment) => profile.normalize(segment!.text)),
  );

  await upsertRound({ ...round, flagCount: flaggedIds.size });

  if (flaggedIds.size === 0) return;

  const flagged = await getWords([...flaggedIds]);
  await upsertWords(
    flagged.map((word) => ({
      ...word,
      unclearCount: word.unclearCount + 1,
      lastSeenAt: now,
    })),
  );
}
