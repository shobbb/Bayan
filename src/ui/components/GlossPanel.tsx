import './GlossPanel.css';

export interface GlossPanelItem {
  arabic: string;
  forms: string | null;
  gloss: string;
}

export interface GlossPanelProps {
  item: GlossPanelItem | null;
}

/**
 * The signature element (§5.5): a marginal note, not a modal. Bottom-fixed,
 * fixed height, separated from the text by a single hairline. Never dims or
 * overlays the text — the learner must see the word in its sentence while
 * reading its gloss. Content changes without the panel moving (cross-fade,
 * no slide); REQ-P6 keeps it above the iOS home indicator via the safe-area
 * inset.
 */
export function GlossPanel({ item }: GlossPanelProps) {
  return (
    <div className="gloss-panel" role="status" aria-live="polite">
      {item ? (
        <div key={`${item.arabic}:${item.gloss}`} className="gloss-panel__content">
          <div dir="rtl" lang="ar" className="gloss-panel__row">
            <span className="gloss-panel__arabic">{item.arabic}</span>
            {item.forms && <span className="gloss-panel__forms">{item.forms}</span>}
          </div>
          <div className="gloss-panel__english">{item.gloss}</div>
        </div>
      ) : (
        <div className="gloss-panel__placeholder">Tap a word to see its translation.</div>
      )}
    </div>
  );
}
