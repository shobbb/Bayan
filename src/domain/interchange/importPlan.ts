/**
 * Import planning (§14.2). Pure: it takes the parsed payload plus the existing
 * corpus and returns the exact rows to write, so a dry run and a real import
 * follow identical logic and can never diverge (REQ-I4).
 */
import type { LanguageProfile, Round, TrackId, Word, WordId } from '@/domain/types';
import type { InterchangeRound, InterchangeWord, StateExport } from './schema';

export type ImportMode = 'merge' | 'replace' | 'dryRun';

export interface ImportReport {
  wordsAdded: number;
  /** Incoming records that collapsed onto an existing or earlier-seen id (REQ-I3). */
  wordsMerged: number;
  roundsAdded: number;
  /** Rounds arriving without segments — history only, not re-readable (REQ-I6). */
  roundsHistoryOnly: number;
  /** Records with no gloss, flagged for the enrichment pass (REQ-I5). */
  needsEnrichment: number;
  totalWords: number;
  totalRounds: number;
}

export interface ImportPlan {
  words: Word[];
  rounds: Round[];
  report: ImportReport;
  /** False for a dry run — the caller must not write (REQ-I4). */
  writable: boolean;
}

/** Keep the longer of two optional strings; a fuller gloss beats a terser one (REQ-I3). */
function longer(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return b.length > a.length ? b : a;
}

/** Latest of two optional timestamps; null only when neither side has one. */
function latest(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  // Loose checks on purpose: a record stored before this field existed comes
  // back from IndexedDB with it absent, so the value here is undefined rather
  // than null, and a strict check would hand Math.max an undefined and merge
  // the word to NaN.
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

function earliest(a: number, b: number): number {
  if (a === 0) return b;
  if (b === 0) return a;
  return Math.min(a, b);
}

function toWord(incoming: InterchangeWord, id: WordId, trackId: TrackId): Word {
  const gloss = incoming.gloss ?? '';
  return {
    id,
    trackId,
    surface: incoming.surface,
    gloss,
    forms: incoming.forms,
    partOfSpeech: incoming.partOfSpeech,
    seenCount: incoming.seenCount,
    unclearCount: incoming.unclearCount,
    firstSeenAt: incoming.firstSeenAt ?? 0,
    lastSeenAt: incoming.lastSeenAt ?? 0,
    // Absent in any dump written before the field existed. Null is the honest
    // value: unknown, not "never flagged", and a window must not claim it.
    lastMarkedAt: incoming.lastMarkedAt ?? null,
    roundIds: [...incoming.roundIds],
    // REQ-I7: null means never drilled. Never fabricate an SRS state on import.
    srs: incoming.srs,
    ...(gloss === '' ? { needsEnrichment: true } : {}),
  };
}

/**
 * REQ-I3 merge rule: sum the counts, union the round ids, keep the earliest
 * firstSeenAt and latest lastSeenAt, keep the longest non-null gloss and forms.
 */
function mergeWords(existing: Word, incoming: Word): Word {
  const gloss = longer(existing.gloss || null, incoming.gloss || null) ?? '';
  return {
    ...existing,
    surface: incoming.surface || existing.surface,
    gloss,
    forms: longer(existing.forms, incoming.forms),
    partOfSpeech: existing.partOfSpeech ?? incoming.partOfSpeech,
    seenCount: existing.seenCount + incoming.seenCount,
    unclearCount: existing.unclearCount + incoming.unclearCount,
    firstSeenAt: earliest(existing.firstSeenAt, incoming.firstSeenAt),
    lastSeenAt: Math.max(existing.lastSeenAt, incoming.lastSeenAt),
    lastMarkedAt: latest(existing.lastMarkedAt, incoming.lastMarkedAt),
    roundIds: [...new Set([...existing.roundIds, ...incoming.roundIds])],
    srs: existing.srs ?? incoming.srs,
    ...(gloss === '' ? { needsEnrichment: true } : { needsEnrichment: undefined }),
  };
}

function toRound(incoming: InterchangeRound, trackId: TrackId): Round {
  return {
    id: incoming.id,
    trackId,
    titleAr: incoming.titleAr,
    titleEn: incoming.titleEn,
    topic: incoming.topic,
    format: incoming.format,
    roundType: incoming.roundType,
    // REQ-I6: no segments ⇒ history only. Counts toward statistics, not re-readable.
    segments: incoming.segments ?? [],
    distinctForms: incoming.distinctForms,
    flagCount: incoming.flagCount,
    createdAt: incoming.createdAt ?? 0,
  };
}

export interface ExistingCorpus {
  words: readonly Word[];
  rounds: readonly Round[];
}

/**
 * Builds the write set. Replace starts from nothing (destructive, and the
 * caller is responsible for the confirmation REQ-I4 requires); merge starts
 * from the existing corpus and folds the payload in.
 */
export function planImport(
  payload: StateExport,
  existing: ExistingCorpus,
  profile: LanguageProfile,
  trackId: TrackId,
  mode: ImportMode = 'merge',
): ImportPlan {
  const replacing = mode === 'replace';

  const wordsById = new Map<WordId, Word>();
  if (!replacing) {
    for (const word of existing.words) wordsById.set(word.id, word);
  }

  let wordsAdded = 0;
  let wordsMerged = 0;

  for (const incoming of payload.words) {
    // REQ-I3: normalize the surface and merge on the resulting id, so multiple
    // inflections of one lemma collapse into a single record.
    const id = incoming.id
      ? profile.normalize(incoming.id)
      : profile.normalize(incoming.surface);

    const candidate = toWord(incoming, id, trackId);
    const current = wordsById.get(id);

    if (current) {
      wordsById.set(id, mergeWords(current, candidate));
      wordsMerged += 1;
    } else {
      wordsById.set(id, candidate);
      wordsAdded += 1;
    }
  }

  const roundsById = new Map<string, Round>();
  if (!replacing) {
    for (const round of existing.rounds) roundsById.set(round.id, round);
  }

  let roundsAdded = 0;
  let roundsHistoryOnly = 0;

  for (const incoming of payload.rounds) {
    const round = toRound(incoming, trackId);
    if (!roundsById.has(round.id)) roundsAdded += 1;
    if (round.segments.length === 0) roundsHistoryOnly += 1;
    roundsById.set(round.id, round);
  }

  const words = [...wordsById.values()];
  const rounds = [...roundsById.values()];

  return {
    words,
    rounds,
    writable: mode !== 'dryRun',
    report: {
      wordsAdded,
      wordsMerged,
      roundsAdded,
      roundsHistoryOnly,
      needsEnrichment: words.filter((word) => word.needsEnrichment === true).length,
      totalWords: words.length,
      totalRounds: rounds.length,
    },
  };
}
