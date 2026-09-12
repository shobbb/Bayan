/**
 * Shared domain types (§2.3). Defined once here — nothing else declares
 * these shapes. No imports from data/ or ui/ (§2.1).
 */

export type PartOfSpeech = 'verb' | 'noun' | 'adjective' | 'particle' | 'phrase';

export type RoundType = 'explore' | 'reinforcement' | 'pureReinforcement' | 'backlog';

/**
 * Normalized, diacritic-free. The join key for all word identity.
 * Branded deliberately (§2.3): it prevents a raw string being passed where a
 * normalized id is required, which is the single most likely source of
 * silent data corruption in this app.
 */
export type WordId = string & { readonly __brand: 'WordId' };

/** Every Word and Round record carries a trackId (REQ-E5); ships with a single track active. */
export type TrackId = string & { readonly __trackBrand: 'TrackId' };

export interface SrsState {
  dueAt: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface Word {
  id: WordId;
  trackId: TrackId;
  surface: string; // vowelled display form
  gloss: string; // English, 1-3 words; '' when unknown — see needsEnrichment
  forms: string | null; // "كَتَبَ / يَكْتُبُ / كِتَابَة" | "جَانِب / جَوَانِب"
  /** null when the source didn't classify it; imported data often hasn't. */
  partOfSpeech: PartOfSpeech | null;
  seenCount: number;
  unclearCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  /**
   * When the reader last flagged this "didn't know", or null if never — which
   * is also what a record carries when it was flagged before the field existed.
   *
   * Distinct from lastSeenAt on purpose: seeing a word and failing to recognise
   * it are different events, and "what have I been getting wrong lately" is not
   * answerable from exposure. unclearCount says how often; this says when.
   */
  lastMarkedAt: number | null;
  roundIds: string[];
  srs: SrsState | null; // null until first included in a batch (REQ-I7)
  /** REQ-I5: imported without a gloss. Eligible for the fill-missing-glosses pass. */
  needsEnrichment?: boolean;
}

/** One renderable token. gloss === null => punctuation or paragraph break. */
export interface Segment {
  text: string; // word, punctuation, or PARAGRAPH_BREAK
  gloss: string | null;
  forms: string | null;
}

/** Sentinel segment text marking a paragraph break, per the reference reader's "¶". */
export const PARAGRAPH_BREAK = '¶';

export interface Round {
  id: string;
  trackId: TrackId;
  titleAr: string;
  titleEn: string;
  topic: string;
  format: string;
  roundType: RoundType;
  segments: Segment[]; // empty ⇒ text not retained; round is history-only (REQ-I6)
  distinctForms: number;
  /** null ⇒ round generated, feedback not recorded. Counts as a pull, not a reward (REQ-32). */
  flagCount: number | null;
  createdAt: number;
}

export interface Batch {
  id: string;
  wordIds: WordId[];
  exampleSentences: Record<WordId, string>;
  createdAt: number;
}

/** Output of the selector; input to generation. */
export interface RoundPlan {
  roundType: RoundType;
  topic: string;
  format: string;
  targetWordIds: WordId[];
  excludeTopics: string[]; // populated for reinforcement rounds
}

/** Scheduler grade — mirrors the classic SRS grade scale (§10.2, REQ-39). */
export type Grade = 'again' | 'hard' | 'good' | 'easy';

/**
 * Language-specific behaviour, isolated behind one interface (§18.5, REQ-E6).
 * normalizeArabic is one implementation of LanguageProfile.normalize (REQ-E7),
 * not a globally imported function.
 */
export interface LanguageProfile {
  readonly id: string;
  readonly name: string;
  readonly direction: 'rtl' | 'ltr';
  normalize(surface: string): WordId;
  readonly fontStack: string;
  readonly formsLabel: Record<PartOfSpeech, string>; // "past / present / masdar"
  readonly promptGuidance: string; // register, script, vowelling
}
