import type { GlossLanguage } from '@/domain/glossLanguage';
import './GlossPanel.css';

export interface GlossPanelItem {
  arabic: string;
  forms: string | null;
  gloss: string;
}

export interface GlossPanelProps {
  item: GlossPanelItem | null;
  /** Which language the definition is written in (§13); English by default. */
  language?: GlossLanguage;
  /** Whether the word currently shown is flagged "didn't know". */
  isNotKnown: boolean;
  /** Toggle the "didn't know" flag on the word currently shown. */
  onToggleNotKnown: () => void;
  /**
   * Fetch a translation for the word currently shown. Offered only when it has
   * none — a single-word model call, which is why it can sit behind a tap where
   * the whole-article pass is a deliberate wait. Absent ⇒ no button.
   */
  onDefine?: () => void;
  /** A define request for the current word is in flight. */
  defining?: boolean;
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
export function GlossPanel({
  item,
  language = 'english',
  isNotKnown,
  onToggleNotKnown,
  onDefine,
  defining = false,
}: GlossPanelProps) {
  const arabic = language === 'arabic';
  return (
    <div className="gloss-panel" role="status" aria-live="polite">
      {item ? (
        <div key={`${item.arabic}:${item.gloss}`} className="gloss-panel__content">
          <div className="gloss-panel__text">
            <div dir="rtl" lang="ar" className="gloss-panel__row">
              <span className="gloss-panel__arabic">{item.arabic}</span>
              {item.forms && <span className="gloss-panel__forms">{item.forms}</span>}
            </div>
            {/* Publisher articles gloss only what their editors thought hard,
                so most words arrive with an empty gloss. The word is still
                tracked and still flaggable — say that rather than showing a
                blank row that reads as a rendering fault. */}
            {item.gloss ? (
              <div
                dir={arabic ? 'rtl' : 'ltr'}
                lang={arabic ? 'ar' : 'en'}
                className={
                  'gloss-panel__definition' + (arabic ? ' gloss-panel__definition--arabic' : '')
                }
              >
                {item.gloss}
              </div>
            ) : (
              <div className="gloss-panel__definition gloss-panel__definition--empty">
                <span>{arabic ? 'No Arabic definition yet' : 'No translation yet'}</span>
                {onDefine && (
                  <button
                    type="button"
                    className="gloss-panel__define"
                    onClick={onDefine}
                    disabled={defining}
                  >
                    {defining ? 'Defining…' : 'Define'}
                  </button>
                )}
              </div>
            )}
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
