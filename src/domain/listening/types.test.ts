import { describe, expect, it } from 'vitest';
import { formatDuration, lessonWords, type ListeningLesson } from './types';

const lesson: ListeningLesson = {
  id: 'ad_soc415',
  topic: 'Society',
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
