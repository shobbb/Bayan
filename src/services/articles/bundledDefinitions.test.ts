/**
 * The pre-written definitions, and where they sit relative to everything else.
 *
 * Precedence is the part worth pinning: these are a floor, not an override. A
 * definition this device generated, or a word the learner has actually met,
 * still wins — otherwise a shipped file would silently replace the reader's own
 * data on every update.
 */
import { describe, expect, it } from 'vitest';
import { bundledArabicDefinitions } from './bundledDefinitions';
import { judgeArabicDefinition } from '@/domain/glossQuality';
import { phraseId } from '@/domain/wordIdentity';
import { modernStandardArabicProfile as profile } from '@/domain/languageProfile';

describe('bundled Arabic definitions', () => {
  it('are keyed by the id segmentation looks words up under', async () => {
    const defs = await bundledArabicDefinitions();

    expect(defs.size).toBeGreaterThan(0);
    for (const [id, entry] of defs) {
      // The surface is what the definition was written for; its id must be the
      // key, or the definition is unreachable from the text it belongs to.
      expect(phraseId(entry.surface, profile)).toBe(id);
    }
  });

  it('pass the same gate a generated definition has to pass', async () => {
    const defs = await bundledArabicDefinitions();

    const refused = [...defs.values()]
      .map((entry) => ({ entry, verdict: judgeArabicDefinition(entry.surface, entry.gloss) }))
      .filter(({ verdict }) => !verdict.ok)
      .map(({ entry, verdict }) => `${entry.surface}: ${verdict.reason}`);

    // Shipping a definition the app would have thrown away if a model wrote it
    // would be holding two standards at once.
    expect(refused).toEqual([]);
  });

  it('carry no English and are not empty', async () => {
    const defs = await bundledArabicDefinitions();

    for (const entry of defs.values()) {
      expect(entry.gloss.trim()).not.toBe('');
      expect(entry.gloss).not.toMatch(/[A-Za-z]/);
    }
  });
});
