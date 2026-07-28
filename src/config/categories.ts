/**
 * Topic and format controlled vocabularies (§3.4). Closed set at runtime
 * (REQ-C5) — free-text entry is prohibited because label drift would break
 * the performance aggregation in Stats (§11). Adding a category is a config
 * edit only; no code change is required (REQ-C6).
 */
export interface Categories {
  topics: string[];
  formats: string[];
}

export const DEFAULT_CATEGORIES: Categories = {
  topics: [
    'social',
    'travel',
    'technology',
    'politics',
    'health',
    'education',
    'culture',
    'sports',
    'economy',
    'environment',
    'food',
    'history',
    'science',
    'media',
    'religion',
  ],
  formats: [
    'dialogue',
    'narrative',
    'article',
    'interview',
    'letter',
    'diary',
    'instructions',
    'opinion',
  ],
};
