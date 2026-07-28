import './GlossPanel.css';

export interface GlossPanelItem {
  arabic: string;
  forms: string | null;
  gloss: string;
}

export interface GlossPanelProps {
  item: GlossPanelItem | null;
  /** Whether the word currently shown is flagged "didn't know". */
  isNotKnown: boolean;
  /** Toggle the "didn't know" flag on the word currently shown. */
  onToggleNotKnown: () => void;
}

/**
 * The signature element (§5.5): a marginal note, not a modal. Bottom-fixed,
 * fixed height, separated from the text by a single hairline. Never dims or
 * overlays the text — the learner must see the word in its sentence while
 * reading its gloss. Content changes without the panel moving (cross-fade,
 * no slide); REQ-P6 keeps it above the iOS home indicator via the safe-area
 * inset.
 *
 * The "Didn't know" control is the one thing that makes a word's highlight
 * persist: a plain tap is transient, this flag is durable.
 */
export function GlossPanel({ item, isNotKnown, onToggleNotKnown }: GlossPanelProps) {
  return (
    <div className="gloss-panel" role="status" aria-live="polite">
      {item ? (
        <div key={`${item.arabic}:${item.gloss}`} className="gloss-panel__content">
          <div className="gloss-panel__text">
            <div dir="rtl" lang="ar" className="gloss-panel__row">
              <span className="gloss-panel__arabic">{item.arabic}</span>
              {item.forms && <span className="gloss-panel__forms">{item.forms}</span>}
            </div>
            <div className="gloss-panel__english">{item.gloss}</div>
          </div>
          <button
            type="button"
            className={'gloss-panel__flag' + (isNotKnown ? ' gloss-panel__flag--on' : '')}
            aria-pressed={isNotKnown}
            onClick={onToggleNotKnown}
          >
            Didn’t know
          </button>
        </div>
      ) : (
        <div className="gloss-panel__placeholder">Tap a word to see its translation.</div>
      )}
    </div>
  );
}
