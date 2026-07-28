/**
 * Guards the bundled seed corpus (§14). It must parse under the interchange
 * schema, and the figures this app derives must reproduce the summary block
 * the external tool exported alongside it — that block is the method's own
 * accounting, so a mismatch means our metrics have drifted from it.
 */
import { describe, it, expect } from 'vitest';
import { parseStateExport } from './schema';
import { planImport } from './importPlan';
import { buildStateExport, serializeStateExport } from './buildExport';
import { DEFAULT_CATEGORIES } from '@/config/categories';
import { acquisitionRate, statusCounts } from '@/domain/stats/metrics';
import { modernStandardArabicProfile } from '@/domain/languageProfile';
import type { TrackId } from '@/domain/types';
import seedState from '@/assets/seed/seedState.json';

const TRACK = 'msa' as TrackId;

interface SeedSummary {
  totalWords: number;
  neverFlagged: number;
  flaggedThenPassed: number;
  stillFailing: number;
  flaggedOnceNeverRetested: number;
  acquisitionRate: number;
  totalRounds: number;
}

const summary = (seedState as { summary: SeedSummary }).summary;

describe('bundled seed corpus', () => {
  const result = parseStateExport(seedState);

  it('parses under the interchange schema (REQ-I8)', () => {
    if (!result.ok) {
      throw new Error(`seed failed validation: ${JSON.stringify(result.failures.slice(0, 5))}`);
    }
    expect(result.ok).toBe(true);
  });

  it('imports every word and round without loss', () => {
    if (!result.ok) throw new Error('seed failed validation');

    const plan = planImport(
      result.value,
      { words: [], rounds: [] },
      modernStandardArabicProfile,
      TRACK,
    );

    expect(plan.report.totalWords).toBe(summary.totalWords);
    expect(plan.report.totalRounds).toBe(summary.totalRounds);
  });

  it('reproduces the exported status breakdown', () => {
    if (!result.ok) throw new Error('seed failed validation');
    const plan = planImport(
      result.value,
      { words: [], rounds: [] },
      modernStandardArabicProfile,
      TRACK,
    );

    const counts = statusCounts(plan.words);
    expect(counts.neverFlagged).toBe(summary.neverFlagged);
    expect(counts.flaggedThenPassed).toBe(summary.flaggedThenPassed);
    expect(counts.flaggedOnceNeverReshown).toBe(summary.flaggedOnceNeverRetested);
  });

  /**
   * The corpus contains records flagged more often than they were shown
   * (`unclearCount > seenCount`), which the exported summary leaves out of
   * every bucket — its four counts total 1715 against 1719 words. Treating
   * "flagged at least as often as shown" as still failing keeps the four in
   * the accounting, so our buckets partition the corpus exactly.
   */
  it('accounts for every word, including records flagged more often than shown', () => {
    if (!result.ok) throw new Error('seed failed validation');
    const plan = planImport(
      result.value,
      { words: [], rounds: [] },
      modernStandardArabicProfile,
      TRACK,
    );

    const counts = statusCounts(plan.words);
    const overFlagged = plan.words.filter(
      (word) => word.seenCount >= 2 && word.unclearCount > word.seenCount,
    ).length;

    expect(overFlagged).toBeGreaterThan(0);
    expect(counts.stillFailing).toBe(summary.stillFailing + overFlagged);

    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(summary.totalWords);
  });

  /**
   * The strongest guarantee we can give the backup path: the real corpus, not a
   * fixture, survives export -> import unchanged. A dump that loses anything
   * here loses it permanently, since this is the only backup path (REQ-37).
   */
  it('survives a full export/import round trip unchanged (REQ-I11)', () => {
    if (!result.ok) throw new Error('seed failed validation');
    const imported = planImport(
      result.value,
      { words: [], rounds: [] },
      modernStandardArabicProfile,
      TRACK,
    );

    const dumped = serializeStateExport(
      buildStateExport(imported.words, imported.rounds, DEFAULT_CATEGORIES, null, 1),
    );
    const reparsed = parseStateExport(JSON.parse(dumped));
    if (!reparsed.ok) {
      throw new Error(`export failed to validate: ${JSON.stringify(reparsed.failures.slice(0, 3))}`);
    }

    const restored = planImport(
      reparsed.value,
      { words: [], rounds: [] },
      modernStandardArabicProfile,
      TRACK,
      'replace',
    );

    expect(restored.words).toHaveLength(imported.words.length);
    expect(restored.rounds).toHaveLength(imported.rounds.length);
    expect(restored.words).toEqual(imported.words);
    expect(restored.rounds).toEqual(imported.rounds);
  });

  it('derives an acquisition rate consistent with that accounting (REQ-28)', () => {
    if (!result.ok) throw new Error('seed failed validation');
    const plan = planImport(
      result.value,
      { words: [], rounds: [] },
      modernStandardArabicProfile,
      TRACK,
    );

    const counts = statusCounts(plan.words);
    const expected =
      counts.flaggedThenPassed / (counts.flaggedThenPassed + counts.stillFailing);

    expect(acquisitionRate(plan.words)).toBeCloseTo(expected, 10);
    // Within a couple of points of the exported figure; the gap is the four
    // over-flagged records the summary omits.
    expect(acquisitionRate(plan.words)).toBeCloseTo(summary.acquisitionRate, 1);
  });
});
