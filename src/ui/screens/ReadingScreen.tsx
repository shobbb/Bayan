import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ArabicText } from '@/ui/components/ArabicText';
import { GlossPanel, type GlossPanelItem } from '@/ui/components/GlossPanel';
import type { Segment } from '@/domain/types';
import { DEMO_SEGMENTS, DEMO_TITLE_AR } from './demoRound';
import './ReadingScreen.css';

export interface ReadingScreenProps {
  segments?: Segment[];
  titleAr?: string;
  /** Receives the segment indices flagged “didn’t know”, which carry the unclear signal. */
  onFinish: (notKnownIndices: number[]) => void;
  /**
   * Attribution for third-party text, rendered under the title and linking
   * back to the original. Required for anything the app did not write, and
   * absent for generated rounds, which need none.
   */
  attribution?: { label: string; url: string } | null;
  /** Flags carried over from a previous read of the same text. */
  initialNotKnown?: readonly number[];
  /**
   * Rendered between the title and the text. Typed as a node rather than as an
   * image and a video URL so this screen stays ignorant of where its text came
   * from — generated rounds pass nothing.
   */
  media?: ReactNode;
  /**
   * Leaves without recording the reading. Rounds are already persisted by the
   * time they are shown (REQ-32 covers a round read but never finished), so
   * backing out of one costs only this session's flags; backing out of an
   * article discards the reading entirely, since nothing is written until
   * Finish. Either way it is what a back control is expected to do.
   */
  onExit?: { label: string; run: () => void };
  /**
   * Offered when the text contains words nothing has a translation for. Not
   * automatic: it is a paid model call on the reader's key, so it is asked for
   * rather than spent on their behalf (REQ-15).
   */
  enrich?: { count: number; busy: boolean; run: () => void } | null;
}

// Used only when the panel cannot be measured (no layout, as under jsdom).
// Everywhere else the panel's real height is read from the DOM, so this file
// cannot fall out of step with --gloss-panel-height.
const FALLBACK_PANEL_HEIGHT_PX = 104;

/** Lowest point a tapped word may occupy and still sit clear of the panel. */
function visibleBottom(container: HTMLElement | null): number {
  const panel = container?.querySelector<HTMLElement>('.gloss-panel');
  const height = panel?.getBoundingClientRect().height || FALLBACK_PANEL_HEIGHT_PX;
  return window.innerHeight - height - 24; // one space-5 of breathing room
}

/**
 * Reading is a page (REQ-D1): the interface disappears, no cards or
 * containers. Renders against hardcoded segments for now (build order
 * step 5) — proving RTL rendering and tap logging before the generation
 * flow (§8) is wired in.
 */
export function ReadingScreen({
  segments = DEMO_SEGMENTS,
  titleAr = DEMO_TITLE_AR,
  onFinish,
  attribution = null,
  initialNotKnown,
  media = null,
  onExit,
  enrich = null,
}: ReadingScreenProps) {
  // Two independent highlights:
  //  - activeIndex     the one word being viewed now; a transient highlight
  //                    that moves to whatever word was tapped last.
  //  - notKnownIndices words explicitly flagged "didn't know"; a persistent
  //                    highlight that survives tapping other words.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [notKnownIndices, setNotKnownIndices] = useState<Set<number>>(
    () => new Set(initialNotKnown ?? []),
  );
  const [glossItem, setGlossItem] = useState<GlossPanelItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTapWord = useCallback(
    (segment: Segment, index: number) => {
      if (segment.gloss === null) return; // punctuation and breaks are not tappable

      if (index === activeIndex) {
        // Re-tapping the active word clears it (double-tap to remove) and drops
        // any "didn't know" flag on it — a fully reversible mistap (REQ-19).
        setActiveIndex(null);
        setGlossItem(null);
        setNotKnownIndices((prev) => {
          if (!prev.has(index)) return prev;
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
        return;
      }

      // Tapping a different word moves the transient highlight to it. The
      // previous word loses its highlight unless it was flagged "didn't know".
      setActiveIndex(index);
      setGlossItem({ arabic: segment.text, forms: segment.forms, gloss: segment.gloss });

      // REQ-D6: the gloss panel must never cover the tapped word.
      const target = containerRef.current?.querySelector<HTMLElement>(
        `[data-segment-index="${index}"]`,
      );
      if (target) {
        const rect = target.getBoundingClientRect();
        if (rect.bottom > visibleBottom(containerRef.current)) {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    },
    [activeIndex],
  );

  const handleToggleNotKnown = useCallback(() => {
    if (activeIndex === null) return;
    setNotKnownIndices((prev) => {
      const next = new Set(prev);
      if (next.has(activeIndex)) next.delete(activeIndex);
      else next.add(activeIndex);
      return next;
    });
  }, [activeIndex]);

  const activeIsNotKnown = activeIndex !== null && notKnownIndices.has(activeIndex);

  return (
    <div className="reading-screen" ref={containerRef}>
      {/* Finish is at the far end of the text, which is no use to someone who
          wants out after two paragraphs. */}
      {onExit && (
        <button type="button" className="reading-screen__exit" onClick={onExit.run}>
          ← {onExit.label}
        </button>
      )}

      {/* Arabic only. An English title beside it is read first and instead,
          which costs the reader the one bit of comprehension the headline was
          going to give them. */}
      <header className="reading-screen__header">
        <h1 dir="rtl" lang="ar" className="reading-screen__title-ar">
          {titleAr}
        </h1>
        {attribution && (
          <p className="reading-screen__attribution">
            <a href={attribution.url} target="_blank" rel="noreferrer noopener">
              {attribution.label}
            </a>
          </p>
        )}
      </header>

      {media}

      {enrich && enrich.count > 0 && (
        <p className="reading-screen__enrich">
          <button
            type="button"
            className="reading-screen__enrich-action"
            aria-busy={enrich.busy}
            onClick={enrich.run}
          >
            {enrich.busy
              ? `Translating ${enrich.count} words…`
              : `Translate ${enrich.count} untranslated words`}
          </button>
        </p>
      )}

      <ArabicText
        segments={segments}
        activeIndex={activeIndex}
        notKnownIndices={notKnownIndices}
        onTapWord={handleTapWord}
      />

      <div className="reading-screen__finish-row">
        <button
          type="button"
          className="reading-screen__finish"
          onClick={() => onFinish([...notKnownIndices])}
        >
          Finish
        </button>
      </div>

      <GlossPanel
        item={glossItem}
        isNotKnown={activeIsNotKnown}
        onToggleNotKnown={handleToggleNotKnown}
      />
    </div>
  );
}
