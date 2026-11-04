/**
 * Listening lessons: a recording and the glossary that goes with it.
 *
 * Imported from a third-party course as audio plus an Anki deck per lesson,
 * and shipped as a build asset like the articles. A lesson is not an article
 * and not a round — it has no text to segment — so it is its own type.
 */
import { DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import type { Article } from '@/domain/articles/types';
import type { Word, WordId } from '@/domain/types';

export interface ListeningCard {
  /** As the deck printed it, which is mostly unvowelled. */
  arabic: string;
  /** The deck's English, the only definition these words come with. */
  english: string;
}

export interface ListeningLesson {
  /** The course's lesson code, e.g. "ad_soc415". */
  id: string;
  /**
   * What the lesson is about, in vowelled Arabic. The course names lessons only
   * by code; these were written from each lesson's own title where it had one
   * and from its glossary where it did not.
   */
  titleAr: string;
  /** From the code's subject prefix: "soc" is Society. */
  topic: string;
  /**
   * What the lesson is about, multi-label and lowercase, for filtering the
   * catalog the way the article gallery is filtered. Written by hand from each
   * lesson's title and glossary; the course's one subject per lesson is too
   * coarse to find "everything about food" by.
   */
  tags: string[];
  /** The code's number, kept as printed ("040"). */
  number: string;
  /** Path to the recording, relative to the app's root. */
  audio: string;
  durationSec: number;
  cards: ListeningCard[];
  /**
   * The recording's Arabic text, by paragraph, where the course's transcript
   * could be read back faithfully. Absent where it could not: several of the
   * PDFs carry numbers that contradict their own English column, and a
   * transcript that disagrees with the recording is worse than none.
   */
  transcript?: string[];
}

/**
 * A lesson's cards in the shape the flashcard screen drills.
 *
 * Not corpus words. The ids are namespaced to the lesson so they can never
 * collide with a real word's id: these cards are drilled without being
 * recorded, and a collision would be the one way a lesson card could stand in
 * for a word the reader has actually met.
 */
export function lessonWords(lesson: ListeningLesson, now: number): Word[] {
  return lesson.cards.map((card, index) => ({
    id: `listening:${lesson.id}:${index}` as WordId,
    trackId: DEFAULT_TRACK_ID,
    surface: card.arabic,
    gloss: card.english,
    glossAr: null,
    forms: null,
    partOfSpeech: null,
    seenCount: 0,
    unclearCount: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    lastMarkedAt: null,
    roundIds: [],
    srs: null,
  }));
}

const ARTICLE_ID_PREFIX = 'listening:';

/** The id a lesson's transcript is read under, kept apart from the library's. */
export function transcriptArticleId(lesson: ListeningLesson): string {
  return `${ARTICLE_ID_PREFIX}${lesson.id}`;
}

export function isTranscriptArticleId(id: string): boolean {
  return id.startsWith(ARTICLE_ID_PREFIX);
}

/**
 * A lesson's transcript in the shape the reader reads, so its words are tapped,
 * defined and flagged exactly as an article's are — one reading path, not two.
 *
 * Null without a transcript. The deck's cards are not passed as the article's
 * vocabulary: they are unvowelled and English, and the publisher lists outrank
 * every other gloss source, so they would override the Arabic definitions the
 * reader is set to see.
 */
export function lessonAsArticle(lesson: ListeningLesson): Article | null {
  if (!lesson.transcript || lesson.transcript.length === 0) return null;
  return {
    id: transcriptArticleId(lesson),
    level: '',
    series: 'other',
    sourceUrl: '',
    topics: [...lesson.tags],
    difficulty: null,
    wordCount: null,
    titleAr: lesson.titleAr,
    titleEn: null,
    vowelled: false,
    paragraphs: [...lesson.transcript],
    imageUrl: null,
    videoUrl: null,
    vocab: [],
    expressions: [],
  };
}

/** "2:45" for a duration in seconds. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
