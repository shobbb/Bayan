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
  surface: string; // vowelled form as last displayed
  gloss: string; // English, 1-3 words
  forms: string | null; // "كَتَبَ / يَكْتُبُ / كِتَابَة" | "جَانِب / جَوَانِب"
  partOfSpeech: PartOfSpeech;
  seenCount: number;
  unclearCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  roundIds: string[];
  srs: SrsState | null; // null until first included in a batch
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
  segments: Segment[]; // stored so rounds are re-readable
  distinctForms: number;
  flagCount: number;
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
