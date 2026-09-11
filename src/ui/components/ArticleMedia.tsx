import { useState } from 'react';
import './ArticleMedia.css';

export interface ArticleMediaProps {
  imageUrl: string | null;
  videoUrl: string | null;
  /** Used as the accessible name of the play control. */
  title: string;
}

/**
 * The publisher's image and video, above the article text.
 *
 * The video is behind a click-to-play facade rather than embedded outright.
 * Two reasons, and neither is performance theatre: a Brightcove player is a
 * heavy third-party frame to load on every article open when most readings
 * never touch it, and embedding it eagerly means a request to a third party the
 * moment a page of Arabic appears — which is not something reading should do
 * unasked. Tapping play is the consent.
 *
 * Nothing here is chrome, so it does not violate §5.1's "the interface
 * disappears": this is the article's own content, published with it.
 */
export function ArticleMedia({ imageUrl, videoUrl, title }: ArticleMediaProps) {
  const [playing, setPlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const showImage = Boolean(imageUrl) && !imageFailed;
  if (!showImage && !videoUrl) return null;

  if (videoUrl && playing) {
    return (
      <div className="article-media">
        <iframe
          className="article-media__frame"
          src={videoUrl}
          title={title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  const picture = showImage ? (
    <img
      className="article-media__image"
      src={imageUrl ?? undefined}
      alt=""
      onError={() => setImageFailed(true)}
    />
  ) : (
    <div className="article-media__image article-media__image--blank" aria-hidden="true" />
  );

  if (!videoUrl) return <div className="article-media">{picture}</div>;

  return (
    <div className="article-media">
      <button
        type="button"
        className="article-media__play"
        aria-label={`Play the video for ${title}`}
        onClick={() => setPlaying(true)}
      >
        {picture}
        <span className="article-media__play-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </button>
    </div>
  );
}
