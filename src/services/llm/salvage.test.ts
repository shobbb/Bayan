import { describe, expect, it } from 'vitest';
import {
  completeObjectsInFirstArray,
  normalizeStructuralPunctuation,
  recoverObjects,
  salvageEntries,
} from './salvage';
import { llmGlossSchema } from './schemas';

const accept = (value: unknown) => {
  const parsed = llmGlossSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** Shaped like a real Arabic-mode response cut off at the output limit. */
const TRUNCATED = `{ "glosses": [
{ "word": "مُبَاشَرَةً", "gloss": "بِدُونِ تَأْخِيرٍ أَوْ وَسِيطٍ", "forms": null, "partOfSpeech": "adjective" },
{ "word": "إِلَى", "gloss": "حَرْفٌ يُفِيدُ الاتِّجَاهَ نَحْوَ مَكَان", "forms": null, "partOfSpeech": "particle" },
{ "word": "نَحْوَ", "gloss": "فِي اتِّجَاهِ شَيْءٍ", "forms": null, "partOfSpeech": "particle" },
{ "word": "وَكَانَ", "gloss": "وَكَانَ ذَلِكَ فِي المَاضِي", "forms": "كَانَ / يَك`;

describe('completeObjectsInFirstArray', () => {
  it('keeps every object that closed before the cut', () => {
    expect(completeObjectsInFirstArray(TRUNCATED)).toHaveLength(3);
  });

  it('drops the entry that was still being written', () => {
    const objects = completeObjectsInFirstArray(TRUNCATED);

    expect(objects.join()).not.toContain('وَكَانَ');
  });

  it('reads a complete response too', () => {
    const whole = '{ "glosses": [ { "word": "a" }, { "word": "b" } ] }';

    expect(completeObjectsInFirstArray(whole)).toHaveLength(2);
  });

  it('stops at the end of the array rather than walking into the outer object', () => {
    const trailing = '{ "glosses": [ { "word": "a" } ], "meta": { "note": "x" } }';

    expect(completeObjectsInFirstArray(trailing)).toHaveLength(1);
  });

  // The response is mostly Arabic, and a brace or bracket inside a definition
  // must not be read as structure.
  it('ignores braces inside strings', () => {
    const braces = '{ "glosses": [ { "word": "a", "gloss": "a } b [ c" }, { "word": "d" } ] }';

    expect(completeObjectsInFirstArray(braces)).toHaveLength(2);
  });

  it('ignores an escaped quote inside a string', () => {
    const escaped = '{ "glosses": [ { "word": "say \\"hi\\"" }, { "word": "b" } ] }';

    expect(completeObjectsInFirstArray(escaped)).toHaveLength(2);
  });

  it('returns nothing when the cut came before the first entry closed', () => {
    expect(completeObjectsInFirstArray('{ "glosses": [ { "word": "abc')).toEqual([]);
  });

  it('returns nothing when there is no array at all', () => {
    expect(completeObjectsInFirstArray('I could not answer that.')).toEqual([]);
  });
});

describe('salvageEntries', () => {
  it('recovers the definitions that arrived', () => {
    const entries = salvageEntries(TRUNCATED, accept);

    expect(entries.map((entry) => entry.word)).toEqual(['مُبَاشَرَةً', 'إِلَى', 'نَحْوَ']);
    expect(entries[0]!.gloss).toBe('بِدُونِ تَأْخِيرٍ أَوْ وَسِيطٍ');
  });

  // One malformed answer costs that answer, not the batch.
  it('drops an entry that fails its schema and keeps the rest', () => {
    const mixed =
      '{ "glosses": [ { "word": "a", "gloss": "one" }, { "word": "b" }, { "word": "c", "gloss": "three" } ] }';

    expect(salvageEntries(mixed, accept).map((entry) => entry.word)).toEqual(['a', 'c']);
  });

  // The exact on-device failure: a single word wrapped in markdown fences, the
  // block looped several times with each copy restarted mid-object, and an
  // Arabic comma used as the separator. Only the last copy closed.
  it('recovers one word from fenced, looped, Arabic-comma output', () => {
    const looped =
      '```json\n[\n  {\n    "word": "عَادِيًّا",\n    "gloss": "بَرَأَةً"،\n' +
      '```json\n[\n  {\n    "word": "عَادِيًّا",\n    "gloss": "بَرَأَةً"،\n    "forms": null,\n    "part' +
      '```json\n[\n  {\n    "word": "عَادِيًّا",\n    "gloss": "بَرَأَةً",\n    "forms": null,\n    "partOfSpeech": "phrase"\n  }\n]\n```';

    const entries = salvageEntries(looped, accept);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.word).toBe('عَادِيًّا');
    expect(entries[0]!.gloss).toBe('بَرَأَةً');
  });

  // An Arabic comma between fields is structural, not part of the gloss.
  it('parses an object whose separators are Arabic commas', () => {
    const arabicCommas =
      '{ "glosses": [ { "word": "a"، "gloss": "one"، "forms": null، "partOfSpeech": "noun" } ] }';

    expect(salvageEntries(arabicCommas, accept).map((e) => e.gloss)).toEqual(['one']);
  });
});

describe('normalizeStructuralPunctuation', () => {
  it('replaces an Arabic comma between fields but not one inside a gloss', () => {
    const input = '{ "gloss": "a، b"، "forms": null }';

    expect(normalizeStructuralPunctuation(input)).toBe('{ "gloss": "a، b", "forms": null }');
  });
});

describe('recoverObjects', () => {
  it('collapses identical repeated objects to one', () => {
    const repeated = '{ "word": "a" } junk { "word": "a" }';

    expect(recoverObjects(repeated)).toEqual(['{ "word": "a" }']);
  });

  it('skips an object that never closed and keeps the one that did', () => {
    const partial = '{ "word": "open" [ { "word": "closed" }';

    expect(recoverObjects(partial)).toEqual(['{ "word": "closed" }']);
  });
});
