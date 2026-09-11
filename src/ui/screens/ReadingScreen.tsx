import { useCallback, useRef, useState } from 'react';
import { ArabicText } from '@/ui/components/ArabicText';
import { GlossPanel, type GlossPanelItem } from '@/ui/components/GlossPanel';
import type { Segment } from '@/domain/types';
import { DEMO_SEGMENTS, DEMO_TITLE_AR, DEMO_TITLE_EN } from './demoRound';
import './ReadingScreen.css';

export interface ReadingScreenProps {
  segments?: Segment[];
  titleAr?: string;
  titleEn?: string;
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
  titleEn = DEMO_TITLE_EN,
  onFinish,
  attribution = null,
  initialNotKnown,
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
      <header className="reading-screen__header">
        <h1 dir="rtl" lang="ar" className="reading-screen__title-ar">
          {titleAr}
        </h1>
        <p className="reading-screen__title-en">{titleEn}</p>
        {attribution && (
          <p className="reading-screen__attribution">
            <a href={attribution.url} target="_blank" rel="noreferrer noopener">
              {attribution.label}
            </a>
          </p>
        )}
      </header>

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
