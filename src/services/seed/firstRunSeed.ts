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
import { getConfigOverrides, setConfigOverrides } from '@/data/settingsRepository';
import { mergeConfig } from '@/config';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';

/**
 * Union of stored and incoming categories: an import brings the vocabulary its
 * rounds are labelled with, but must not drop categories already configured.
 */
async function persistCategories(incoming: { topics: string[]; formats: string[] }): Promise<void> {
  const overrides = (await getConfigOverrides()) ?? {};
  const merged = mergeConfig(overrides).categories;

  await setConfigOverrides({
    ...overrides,
    categories: {
      topics: [...new Set([...merged.topics, ...incoming.topics])],
      formats: [...new Set([...merged.formats, ...incoming.formats])],
    },
  });
}

export type SeedOutcome =
  | { status: 'skipped' }
  | { status: 'seeded'; report: ImportReport }
  | { status: 'failed'; reason: string };

export async function seedOnFirstRun(): Promise<SeedOutcome> {
  if (!(await isCorpusEmpty(DEFAULT_TRACK_ID))) return { status: 'skipped' };

  // Imported here rather than at module scope so the corpus is code-split into
  // its own chunk: it is fetched once, on the run that actually seeds, instead
  // of being parsed on every launch.
  const { default: seedState } = await import('@/assets/seed/seedState.json');

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

  // Carry the incoming category vocabulary across too. The bandit scores only
  // configured arms (§12.1), so importing rounds whose topics are absent from
  // the category list would silently discard their reward signal and make those
  // topics unselectable.
  await persistCategories(parsed.value.categories);

  return { status: 'seeded', report: plan.report };
}
