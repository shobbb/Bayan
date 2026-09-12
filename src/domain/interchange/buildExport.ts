/**
 * Building the export side of the interchange (§14.3). One schema, same shape
 * both directions (REQ-I1) — so anything this produces must import cleanly.
 *
 * REQ-I11: the export is complete and lossless — every word, every round, all
 * SRS state, current config, current categories. It is never a partial dump,
 * because it is also the only backup path (REQ-37).
 */
import type { AppConfigOverrides, Categories } from '@/config';
import type { Round, Word } from '@/domain/types';
import type {
  InterchangeArticleRead,
  InterchangeGloss,
  InterchangeRound,
  InterchangeWord,
  StateExport,
} from './schema';

export const SCHEMA_VERSION = 1;

/**
 * Timestamps and glosses are absent-or-present in the interchange schema but
 * always-present internally, so the sentinel values chosen on import are mapped
 * back to null here. Without this a round-trip would quietly rewrite "unknown"
 * as "the epoch" and "no gloss" as "the empty string".
 */
function nullableTimestamp(value: number): number | null {
  return value === 0 ? null : value;
}

function toInterchangeWord(word: Word): InterchangeWord {
  return {
    id: word.id,
    surface: word.surface,
    gloss: word.gloss === '' ? null : word.gloss,
    forms: word.forms,
    partOfSpeech: word.partOfSpeech,
    seenCount: word.seenCount,
    unclearCount: word.unclearCount,
    firstSeenAt: nullableTimestamp(word.firstSeenAt),
    lastSeenAt: nullableTimestamp(word.lastSeenAt),
    lastMarkedAt: word.lastMarkedAt,
    roundIds: [...word.roundIds],
    srs: word.srs, // REQ-I7: null means never drilled; never fabricated
  };
}

function toInterchangeRound(round: Round): InterchangeRound {
  return {
    id: round.id,
    titleAr: round.titleAr,
    titleEn: round.titleEn,
    topic: round.topic,
    format: round.format,
    roundType: round.roundType,
    distinctForms: round.distinctForms,
    flagCount: round.flagCount,
    createdAt: nullableTimestamp(round.createdAt),
    // REQ-I6: no stored text means history only, which is null on the wire.
    segments: round.segments.length > 0 ? round.segments : null,
    notes: null,
  };
}

export function buildStateExport(
  words: readonly Word[],
  rounds: readonly Round[],
  categories: Categories,
  config: AppConfigOverrides | null,
  exportedAt: number,
  articleReads: readonly InterchangeArticleRead[] = [],
  glosses: readonly InterchangeGloss[] = [],
): StateExport {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    source: 'app',
    words: words.map(toInterchangeWord),
    rounds: rounds.map(toInterchangeRound),
    categories: { topics: [...categories.topics], formats: [...categories.formats] },
    config,
    articleReads: [...articleReads],
    glosses: [...glosses],
  };
}

/** Stable, human-scannable filename for a dump. */
export function exportFilename(exportedAt: number): string {
  const stamp = new Date(exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `bayan-state-${stamp}.json`;
}

export function serializeStateExport(state: StateExport): string {
  return JSON.stringify(state, null, 2);
}
