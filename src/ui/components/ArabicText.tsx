import type { Segment } from '@/domain/types';
import { PARAGRAPH_BREAK } from '@/domain/types';
import './ArabicText.css';

export interface ArabicTextProps {
  segments: Segment[];
  /**
   * The single word currently being viewed — a transient highlight that moves
   * to whatever word was tapped last. `null` when nothing is selected.
   */
  activeIndex: number | null;
  /**
   * Words explicitly flagged "didn't know" — a persistent highlight that
   * survives tapping other words. Cleared only by re-tapping the word or
   * toggling the flag off.
   */
  notKnownIndices: ReadonlySet<number>;
  onTapWord: (segment: Segment, index: number) => void;
}

/**
 * RTL renderer with per-word tap targets (§8, §17). Splitting at word
 * boundaries is safe because Arabic shaping does not cross whitespace —
 * proven by docs/reference_reader.jsx. Punctuation renders inline with no
 * leading space; PARAGRAPH_BREAK renders as a line break.
 */
export function ArabicText({ segments, activeIndex, notKnownIndices, onTapWord }: ArabicTextProps) {
  return (
    <div dir="rtl" lang="ar" className="arabic-text">
      {segments.map((segment, index) => {
        if (segment.text === PARAGRAPH_BREAK) {
          return <br key={index} className="arabic-text__break" />;
        }

        const isPunctuation = segment.gloss === null;

        if (isPunctuation) {
          return (
            <span key={index} className="arabic-text__punct">
              {segment.text}
            </span>
          );
        }

        const previous = index > 0 ? segments[index - 1] : undefined;
        const needsLeadingSpace = index > 0 && previous?.text !== PARAGRAPH_BREAK;
        const isActive = index === activeIndex;
        const isNotKnown = notKnownIndices.has(index);

        return (
          <button
            key={index}
            type="button"
            data-segment-index={index}
            aria-pressed={isNotKnown}
            aria-current={isActive ? 'true' : undefined}
            className={
              'arabic-text__word' +
              (isActive ? ' arabic-text__word--active' : '') +
              (isNotKnown ? ' arabic-text__word--not-known' : '') +
              (needsLeadingSpace ? ' arabic-text__word--spaced' : '')
            }
            onClick={() => onTapWord(segment, index)}
          >
            {segment.text}
          </button>
        );
      })}
    </div>
  );
}
