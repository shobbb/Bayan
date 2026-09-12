/**
 * Bandit + word-draw weights, batch sizing, grading tolerance (§3.3).
 * Every weight below carries an inline comment stating what it controls
 * (REQ-C3) so a future editor can tune these without reading the selector.
 * Domain functions receive these as injected arguments — they never import
 * this module directly (REQ-C4), which keeps them pure and testable.
 */
export interface AlgorithmConfig {
  bandit: {
    /** UCB1 exploration constant C. Higher -> covers new categories faster. */
    explorationConstant: number;
  };
  wordDraw: {
    /** Weight on re-exposure of words the learner has flagged before. */
    missRateWeight: number;
    /** Weight favoring words seen few times, so new vocabulary keeps circulating. */
    underSampledWeight: number;
    /** Weight on rounds-since-last-appearance, so early vocabulary doesn't silently exit rotation (REQ-34). */
    stalenessWeight: number;
    /** Number of words drawn per round target set. */
    sampleSize: number;
  };
  batch: {
    /** Measured ceiling; retention degrades above this (REQ-21). */
    defaultSize: number;
    /** Threshold at which the batch-size UI shows a fatigue warning. */
    warnAboveSize: number;
    /**
     * Only draw from words flagged "didn't know" within this many days.
     * 0 takes the whole corpus, which is the default — a window is a way to
     * drill what has gone wrong lately, not the normal way to build a batch.
     */
    markedWithinDays: number;
  };
  grading: {
    /** Max Levenshtein distance accepted as a typo rather than a miss (REQ-26). */
    maxLevenshteinDistance: number;
  };
  drill: {
    /** Cards between checkpoints in a study session (REQ-48). */
    roundSize: number;
  };
}

export const DEFAULT_ALGORITHM_CONFIG: AlgorithmConfig = {
  bandit: {
    explorationConstant: 0.7,
  },
  wordDraw: {
    missRateWeight: 1.0,
    underSampledWeight: 0.5,
    stalenessWeight: 0.4,
    sampleSize: 15,
  },
  batch: {
    defaultSize: 40,
    warnAboveSize: 50,
    markedWithinDays: 0,
  },
  grading: {
    maxLevenshteinDistance: 2,
  },
  drill: {
    roundSize: 10,
  },
};
