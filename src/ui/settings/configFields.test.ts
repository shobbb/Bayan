import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_CONFIG, mergeConfig } from '@/config';
import {
  readConfigValue,
  withOverride,
  withoutOverride,
  hasOverride,
} from '@/config/overrides';
import { CONFIG_FIELDS, CONFIG_FIELD_GROUPS } from './configFields';

/**
 * Walks the defaults and returns every editable leaf as a dotted path.
 * `categories` is excluded deliberately: §3.4 edits those as their own list,
 * and config/types.ts says so.
 */
function leafPaths(node: unknown, prefix: string[] = []): string[] {
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return [prefix.join('.')];
  }
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return [];
  return Object.entries(node).flatMap(([key, value]) => leafPaths(value, [...prefix, key]));
}

const EDITABLE_SECTIONS = ['models', 'algorithm', 'generation'] as const;

const defaultLeaves = EDITABLE_SECTIONS.flatMap((section) =>
  leafPaths(DEFAULT_APP_CONFIG[section], [section]),
);

describe('config field registry', () => {
  // The point of the registry: §13 promises every value in algorithm.ts and
  // models.ts is editable. Without this, adding a weight silently makes that
  // promise false and nothing notices.
  it('covers every editable value in the defaults', () => {
    const covered = new Set(CONFIG_FIELDS.map((field) => field.id));
    const missing = defaultLeaves.filter((path) => !covered.has(path));

    expect(missing).toEqual([]);
  });

  it('has no field pointing at a value that does not exist', () => {
    const known = new Set(defaultLeaves);
    const stray = CONFIG_FIELDS.map((field) => field.id).filter((id) => !known.has(id));

    expect(stray).toEqual([]);
  });

  it('gives every field a unique id', () => {
    const ids = CONFIG_FIELDS.map((field) => field.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every field against the defaults', () => {
    for (const field of CONFIG_FIELDS) {
      expect(readConfigValue(DEFAULT_APP_CONFIG, field.path), field.id).not.toBeUndefined();
    }
  });

  it('matches each field spec to the type of the value it edits', () => {
    for (const field of CONFIG_FIELDS) {
      const value = readConfigValue(DEFAULT_APP_CONFIG, field.path);
      const expected =
        field.spec.kind === 'number'
          ? 'number'
          : field.spec.kind === 'boolean'
            ? 'boolean'
            : 'string';

      expect(typeof value, field.id).toBe(expected);
    }
  });

  it('keeps every default inside the bounds its input offers', () => {
    for (const field of CONFIG_FIELDS) {
      if (field.spec.kind !== 'number') continue;
      const value = readConfigValue(DEFAULT_APP_CONFIG, field.path) as number;

      expect(value, field.id).toBeGreaterThanOrEqual(field.spec.min);
      expect(value, field.id).toBeLessThanOrEqual(field.spec.max);
    }
  });

  it('explains every field, since the help text is the only copy shown', () => {
    for (const field of CONFIG_FIELDS) {
      expect(field.label.length, field.id).toBeGreaterThan(0);
      expect(field.help.length, field.id).toBeGreaterThan(20);
    }
  });

  it('assigns every field to exactly one group', () => {
    const grouped = CONFIG_FIELD_GROUPS.flatMap((group) => group.fields.map((f) => f.id));

    expect(grouped.length).toBe(CONFIG_FIELDS.length);
    expect(new Set(grouped).size).toBe(CONFIG_FIELDS.length);
  });
});

describe('override round-trip', () => {
  it('takes effect through mergeConfig for every field', () => {
    for (const field of CONFIG_FIELDS) {
      const current = readConfigValue(DEFAULT_APP_CONFIG, field.path);
      const edited =
        typeof current === 'number'
          ? current + 1
          : typeof current === 'boolean'
            ? !current
            : `${current}-edited`;

      const overrides = withOverride(null, field.path, edited);
      expect(readConfigValue(mergeConfig(overrides), field.path), field.id).toBe(edited);
    }
  });

  // Settings writes one leaf at a time, so a merge that is shallower than the
  // deepest field replaces a whole object with a one-key fragment and deletes
  // that value's siblings. It still reads back correctly at the edited path,
  // which is exactly why this needs checking at every other path.
  it('leaves every other value untouched when one field is edited', () => {
    for (const field of CONFIG_FIELDS) {
      const current = readConfigValue(DEFAULT_APP_CONFIG, field.path);
      const edited = typeof current === 'number' ? current + 1 : typeof current === 'boolean' ? !current : `${current}!`;
      const merged = mergeConfig(withOverride(null, field.path, edited));

      for (const other of CONFIG_FIELDS) {
        if (other.id === field.id) continue;
        expect(
          readConfigValue(merged, other.path),
          `editing ${field.id} changed ${other.id}`,
        ).toBe(readConfigValue(DEFAULT_APP_CONFIG, other.path));
      }
    }
  });

  it('restores the default when a value is reset', () => {
    for (const field of CONFIG_FIELDS) {
      const original = readConfigValue(DEFAULT_APP_CONFIG, field.path);
      const overrides = withOverride(null, field.path, typeof original === 'number' ? 99 : 'x');
      const reset = withoutOverride(overrides, field.path);

      expect(hasOverride(reset, field.path), field.id).toBe(false);
      expect(readConfigValue(mergeConfig(reset), field.path), field.id).toBe(original);
    }
  });

  it('leaves no empty parents behind, so "overridden" stays answerable', () => {
    const path = ['algorithm', 'bandit', 'explorationConstant'] as const;
    const reset = withoutOverride(withOverride(null, path, 1.5), path);

    expect(reset).toEqual({});
  });

  it('keeps sibling overrides when one is reset', () => {
    const overrides = withOverride(
      withOverride(null, ['algorithm', 'wordDraw', 'sampleSize'], 20),
      ['algorithm', 'wordDraw', 'missRateWeight'],
      2,
    );
    const reset = withoutOverride(overrides, ['algorithm', 'wordDraw', 'missRateWeight']);

    expect(readConfigValue(mergeConfig(reset), ['algorithm', 'wordDraw', 'sampleSize'])).toBe(20);
    expect(hasOverride(reset, ['algorithm', 'wordDraw', 'missRateWeight'])).toBe(false);
  });

  it('does not disturb an unrelated section', () => {
    const overrides = withOverride(null, ['models', 'roundGeneration', 'maxTokens'], 32000);
    const merged = mergeConfig(overrides);

    expect(merged.algorithm).toEqual(DEFAULT_APP_CONFIG.algorithm);
    expect(merged.models.sentenceGeneration).toEqual(
      DEFAULT_APP_CONFIG.models.sentenceGeneration,
    );
  });
});
