import type { ModelRoutes } from './models';
import type { AlgorithmConfig } from './algorithm';
import type { Categories } from './categories';
import type { GenerationConfig } from './generation';

/**
 * Fully typed, merged configuration (REQ-C8). No untyped config object
 * reaches the rest of the app. Everything here is overridable from Settings
 * (REQ-C7) except categories, which are edited as their own list (§3.4).
 */
export interface AppConfig {
  models: ModelRoutes;
  algorithm: AlgorithmConfig;
  categories: Categories;
  generation: GenerationConfig;
}

/** Deep-partial overrides persisted by settingsRepository and layered on top of defaults. */
export type AppConfigOverrides = {
  models?: Partial<ModelRoutes>;
  algorithm?: {
    bandit?: Partial<AlgorithmConfig['bandit']>;
    wordDraw?: Partial<AlgorithmConfig['wordDraw']>;
    batch?: Partial<AlgorithmConfig['batch']>;
    grading?: Partial<AlgorithmConfig['grading']>;
  };
  categories?: Partial<Categories>;
  generation?: Partial<Omit<GenerationConfig, 'newWordDensity'>> & {
    newWordDensity?: Partial<GenerationConfig['newWordDensity']>;
  };
};
