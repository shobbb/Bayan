/**
 * Batch generation (§9) and drill session persistence (§10.5).
 *
 * Orchestration only: what goes in a batch is decided in domain/batch, what a
 * response is worth in domain/drills, and when a card is next due in
 * domain/srs. Nothing here decides any of that.
 */
import type { AppConfig } from '@/config';
import { selectBatch } from '@/domain/batch/selectBatch';
import { activeScheduler } from '@/domain/srs/scheduler';
import { buildSessionQueue, type QueueEntry } from '@/domain/drills/session';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { Batch, Grade, Word, WordId } from '@/domain/types';
import { listWords, getWords, upsertWords } from '@/data/wordRepository';
import { getLatestBatch, upsertBatch } from '@/data/batchRepository';
import { generateSentences } from '@/services/llm/generate';
import { getApiKey } from '@/services/platform/storage';
import { MissingApiKeyError } from '@/services/rounds/roundService';

export interface GeneratedBatch {
  batch: Batch;
  /** True when the configured size is past the fatigue threshold (REQ-21). */
  oversized: boolean;
  /** Words the model returned no sentence for; the card still works without one. */
  missingSentences: number;
  /** Met and flagged, but with no gloss to put on the answer side (REQ-23). */
  untranslated: number;
}

function newBatchId(now: number): string {
  return `b_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * REQ-20: triggered only by the Generate-new-batch action. One batched call
 * covers every sentence (§9) rather than one call per card.
 */
export async function generateBatch(
  config: AppConfig,
  now = Date.now(),
): Promise<GeneratedBatch> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const words = await listWords(DEFAULT_TRACK_ID);
  const markedWithinDays = config.algorithm.batch.markedWithinDays;
  const selection = selectBatch(
    words,
    config.algorithm.batch.defaultSize,
    config.algorithm.batch.warnAboveSize,
    { markedSince: markedWithinDays > 0 ? now - markedWithinDays * 86_400_000 : null },
  );

  if (selection.wordIds.length === 0) {
    // Saying "read a round first" to someone holding a corpus of words they
    // flagged in an article but never translated is wrong, and hides the one
    // action that would fix it.
    if (selection.untranslated > 0) {
      throw new Error(
        `${selection.untranslated} word(s) are waiting on a translation before they can be drilled. ` +
          'Open the article they came from and translate it.',
      );
    }
    throw new Error(
      markedWithinDays > 0
        ? `Nothing has been flagged in the last ${markedWithinDays} day(s). Widen "Marked within" in Settings, or set it to 0.`
        : 'No words are ready to drill yet — read a round first.',
    );
  }

  const selected = await getWords(selection.wordIds);
  const response = await generateSentences(
    {
      words: selected.map((word) => word.surface),
      languageGuidance: modernStandardArabicProfile.promptGuidance,
    },
    config.models.sentenceGeneration,
    apiKey,
    config.generation.maxValidationRetries,
  );

  // Match by echoed word rather than position: the model may reorder or omit
  // entries, and a positional join would silently mispair them.
  //
  // Normalizing the echo is not enough on its own. Imported records were keyed
  // by a lemma that strips the definite article, so for a large share of the
  // corpus normalize(surface) does not equal the stored id. Resolve by exact
  // surface first, then by normalized surface, then by id.
  const idBySurface = new Map<string, WordId>();
  const idByNormalizedSurface = new Map<string, WordId>();
  const knownIds = new Set<string>();
  for (const word of selected) {
    idBySurface.set(word.surface, word.id);
    idByNormalizedSurface.set(modernStandardArabicProfile.normalize(word.surface), word.id);
    knownIds.add(word.id);
  }

  function resolveWordId(echoed: string): WordId | undefined {
    const exact = idBySurface.get(echoed);
    if (exact) return exact;

    const normalized = modernStandardArabicProfile.normalize(echoed);
    const bySurface = idByNormalizedSurface.get(normalized);
    if (bySurface) return bySurface;

    return knownIds.has(normalized) ? (normalized as WordId) : undefined;
  }

  const byId = new Map<WordId, string>();
  for (const entry of response.sentences) {
    const id = resolveWordId(entry.word.trim());
    if (id) byId.set(id, entry.sentence);
  }

  const exampleSentences: Record<WordId, string> = {};
  let missingSentences = 0;
  for (const word of selected) {
    const sentence = byId.get(word.id);
    if (sentence) exampleSentences[word.id] = sentence;
    else missingSentences += 1;
  }

  const batch: Batch = {
    id: newBatchId(now),
    wordIds: selection.wordIds,
    exampleSentences,
    createdAt: now,
  };

  await upsertBatch(batch);
  return {
    batch,
    oversized: selection.oversized,
    missingSentences,
    untranslated: selection.untranslated,
  };
}

export interface DrillSession {
  batch: Batch | null;
  queue: QueueEntry[];
  corpus: Word[];
}

/** Queue = current batch + all due cards, interleaved (§10). */
export async function startDrillSession(now = Date.now()): Promise<DrillSession> {
  const [words, batch] = await Promise.all([listWords(DEFAULT_TRACK_ID), getLatestBatch()]);

  const queue = buildSessionQueue({
    batchWordIds: batch?.wordIds ?? [],
    words,
    scheduler: activeScheduler,
    now,
  });

  return { batch: batch ?? null, queue, corpus: words };
}

/**
 * REQ-27: every response writes SrsState through the scheduler. Written per
 * answer rather than at session end so an abandoned session keeps its progress
 * (§10.1: "partial progress is saved").
 */
export async function recordAnswer(word: Word, grade: Grade, now = Date.now()): Promise<void> {
  const srs = activeScheduler.next(word.srs, grade, now);
  await upsertWords([{ ...word, srs, lastSeenAt: now }]);
}

/**
 * REQ-46: puts a card back exactly as it was before its last response.
 *
 * Takes the pre-answer record rather than trying to invert the scheduler. SM-2
 * is not injective — several prior states can lead to the same next state — so
 * the only correct undo is the one that restores what was actually there, and
 * the session already holds it.
 */
export async function undoAnswer(previous: Word): Promise<void> {
  await upsertWords([previous]);
}
