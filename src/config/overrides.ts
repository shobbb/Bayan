/**
 * Reading and editing individual config values by path (REQ-C7: everything in
 * algorithm.ts and models.ts is overridable from Settings, each shown against
 * its default with a per-value reset).
 *
 * Settings addresses values by path rather than through a hand-written setter
 * per field. A setter per field would be a few dozen near-identical functions
 * that have to be remembered every time config gains a value — the kind of
 * duplication §2.1 exists to prevent. The paths themselves are checked against
 * the defaults by the field registry's tests, so a typo fails in CI rather than
 * silently writing an override nothing reads.
 */
import type { AppConfig, AppConfigOverrides } from './types';

export type ConfigValue = string | number | boolean;
export type ConfigPath = readonly string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value currently in force — an override if one is set, otherwise the default. */
export function readConfigValue(config: AppConfig, path: ConfigPath): ConfigValue | undefined {
  let cursor: unknown = config;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return typeof cursor === 'string' || typeof cursor === 'number' || typeof cursor === 'boolean'
    ? cursor
    : undefined;
}

/** The override at this path, or undefined when the default is in force. */
export function readOverride(
  overrides: AppConfigOverrides | null,
  path: ConfigPath,
): ConfigValue | undefined {
  if (!overrides) return undefined;
  let cursor: unknown = overrides;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return typeof cursor === 'string' || typeof cursor === 'number' || typeof cursor === 'boolean'
    ? cursor
    : undefined;
}

export function hasOverride(overrides: AppConfigOverrides | null, path: ConfigPath): boolean {
  return readOverride(overrides, path) !== undefined;
}

/** Copy of `overrides` with `path` set. Structural sharing is not attempted — these are tiny. */
export function withOverride(
  overrides: AppConfigOverrides | null,
  path: ConfigPath,
  value: ConfigValue,
): AppConfigOverrides {
  if (path.length === 0) throw new Error('withOverride needs a non-empty path');

  const root: Record<string, unknown> = { ...(overrides ?? {}) };
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    const existing = cursor[key];
    const next: Record<string, unknown> = isRecord(existing) ? { ...existing } : {};
    cursor[key] = next;
    cursor = next;
  }
  cursor[path[path.length - 1]!] = value;
  return root as AppConfigOverrides;
}

/**
 * Copy of `overrides` with `path` removed, pruning any parent left empty.
 *
 * The pruning is what makes "is this value overridden?" answerable: without it
 * a reset leaves `{ algorithm: { bandit: {} } }` behind, and the difference
 * between "reset to default" and "never touched" stops being visible in the
 * stored record.
 */
export function withoutOverride(
  overrides: AppConfigOverrides | null,
  path: ConfigPath,
): AppConfigOverrides {
  if (!overrides || path.length === 0) return overrides ?? {};

  const prune = (node: Record<string, unknown>, rest: ConfigPath): Record<string, unknown> => {
    const [head, ...tail] = rest;
    if (head === undefined) return node;

    const copy = { ...node };
    if (tail.length === 0) {
      delete copy[head];
      return copy;
    }

    const child = copy[head];
    if (!isRecord(child)) return copy;

    const pruned = prune(child, tail);
    if (Object.keys(pruned).length === 0) delete copy[head];
    else copy[head] = pruned;
    return copy;
  };

  return prune(overrides as Record<string, unknown>, path) as AppConfigOverrides;
}
