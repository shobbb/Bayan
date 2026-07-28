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

export function mergeConfig(overrides: AppConfigOverrides | null | undefined): AppConfig {
  if (!overrides) return DEFAULT_APP_CONFIG;

  return {
    models: { ...DEFAULT_APP_CONFIG.models, ...overrides.models },
    algorithm: {
      bandit: { ...DEFAULT_APP_CONFIG.algorithm.bandit, ...overrides.algorithm?.bandit },
      wordDraw: { ...DEFAULT_APP_CONFIG.algorithm.wordDraw, ...overrides.algorithm?.wordDraw },
      batch: { ...DEFAULT_APP_CONFIG.algorithm.batch, ...overrides.algorithm?.batch },
      grading: { ...DEFAULT_APP_CONFIG.algorithm.grading, ...overrides.algorithm?.grading },
    },
    categories: { ...DEFAULT_APP_CONFIG.categories, ...overrides.categories },
    generation: {
      ...DEFAULT_APP_CONFIG.generation,
      ...overrides.generation,
      newWordDensity: {
        ...DEFAULT_APP_CONFIG.generation.newWordDensity,
        ...overrides.generation?.newWordDensity,
      },
    },
  };
}

export type { AppConfig, AppConfigOverrides } from './types';
export type { QueryKind, ModelRoute, ModelRoutes } from './models';
export type { AlgorithmConfig } from './algorithm';
export type { Categories } from './categories';
export type { GenerationConfig } from './generation';
