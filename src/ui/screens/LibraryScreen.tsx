import { useEffect, useMemo, useState } from 'react';
import type { Article, ArticleSource } from '@/domain/articles/types';
import { DifficultyLabel } from '@/ui/components/DifficultyLabel';
import { listLibrary, type LibraryEntry } from '@/services/articles/articleService';
import './LibraryScreen.css';

export interface LibraryScreenProps {
  onOpenArticle: (id: string) => void;
  /** Set while an article is being prepared, so its card can show progress. */
  opening: string | null;
}

/** Publisher's own ladder, easiest first. */
const LEVEL_ORDER = ['introductory', 'elementary', 'intermediate'];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * One card.
 *
 * Two thirds of these articles ship a publisher image; the rest are video
 * lessons whose stills cannot be derived without an API call. Rather than
 * leave a hole or invent a URL, the card falls back to setting the article's
 * own Arabic title as the tile — and then drops the separate title line, since
 * repeating it directly underneath just reads as a mistake.
 */
function ArticleCard({
  article,
  readAt,
  busy,
  onOpen,
}: {
  article: Article;
  readAt: number | null;
  busy: boolean;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(article.imageUrl) && !failed;

  return (
    <button type="button" className="library__card" aria-busy={busy} onClick={onOpen}>
      {showImage ? (
        <img
          className="library__image"
          src={article.imageUrl ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="library__image library__image--fallback">
          <span dir="rtl" lang="ar" className="library__fallback-title">
            {article.titleAr}
          </span>
        </div>
      )}

      {showImage && (
        <span dir="rtl" lang="ar" className="library__card-title">
          {article.titleAr}
        </span>
      )}
      {/* Difficulty leads: it is what decides whether to open this at all, and
          it is the only coloured thing on the card. Length comes next, being
          the other half of "have I got time for this right now". */}
      <span className="library__card-meta">
        <DifficultyLabel level={article.difficulty} />
        {article.difficulty !== null && ' · '}
        {capitalize(article.level)}
        {article.wordCount !== null && ` · ${article.wordCount} words`}
        {article.videoUrl && ' · video'}
        {readAt !== null && ' · read'}
      </span>
    </button>
  );
}

/**
 * Third-party reading material, kept visually distinct from generated rounds
 * so it is always clear whose text is on screen. Every card carries the level
 * it was published at, and the reader carries the attribution and backlink.
 */
export function LibraryScreen({ onOpenArticle, opening }: LibraryScreenProps) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [source, setSource] = useState<ArticleSource | null>(null);
  const [level, setLevel] = useState<string>('all');
  const [topic, setTopic] = useState<string>('all');
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listLibrary()
      .then((library) => {
        if (cancelled) return;
        setEntries(library.entries);
        setSource(library.source);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(error instanceof Error ? error.message : 'Could not load the library.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const levels = useMemo(() => {
    const present = new Set((entries ?? []).map((entry) => entry.article.level));
    return LEVEL_ORDER.filter((candidate) => present.has(candidate));
  }, [entries]);

  // Ordered by how many articles carry each, so the rail opens on the subjects
  // actually worth scrolling to rather than on whatever sorts first.
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries ?? []) {
      for (const name of entry.article.topics) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [entries]);

  const shown = useMemo(
    () =>
      (entries ?? []).filter(
        (entry) =>
          (level === 'all' || entry.article.level === level) &&
          (topic === 'all' || entry.article.topics.includes(topic)),
      ),
    [entries, level, topic],
  );

  const readCount = (entries ?? []).filter((entry) => entry.readAt !== null).length;

  return (
    <div className="library has-bottom-nav">
      <div className="library__intro">
        <h1 className="library__title">Articles</h1>
        {source && (
          <p className="library__source">
            From{' '}
            <a href={source.homeUrl} target="_blank" rel="noreferrer noopener">
              {source.name}
            </a>
            . Their text, their vocabulary lists.
          </p>
        )}
        {entries && (
          <p className="library__context">
            {entries.length} articles · {readCount} read
          </p>
        )}
      </div>

      {/* Two dimensions, one line each. They scroll rather than wrap: a filter
          row that grows to three lines pushes the articles themselves off the
          screen, which is the opposite of what a library is for. */}
      {levels.length > 1 && (
        <div className="library__filters" role="group" aria-label="Level">
          {['all', ...levels].map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={level === candidate}
              className={'library__chip' + (level === candidate ? ' library__chip--on' : '')}
              onClick={() => setLevel(candidate)}
            >
              {candidate === 'all' ? 'All levels' : capitalize(candidate)}
            </button>
          ))}
        </div>
      )}

      {topics.length > 1 && (
        <div className="library__filters" role="group" aria-label="Topic">
          {['all', ...topics].map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={topic === candidate}
              className={'library__chip' + (topic === candidate ? ' library__chip--on' : '')}
              onClick={() => setTopic(candidate)}
            >
              {candidate === 'all' ? 'All topics' : capitalize(candidate)}
            </button>
          ))}
        </div>
      )}

      {failure && <p className="library__note">{failure}</p>}
      {!entries && !failure && <p className="library__note">Loading…</p>}
      {entries && shown.length === 0 && (
        <p className="library__note">Nothing matches those two filters.</p>
      )}

      <ul className="library__grid">
        {shown.map(({ article, readAt }) => (
          <li key={article.id}>
            <ArticleCard
              article={article}
              readAt={readAt}
              busy={opening === article.id}
              onOpen={() => onOpenArticle(article.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
