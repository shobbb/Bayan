/**
 * Restoring state from a dump the user supplies (§13 Import, §14).
 *
 * Goes through the same parse → plan → apply path as first-run seeding and
 * remote restore (REQ-I1): one schema, one merge rule, one writer. A separate
 * import path would be free to drift from the one the seed data is validated
 * against, and the drift would only show up on somebody's real corpus.
 */
import { parseStateExport } from '@/domain/interchange/schema';
import { planImport, type ImportMode, type ImportReport } from '@/domain/interchange/importPlan';
import { applyImport } from '@/data/interchangeRepository';
import { listWords } from '@/data/wordRepository';
import { listRounds } from '@/data/roundRepository';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';

export class ImportValidationError extends Error {
  readonly failures: ReadonlyArray<{ path: string; message: string }>;

  constructor(failures: ReadonlyArray<{ path: string; message: string }>) {
    const first = failures[0];
    super(
      `That dump did not match the expected shape${first ? ` — ${first.path}: ${first.message}` : ''}.`,
    );
    this.name = 'ImportValidationError';
    this.failures = failures;
  }

  /** Operator detail, same contract as a failed generation (REQ-17). */
  describe(): string {
    return this.failures
      .slice(0, 8)
      .map((failure) => `${failure.path || '(root)'}: ${failure.message}`)
      .join('\n');
  }
}

/** The two modes an import can be run in. `dryRun` belongs to planning, not here. */
export type ApplyMode = Exclude<ImportMode, 'dryRun'>;

/**
 * `merge` layers the dump over what is already here (REQ-I3); `replace` wipes
 * first. Replace is destructive and irreversible, so the caller confirms it —
 * this function does not ask, and does not decide.
 */
export async function importFromJson(raw: string, mode: ApplyMode): Promise<ImportReport> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new ImportValidationError([{ path: '', message: 'not valid JSON' }]);
  }

  const parsed = parseStateExport(parsedJson);
  if (!parsed.ok) throw new ImportValidationError(parsed.failures);

  // A merge has to see the current corpus to apply REQ-I3's merge rule; a
  // replace deliberately does not, so nothing local can influence the result.
  const existing =
    mode === 'merge'
      ? { words: await listWords(DEFAULT_TRACK_ID), rounds: await listRounds(DEFAULT_TRACK_ID) }
      : { words: [], rounds: [] };

  const plan = planImport(
    parsed.value,
    existing,
    modernStandardArabicProfile,
    DEFAULT_TRACK_ID,
    mode,
  );

  await applyImport({ words: plan.words, rounds: plan.rounds }, DEFAULT_TRACK_ID, mode === 'replace');
  return plan.report;
}
