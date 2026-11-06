import { describe, expect, it } from 'vitest';
import { listeningDifficulty, speakingRate } from './difficulty';
import type { ListeningLesson } from './types';

function lesson(id: string, words: number, durationSec: number, transcript = true): ListeningLesson {
  return {
    id,
    titleAr: 'درس',
    topic: 'Society',
    tags: ['food', 'family'],
    number: '001',
    audio: `listening/${id}.mp3`,
    durationSec,
    cards: [],
    ...(transcript ? { transcript: [Array.from({ length: words }, () => 'كلمة').join(' ') + '.'] } : {}),
  };
}

describe('speakingRate', () => {
  it('counts words per minute of recording, not punctuation', () => {
    expect(speakingRate({ ...lesson('a', 0, 60), transcript: ['• سوق، 20 بيت.', 'خبز!'] })).toBe(4);
    expect(speakingRate(lesson('b', 90, 60))).toBe(90);
  });

  it('has no rate without a transcript', () => {
    expect(speakingRate(lesson('a', 0, 60, false))).toBeNull();
  });
});

describe('listeningDifficulty', () => {
  it('ranks the slowest easiest and the fastest hardest, in five steps', () => {
    const lessons = [50, 90, 70, 110, 60, 80, 100, 40, 120, 130].map((wpm, i) => lesson(`l${i}`, wpm, 60));
    const levels = listeningDifficulty(lessons);

    expect(levels.get('l7')).toBe(1); // 40 wpm
    expect(levels.get('l9')).toBe(5); // 130 wpm
    expect([...levels.values()].sort()).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('leaves lessons without a transcript unlevelled', () => {
    const levels = listeningDifficulty([lesson('a', 60, 60), lesson('b', 0, 60, false)]);

    expect(levels.has('b')).toBe(false);
    expect(levels.get('a')).toBe(1);
  });
});
