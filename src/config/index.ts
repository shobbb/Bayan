/**
 * Merges compile-time defaults with user overrides into a typed AppConfig
 * (REQ-C7, REQ-C8). Pure — this module does not read persisted overrides
 * itself; that happens once at startup in the config context provider
 * (REQ-C9), which calls mergeConfig() with whatever settingsRepository
 * returns. No module here reads config at import time, so overriding in
 * tests stays possible.
 */
import { DEFAULT_MODEL_ROUTES } from './models';
import { DEFAULT_ALGORITHM_CONFIG } from './algorithm';
import { DEFAULT_CATEGORIES } from './categories';
import { DEFAULT_GENERATION_CONFIG } from './generation';
import type { AppConfig, AppConfigOverrides } from './types';

export const DEFAULT_APP_CONFIG: AppConfig = {
  models: DEFAULT_MODEL_ROUTES,
  algorithm: DEFAULT_ALGORITHM_CONFIG,
  categories: DEFAULT_CATEGORIES,
  generation: DEFAULT_GENERATION_CONFIG,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Overlays overrides on defaults at every depth, replacing arrays wholesale.
 *
 * Depth matters more than it looks: Settings writes a single leaf at a time, so
 * an override is typically `{ models: { roundGeneration: { maxTokens: 16000 } } }`.
 * Spreading one level down would replace the whole route object with that
 * fragment and take the model id and temperature with it — the override would
 * appear to work while quietly deleting its siblings.
 *
 * Arrays are replaced rather than concatenated because the only arrays here are
 * `categories.topics` and `categories.formats`, where a user's edited list is
 * the list, not an addition to the compiled-in one.
 */
function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    result[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return result as T;
}

export function mergeConfig(overrides: AppConfigOverrides | null | undefined): AppConfig {
  if (!overrides) return DEFAULT_APP_CONFIG;
  return deepMerge(DEFAULT_APP_CONFIG, overrides);
}

export type { AppConfig, AppConfigOverrides } from './types';
export type { QueryKind, ModelRoute, ModelRoutes } from './models';
export type { AlgorithmConfig } from './algorithm';
export type { Categories } from './categories';
export type { GenerationConfig } from './generation';
