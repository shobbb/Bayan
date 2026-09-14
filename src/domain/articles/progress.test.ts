import { describe, expect, it } from 'vitest';
import {
  isInProgress,
  pickCurrentReading,
  readingFraction,
  rebaseIndices,
  resumeIndex,
  type ReadingProgress,
} from './progress';

const NOW = 1_700_000_000_000;

function record(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
  return { id: 'a1', openedAt: NOW, readAt: null, progressIndex: null, ...overrides };
}

describe('isInProgress', () => {
  it('counts an article opened and not finished', () => {
    expect(isInProgress(record())).toBe(true);
  });

  it('does not count one finished after it was opened', () => {
    expect(isInProgress(record({ openedAt: NOW, readAt: NOW + 1000 }))).toBe(false);
  });

  // Reopening is reading it again, and must not cost the article the "read"
  // mark it already earned.
  it('counts a finished article that has since been reopened', () => {
    expect(isInProgress(record({ readAt: NOW - 1000, openedAt: NOW }))).toBe(true);
  });

  // Otherwise every article the learner ever finished would announce itself as
  // "currently reading" the first time this shipped.
  it('does not count a record written before openings were stored', () => {
    expect(isInProgress({ id: 'a1', readAt: NOW })).toBe(false);
    expect(isInProgress({ id: 'a1', readAt: null })).toBe(false);
  });
});

describe('pickCurrentReading', () => {
  it('returns nothing when everything has been finished', () => {
    expect(pickCurrentReading([record({ openedAt: NOW, readAt: NOW + 1 })])).toBeNull();
  });

  it('picks the most recently opened, whatever order they arrive in', () => {
    const chosen = pickCurrentReading([
      record({ id: 'old', openedAt: NOW - 10_000 }),
      record({ id: 'new', openedAt: NOW }),
      record({ id: 'older', openedAt: NOW - 50_000 }),
    ]);

    expect(chosen?.id).toBe('new');
  });

  it('ignores finished articles even when they are the most recent', () => {
    const chosen = pickCurrentReading([
      record({ id: 'open', openedAt: NOW - 10_000 }),
      record({ id: 'done', openedAt: NOW, readAt: NOW + 1 }),
    ]);

    expect(chosen?.id).toBe('open');
  });

  it('returns null for an empty library', () => {
    expect(pickCurrentReading([])).toBeNull();
  });
});

describe('readingFraction', () => {
  it('measures the position against the text it was taken in', () => {
    expect(readingFraction(record({ progressIndex: 25, progressTotal: 100 }))).toBe(0.25);
  });

  // The index counts every segment, punctuation and paragraph breaks included.
  // Dividing by a word count instead made a third of the way in read as five
  // sixths on the Home card.
  it('is zero until a position has been stored', () => {
    expect(readingFraction(record({ progressIndex: null, progressTotal: null }))).toBe(0);
    expect(readingFraction(null)).toBe(0);
  });

  it('never exceeds the whole, whatever is stored', () => {
    expect(readingFraction(record({ progressIndex: 500, progressTotal: 100 }))).toBe(1);
    expect(readingFraction(record({ progressIndex: -5, progressTotal: 100 }))).toBe(0);
  });

  it('refuses to divide by a total it does not have', () => {
    expect(readingFraction(record({ progressIndex: 20, progressTotal: 0 }))).toBe(0);
    expect(readingFraction({ id: 'a1', readAt: null, progressIndex: 20 })).toBe(0);
  });
});

describe('resumeIndex', () => {
  it('returns the stored position', () => {
    expect(resumeIndex(record({ progressIndex: 42 }), 100)).toBe(42);
  });

  it('starts at the top when there is no stored position', () => {
    expect(resumeIndex(record({ progressIndex: null }), 100)).toBeNull();
    expect(resumeIndex(null, 100)).toBeNull();
  });

  // A stored index outlives the reading it came from: a re-import or a
  // re-segmentation can leave it pointing past the end, and scrolling to
  // nowhere looks like an empty article.
  it('clamps a position that is past the end of the text', () => {
    expect(resumeIndex(record({ progressIndex: 500 }), 100)).toBe(99);
  });

  it('treats the very top as no position worth restoring', () => {
    expect(resumeIndex(record({ progressIndex: 0 }), 100)).toBeNull();
  });

  it('refuses a position in an empty or nonsensical text', () => {
    expect(resumeIndex(record({ progressIndex: 5 }), 0)).toBeNull();
    expect(resumeIndex(record({ progressIndex: Number.NaN }), 100)).toBeNull();
    expect(resumeIndex(record({ progressIndex: -3 }), 100)).toBeNull();
  });
});

describe('rebaseIndices', () => {
  // The headline joined the segment stream, which pushed every body index along
  // by its length. Without this, previously flagged words would slide quietly
  // onto their neighbours.
  it('shifts indices written before the headline was part of the stream', () => {
    const before = { id: 'a1', readAt: null, flaggedIndices: [0, 5, 9], progressIndex: 12 };

    expect(rebaseIndices(before, 4)).toEqual({
      flaggedIndices: [4, 9, 13],
      progressIndex: 16,
      titleOffset: 4,
    });
  });

  it('leaves indices alone when the base has not moved', () => {
    const record = { id: 'a1', readAt: null, flaggedIndices: [4, 9], progressIndex: 16, titleOffset: 4 };

    expect(rebaseIndices(record, 4)).toEqual({
      flaggedIndices: [4, 9],
      progressIndex: 16,
      titleOffset: 4,
    });
  });

  it('shifts back when a title re-segments shorter', () => {
    const record = { id: 'a1', readAt: null, flaggedIndices: [6], progressIndex: 8, titleOffset: 4 };

    expect(rebaseIndices(record, 2)).toEqual({
      flaggedIndices: [4],
      progressIndex: 6,
      titleOffset: 2,
    });
  });

  it('drops an index a negative shift would push off the front', () => {
    const record = { id: 'a1', readAt: null, flaggedIndices: [0, 1, 6], titleOffset: 4 };

    expect(rebaseIndices(record, 0).flaggedIndices).toEqual([2]);
  });

  it('keeps a missing position missing', () => {
    expect(rebaseIndices({ id: 'a1', readAt: null, flaggedIndices: [] }, 3).progressIndex).toBeNull();
  });

  it('handles an article with no stored reading at all', () => {
    expect(rebaseIndices(null, 4)).toEqual({
      flaggedIndices: [],
      progressIndex: null,
      titleOffset: 4,
    });
  });

  it('returns indices in order', () => {
    const record = { id: 'a1', readAt: null, flaggedIndices: [9, 0, 5] };

    expect(rebaseIndices(record, 2).flaggedIndices).toEqual([2, 7, 11]);
  });
});
