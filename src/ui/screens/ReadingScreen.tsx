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
  onFinish: () => void;
}

// Approx GlossPanel height plus margin — keeps a freshly tapped word visible
// above the fixed panel (REQ-D6).
const GLOSS_PANEL_CLEARANCE_PX = 140;

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
}: ReadingScreenProps) {
  // Two independent highlights:
  //  - activeIndex     the one word being viewed now; a transient highlight
  //                    that moves to whatever word was tapped last.
  //  - notKnownIndices words explicitly flagged "didn't know"; a persistent
  //                    highlight that survives tapping other words.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [notKnownIndices, setNotKnownIndices] = useState<Set<number>>(new Set());
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
        const viewportBottom = window.innerHeight - GLOSS_PANEL_CLEARANCE_PX;
        if (rect.bottom > viewportBottom) {
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
      </header>

      <ArabicText
        segments={segments}
        activeIndex={activeIndex}
        notKnownIndices={notKnownIndices}
        onTapWord={handleTapWord}
      />

      <div className="reading-screen__finish-row">
        <button type="button" className="reading-screen__finish" onClick={onFinish}>
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
