/**
 * First-run seeding (§14): "the app is seeded from ~30 rounds of existing data
 * on first run". The bundled export goes through the same validate → plan →
 * apply path a pasted import does (REQ-I1) — there is no separate seeding
 * code path that could drift from the real importer.
 *
 * Only runs when the corpus is empty, so it never overwrites real usage.
 */
import { parseStateExport } from '@/domain/interchange/schema';
import { planImport } from '@/domain/interchange/importPlan';
import type { ImportReport } from '@/domain/interchange/importPlan';
import { applyImport, isCorpusEmpty } from '@/data/interchangeRepository';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import seedState from '@/assets/seed/seedState.json';

export type SeedOutcome =
  | { status: 'skipped' }
  | { status: 'seeded'; report: ImportReport }
  | { status: 'failed'; reason: string };

export async function seedOnFirstRun(): Promise<SeedOutcome> {
  if (!(await isCorpusEmpty(DEFAULT_TRACK_ID))) return { status: 'skipped' };

  const parsed = parseStateExport(seedState);
  if (!parsed.ok) {
    const first = parsed.failures[0];
    return {
      status: 'failed',
      reason: first ? `${first.path}: ${first.message}` : 'seed data failed validation',
    };
  }

  const plan = planImport(
    parsed.value,
    { words: [], rounds: [] },
    modernStandardArabicProfile,
    DEFAULT_TRACK_ID,
    'merge',
  );

  await applyImport({ words: plan.words, rounds: plan.rounds }, DEFAULT_TRACK_ID);
  return { status: 'seeded', report: plan.report };
}
