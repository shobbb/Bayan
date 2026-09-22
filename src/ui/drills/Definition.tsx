import type { GlossLanguage } from '@/domain/glossLanguage';
import './drills.css';

export interface DefinitionProps {
  text: string;
  language: GlossLanguage;
  /** Base class; the Arabic modifier is appended to it. */
  className?: string;
}

/**
 * The answer side of a card, in whichever language it was written (§13).
 *
 * One component rather than a conditional in each view, because getting this
 * wrong is silent: an Arabic definition rendered left-to-right in a Latin serif
 * still *reads*, badly, and nothing fails. Having a single place that decides
 * direction, language and font means a view cannot forget.
 */
export function Definition({ text, language, className = 'drill__gloss' }: DefinitionProps) {
  const arabic = language === 'arabic';
  return (
    <span
      dir={arabic ? 'rtl' : 'ltr'}
      lang={arabic ? 'ar' : 'en'}
      className={className + (arabic ? ` ${className}--arabic` : '')}
    >
      {text}
    </span>
  );
}
