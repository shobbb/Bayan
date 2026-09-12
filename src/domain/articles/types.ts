/**
 * Third-party reading material (§2.2 additions). An Article is not a Round: it
 * is not generated, not planned by the selector, and carries no target words,
 * so it is deliberately a separate type rather than a Round with empty fields.
 *
 * Concretely, feeding articles to the bandit would be wrong in both directions
 * — their level/series taxonomy is not in config/categories.ts, so scoreArms
 * would silently drop the observations, and mapping them onto configured
 * topics would let publisher-written text set difficulty rewards for arms that
 * plan generated text. Articles therefore never reach domain/selector.
 *
 * What they do share is the corpus: reading one writes Words through exactly
 * the same ingestion path a round uses, so vocabulary, SRS and stats are global
 * and a word learned here is the same word everywhere else.
 */

/** A publisher-supplied gloss. Higher trust than a generated one (§4.2). */
export interface ArticleGloss {
  /** Vowelled Arabic term or phrase, as printed. */
  term: string;
  gloss: string;
  /** From a "(جَمْعُ x)" note, where the publisher gave one. */
  forms: string | null;
}

export interface Article {
  id: string;
  /** Publisher's level label, lowercased: 'introductory' | 'elementary' | 'intermediate'. */
  level: string;
  series: 'languageofmedia' | 'generallanguage' | 'other';
  /** Canonical page on the publisher's site, for the required backlink (§5.2). */
  sourceUrl: string;
  /**
   * Subject tags, multi-label: an article on stadium economics is both.
   *
   * These are the publisher's subjects, and they are NOT the topic arms in
   * config/categories.ts even where a word coincides. Mapping them onto
   * configured arms is the exact failure the note above describes — it would
   * let published text set difficulty rewards for arms that plan generated
   * rounds. They are for filtering the library and nothing else.
   */
  topics: string[];
  /**
   * Reading difficulty, 1 (easiest) to 5, or null where unmeasured.
   *
   * A quintile, not a score: it ranks these articles against each other by the
   * share of their vocabulary that was unknown when the measurement was taken,
   * so it orders the library well and means nothing in absolute terms.
   */
  difficulty: number | null;
  /** Body length in words, or null where unmeasured. */
  wordCount: number | null;
  titleAr: string;
  titleEn: string | null;
  /** True when the body came from the publisher's fully vowelled variant. */
  vowelled: boolean;
  paragraphs: string[];
  /** Remote publisher image, or null when none could be derived. */
  imageUrl: string | null;
  /** The publisher's own video embed URL, or null. Brightcove or YouTube. */
  videoUrl: string | null;
  vocab: ArticleGloss[];
  expressions: ArticleGloss[];
}

export interface ArticleSource {
  name: string;
  nameAr: string;
  homeUrl: string;
}

export interface ArticleBundle {
  source: ArticleSource;
  articles: Article[];
}

/** Where a segment's gloss came from, so editorial glosses are not overwritten. */
export type GlossSource = 'publisher' | 'corpus' | null;
