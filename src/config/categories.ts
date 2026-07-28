/**
 * Topic and format controlled vocabularies (§3.4). Closed set at runtime
 * (REQ-C5) — free-text entry is prohibited because label drift would break
 * the performance aggregation in Stats (§11). Adding a category is a config
 * edit only; no code change is required (REQ-C6).
 *
 * These are the categories the method is actually run against, so they match
 * the labels on existing rounds. That matters beyond tidiness: the bandit
 * scores only arms present in this list (§12.1), so a topic that has been read
 * but is missing here contributes no reward signal and can never be selected
 * again. An import may override the list — see the interchange schema (§14.1).
 */
export interface Categories {
  topics: string[];
  formats: string[];
}

export const DEFAULT_CATEGORIES: Categories = {
  topics: [
    'social',
    'study/discourse',
    'kalam',
    'fiqh/usul',
    'classical adab',
    'epistemology',
    'science/medicine',
    'science/space',
    'health',
    'governance',
    'environment',
    'urban planning',
    'history',
    'work/economy',
    'education',
    'agriculture',
    'housing/daily life',
    'technology',
    'politics',
    'media/journalism',
    'tourism/heritage',
    'institutions/civil society',
    'fiction/everyday life',
    'food/meals',
    'clothing/shopping',
    'weather/seasons',
    'travel/transport',
    'family/relationships',
    'leisure/sport',
    'arts/literature',
    'music',
    'religion/holidays',
    'geography/Arab world',
    'childhood/memory',
    'crafts/trades',
    'law/rights',
    'international relations',
    'economics',
    'women/society',
    'language/linguistics',
    'biography',
  ],
  formats: [
    'dialogue',
    'article',
    'article-argument',
    'article-sharh',
    'article-classical',
    'narrative',
    'letter',
    'interview',
    'speech/khutba',
    'procedural',
    'news-report',
    'description',
  ],
};
