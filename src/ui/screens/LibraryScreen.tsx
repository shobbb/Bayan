import { useEffect, useMemo, useState } from 'react';
import type { Article, ArticleSource } from '@/domain/articles/types';
import { listLibrary, type LibraryEntry } from '@/services/articles/articleService';
import './LibraryScreen.css';

export interface LibraryScreenProps {
  onBack: () => void;
  onOpenArticle: (id: string) => void;
  /** Set while an article is being prepared, so its card can show progress. */
  opening: string | null;
}

const LEVEL_ORDER = ['elementary', 'intermediate'];

function levelLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
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
      {article.titleEn && <span className="library__card-en">{article.titleEn}</span>}
      <span className="library__card-meta">
        {levelLabel(article.level)}
        {article.hasVideo && ' · video'}
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
export function LibraryScreen({ onBack, onOpenArticle, opening }: LibraryScreenProps) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [source, setSource] = useState<ArticleSource | null>(null);
  const [level, setLevel] = useState<string>('all');
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

  const shown = useMemo(
    () => (entries ?? []).filter((entry) => level === 'all' || entry.article.level === level),
    [entries, level],
  );

  const readCount = (entries ?? []).filter((entry) => entry.readAt !== null).length;

  return (
    <div className="library">
      <header className="library__header">
        <button type="button" className="library__back" onClick={onBack}>
          ← Home
        </button>
      </header>

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

      {levels.length > 1 && (
        <div className="library__filters">
          {['all', ...levels].map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={level === candidate}
              className={'library__chip' + (level === candidate ? ' library__chip--on' : '')}
              onClick={() => setLevel(candidate)}
            >
              {candidate === 'all' ? 'All' : levelLabel(candidate)}
            </button>
          ))}
        </div>
      )}

      {failure && <p className="library__note">{failure}</p>}
      {!entries && !failure && <p className="library__note">Loading…</p>}

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
