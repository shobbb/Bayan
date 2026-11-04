/**
 * Listening lessons: a recording and the glossary that goes with it.
 *
 * Imported from a third-party course as audio plus an Anki deck per lesson,
 * and shipped as a build asset like the articles. A lesson is not an article
 * and not a round — it has no text to segment — so it is its own type.
 */
import { DEFAULT_TRACK_ID } from '@/domain/languageProfile';
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
  /** From the code's subject prefix: "soc" is Society. */
  topic: string;
  /** The code's number, kept as printed ("040"). */
  number: string;
  /** Path to the recording, relative to the app's root. */
  audio: string;
  durationSec: number;
  cards: ListeningCard[];
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

/** "2:45" for a duration in seconds. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
