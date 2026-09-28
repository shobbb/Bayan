import { describe, expect, it } from 'vitest';
import { sentenceAround, contextsByKey } from './context';
import { PARAGRAPH_BREAK } from '@/domain/types';
import type { Segment } from '@/domain/types';

/** Words are tappable and carry a gloss; punctuation carries null. */
function words(text: string): Segment[] {
  return text.split(' ').map((token) => {
    const punct = /^[.!?؟،؛]$/.test(token);
    return { text: token, gloss: punct ? null : '', forms: null };
  });
}

const BREAK: Segment = { text: PARAGRAPH_BREAK, gloss: null, forms: null };

describe('sentenceAround', () => {
  it('returns the sentence the word sits in', () => {
    const segments = words('اسمي نورتان ، عمري خمسة وخمسون عاما . أعمل في السوق');
    const index = segments.findIndex((s) => s.text === 'عمري');

    const sentence = sentenceAround(segments, index);

    expect(sentence).toContain('عمري');
    // A comma keeps the clause together; the full stop ends it.
    expect(sentence).toContain('اسمي');
    expect(sentence).not.toContain('أعمل');
  });

  it('does not cross a paragraph break', () => {
    const segments = [...words('سوق النساء'), BREAK, ...words('في مدينة بارتن')];
    const index = segments.findIndex((s) => s.text === 'بارتن');

    expect(sentenceAround(segments, index)).not.toContain('سوق');
  });

  it('caps how much it takes', () => {
    const segments = words(Array.from({ length: 60 }, (_, i) => `كلمة${i}`).join(' '));

    // Without a cap this would return the whole paragraph, and a small model's
    // attention is the scarce thing being spent.
    expect(sentenceAround(segments, 30).split(' ').length).toBeLessThanOrEqual(25);
  });

  it('is empty for an index that is not there', () => {
    expect(sentenceAround(words('كلمة'), 99)).toBe('');
  });
});

describe('contextsByKey', () => {
  it('keys the first sentence each word appears in', () => {
    const segments = words('عمري خمسة وخمسون . عمري طويل');

    const contexts = contextsByKey(segments, (s) => (s.gloss === '' ? s.text : null));

    // First occurrence, not the last: it is the one the reader met.
    expect(contexts.get('عمري')).toContain('خمسة');
    expect(contexts.get('عمري')).not.toContain('طويل');
  });

  it('sends no context for a word standing alone', () => {
    // A one-word headline gives the model nothing to read against, and
    // "define عنوان, in: عنوان" is worse than no context at all.
    const contexts = contextsByKey(words('عنوان'), (s) => (s.gloss === '' ? s.text : null));

    expect(contexts.has('عنوان')).toBe(false);
  });
});
