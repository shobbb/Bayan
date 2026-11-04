import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listeningLessons } from './listeningService';

const ARABIC = /[؀-ۿ]/;

describe('the listening catalog', () => {
  it('ships a recording for every lesson it lists', async () => {
    const missing = (await listeningLessons()).filter(
      (lesson) => !existsSync(resolve(__dirname, '../../../public', lesson.audio)),
    );

    expect(missing.map((l) => l.id)).toEqual([]);
  });

  it('has Arabic on the front and English on the back of every card', async () => {
    const wrong = (await listeningLessons()).flatMap((lesson) =>
      lesson.cards
        .filter((card) => !ARABIC.test(card.arabic) || card.english.trim() === '')
        .map((card) => `${lesson.id}: ${card.arabic} / ${card.english}`),
    );

    expect(wrong).toEqual([]);
  });

  it('lists each lesson once', async () => {
    const ids = (await listeningLessons()).map((l) => l.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
