import type { Segment } from '@/domain/types';
import { PARAGRAPH_BREAK } from '@/domain/types';
import './ArabicText.css';

export interface ArabicTextProps {
  segments: Segment[];
  markedIndices: ReadonlySet<number>;
  onTapWord: (segment: Segment, index: number) => void;
}

/**
 * RTL renderer with per-word tap targets (§8, §17). Splitting at word
 * boundaries is safe because Arabic shaping does not cross whitespace —
 * proven by docs/reference_reader.jsx. Punctuation renders inline with no
 * leading space; PARAGRAPH_BREAK renders as a line break.
 */
export function ArabicText({ segments, markedIndices, onTapWord }: ArabicTextProps) {
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
        const isMarked = markedIndices.has(index);

        return (
          <button
            key={index}
            type="button"
            data-segment-index={index}
            aria-pressed={isMarked}
            className={
              'arabic-text__word' +
              (isMarked ? ' arabic-text__word--marked' : '') +
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
