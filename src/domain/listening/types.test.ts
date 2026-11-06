import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  isAutoTranscript,
  isTranscriptArticleId,
  lessonAsArticle,
  lessonWords,
  type ListeningLesson,
} from './types';

const lesson: ListeningLesson = {
  id: 'ad_soc415',
  titleAr: 'مُحَادَثَةٌ فِي الْبَيْتِ',
  topic: 'Society',
  tags: ['food', 'family'],
  number: '415',
  audio: 'listening/ad_soc415.mp3',
  durationSec: 131,
  cards: [
    { arabic: 'سوق', english: 'market' },
    { arabic: 'سوق', english: 'market, again' },
  ],
};

describe('lessonWords', () => {
  it('gives every card its own id, outside any id a corpus word could have', () => {
    const words = lessonWords(lesson, 1);

    expect(words.map((w) => w.id)).toEqual(['listening:ad_soc415:0', 'listening:ad_soc415:1']);
  });

  it('carries the deck English as the gloss and no Arabic definition', () => {
    const [word] = lessonWords(lesson, 1);

    expect(word).toMatchObject({ surface: 'سوق', gloss: 'market', glossAr: null, srs: null });
  });
});

describe('formatDuration', () => {
  it('pads the seconds', () => {
    expect(formatDuration(131)).toBe('2:11');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(9)).toBe('0:09');
  });
});

describe('lessonAsArticle', () => {
  it('reads a transcript as an article of its own, outside the library ids', () => {
    const article = lessonAsArticle({ ...lesson, transcript: ['فِي السُّوقِ', 'سَمَكٌ'] });

    expect(article?.paragraphs).toEqual(['فِي السُّوقِ', 'سَمَكٌ']);
    expect(article?.titleAr).toBe(lesson.titleAr);
    expect(isTranscriptArticleId(article?.id ?? '')).toBe(true);
    expect(isTranscriptArticleId('0001_21968')).toBe(false);
  });

  it('carries none of the deck, whose English would outrank Arabic definitions', () => {
    const article = lessonAsArticle({ ...lesson, transcript: ['سوق'] });

    expect(article?.vocab).toEqual([]);
    expect(article?.expressions).toEqual([]);
  });

  it('has nothing to read without a transcript', () => {
    expect(lessonAsArticle(lesson)).toBeNull();
    expect(lessonAsArticle({ ...lesson, transcript: [] })).toBeNull();
  });
});

describe('isAutoTranscript', () => {
  it('is true only for a machine-made transcript that is actually there', () => {
    expect(isAutoTranscript({ ...lesson, transcript: ['سوق'], transcriptSource: 'auto' })).toBe(true);
    expect(isAutoTranscript({ ...lesson, transcript: ['سوق'], transcriptSource: 'course' })).toBe(false);
    expect(isAutoTranscript({ ...lesson, transcript: ['سوق'] })).toBe(false);
    expect(isAutoTranscript({ ...lesson, transcriptSource: 'auto' })).toBe(false);
  });
});
