/**
 * Remote backup orchestration (§14 / REQ-37).
 *
 * The rules here exist because the failure mode of a sync is not "it didn't
 * work" — it is "it worked, in the wrong direction, and overwrote the only
 * copy". Both directions are therefore explicit and refuse to destroy a larger
 * corpus without being told to.
 */
import type { Categories } from '@/config';
import { parseStateExport, type StateExport } from '@/domain/interchange/schema';
import { planImport } from '@/domain/interchange/importPlan';
import { modernStandardArabicProfile, DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import { applyImport } from '@/data/interchangeRepository';
import { exportState } from '@/services/interchange/exportState';
import { getSupabaseCredentials } from '@/services/platform/storage';
import { getBackup, putBackup, type SupabaseBackupConfig } from './supabaseStorage';

const BACKUP_PATH = 'state/latest.json';

export class BackupNotConfiguredError extends Error {
  constructor() {
    super('Remote backup is not configured. Add a Supabase URL and anon key in Settings.');
    this.name = 'BackupNotConfiguredError';
  }
}

/** Refuses a destructive direction unless the caller has explicitly confirmed. */
export class BackupWouldShrinkError extends Error {
  readonly localRounds: number;
  readonly remoteRounds: number;

  constructor(localRounds: number, remoteRounds: number) {
    super(
      `The backup holds ${remoteRounds} rounds and this device has ${localRounds}. ` +
        'Uploading would discard the difference.',
    );
    this.name = 'BackupWouldShrinkError';
    this.localRounds = localRounds;
    this.remoteRounds = remoteRounds;
  }
}

async function resolveConfig(): Promise<SupabaseBackupConfig> {
  const credentials = await getSupabaseCredentials();
  if (!credentials) throw new BackupNotConfiguredError();
  return { ...credentials, path: BACKUP_PATH };
}

function summarize(state: StateExport) {
  return { words: state.words.length, rounds: state.rounds.length, exportedAt: state.exportedAt };
}

export interface RemoteStatus {
  configured: boolean;
  exists: boolean;
  words?: number;
  rounds?: number;
  exportedAt?: number;
}

export async function readRemoteStatus(): Promise<RemoteStatus> {
  const credentials = await getSupabaseCredentials();
  if (!credentials) return { configured: false, exists: false };

  const raw = await getBackup({ ...credentials, path: BACKUP_PATH });
  if (raw === null) return { configured: true, exists: false };

  const parsed = parseStateExport(JSON.parse(raw));
  if (!parsed.ok) return { configured: true, exists: true };

  return { configured: true, exists: true, ...summarize(parsed.value) };
}

export interface BackupResult {
  words: number;
  rounds: number;
}

/**
 * Uploads the current corpus. Refuses by default when the stored backup holds
 * more rounds than this device — the common way to lose history is a fresh or
 * partially-restored install overwriting a good backup.
 */
export async function backUpNow(
  categories: Categories,
  { force = false }: { force?: boolean } = {},
): Promise<BackupResult> {
  const config = await resolveConfig();
  const dump = await exportState(categories);

  if (!force) {
    const existing = await getBackup(config);
    if (existing !== null) {
      const parsed = parseStateExport(JSON.parse(existing));
      if (parsed.ok && parsed.value.rounds.length > dump.roundCount) {
        throw new BackupWouldShrinkError(dump.roundCount, parsed.value.rounds.length);
      }
    }
  }

  await putBackup(config, dump.json);
  return { words: dump.wordCount, rounds: dump.roundCount };
}

/**
 * Replaces the local corpus with the backup. Always destructive by definition,
 * so it is never triggered automatically for a device that already has data —
 * callers gate it behind an explicit action.
 */
export async function restoreFromBackup(): Promise<BackupResult> {
  const config = await resolveConfig();
  const raw = await getBackup(config);
  if (raw === null) throw new Error('There is no backup stored yet.');

  const parsed = parseStateExport(JSON.parse(raw));
  if (!parsed.ok) {
    const first = parsed.failures[0];
    throw new Error(
      `The stored backup failed validation${first ? ` at ${first.path}: ${first.message}` : ''}.`,
    );
  }

  const plan = planImport(
    parsed.value,
    { words: [], rounds: [] },
    modernStandardArabicProfile,
    DEFAULT_TRACK_ID,
    'replace',
  );

  await applyImport({ words: plan.words, rounds: plan.rounds }, DEFAULT_TRACK_ID, true);
  return { words: plan.report.totalWords, rounds: plan.report.totalRounds };
}
