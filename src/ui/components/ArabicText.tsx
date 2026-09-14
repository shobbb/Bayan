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
  /**
   * Where this run sits in the article's single index space. The headline is
   * the first segments of the same stream but renders in its own block, so it
   * passes 0 and the body passes the title's length — every index this emits
   * is the absolute one, which is what the flags, the stored position and the
   * corpus all key on.
   */
  indexOffset?: number;
  /** Extra class on the wrapper, for the headline's own type treatment. */
  className?: string;
}

/**
 * RTL renderer with per-word tap targets (§8, §17). Splitting at word
 * boundaries is safe because Arabic shaping does not cross whitespace —
 * proven by docs/reference_reader.jsx. Punctuation renders inline with no
 * leading space; PARAGRAPH_BREAK renders as a line break.
 */
export function ArabicText({
  segments,
  activeIndex,
  notKnownIndices,
  onTapWord,
  indexOffset = 0,
  className,
}: ArabicTextProps) {
  return (
    <div dir="rtl" lang="ar" className={'arabic-text' + (className ? ` ${className}` : '')}>
      {segments.map((segment, local) => {
        const index = indexOffset + local;
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

        // Local, not absolute: the first word of a block never needs a space
        // in front of it, whatever its index in the article.
        const previous = local > 0 ? segments[local - 1] : undefined;
        const needsLeadingSpace = local > 0 && previous?.text !== PARAGRAPH_BREAK;
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
