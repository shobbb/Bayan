import { useEffect, useState } from 'react';
import { DEFAULT_APP_CONFIG } from '@/config';
import { readConfigValue, hasOverride, type ConfigValue } from '@/config/overrides';
import { useConfig, useConfigEditor } from '@/ui/context/ConfigContext';
import { CONFIG_FIELDS, CONFIG_FIELD_GROUPS, type ConfigField } from '@/ui/settings/configFields';
import { ConfigFieldRow } from '@/ui/settings/ConfigFieldRow';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  isUsingBuildTimeKey,
  getSupabaseCredentials,
  setSupabaseCredentials,
  clearSupabaseCredentials,
} from '@/services/platform/storage';
import {
  applyDailyReminder,
  notificationsAvailable,
  DEFAULT_DAILY_REMINDER,
  type DailyReminder,
} from '@/services/platform/notifications';
import { getSetting, setSetting } from '@/data/settingsRepository';
import { copyToClipboard, downloadFile } from '@/services/platform/files';
import { exportState } from '@/services/interchange/exportState';
import { importFromJson, ImportValidationError } from '@/services/interchange/importState';
import {
  backUpNow,
  restoreFromBackup,
  readRemoteStatus,
  BackupWouldShrinkError,
  type RemoteStatus,
} from '@/services/sync/backupService';
import './SettingsScreen.css';

export interface SettingsScreenProps {
  onBack: () => void;
}

/** Shows enough of the key to recognise it, never enough to read it back. */
function mask(key: string): string {
  return key.length <= 12 ? '••••' : `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export const DAILY_REMINDER_SETTING_KEY = 'dailyReminder';

/** Local time as an <input type="time"> value, and back. */
function toTimeValue(reminder: DailyReminder): string {
  return `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`;
}

function fromTimeValue(value: string, fallback: DailyReminder): DailyReminder {
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  return { ...fallback, hour: hour ?? fallback.hour, minute: minute ?? fallback.minute };
}

/**
 * Settings (§13): the model provider key, every config value in algorithm.ts,
 * models.ts and generation.ts, the daily reminder, and export/import.
 *
 * The config values are rendered by mapping the field registry, not by a block
 * of JSX per value (REQ-E2) — this view has no knowledge of what any particular
 * weight means, which is what keeps §13's "everything is editable" from decaying
 * into "everything that was editable the day this was written".
 *
 * The key is stored through services/platform (Keychain / EncryptedSharedPrefs),
 * never IndexedDB or localStorage (REQ-P4), and is sent nowhere but the model
 * provider.
 */
export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const config = useConfig();
  const { overrides, setValue, resetValue, resetAll } = useConfigEditor();
  const [stored, setStored] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromBuild, setFromBuild] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<RemoteStatus | null>(null);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [reminder, setReminder] = useState<DailyReminder>(DEFAULT_DAILY_REMINDER);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importDetail, setImportDetail] = useState<string | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getApiKey(),
      isUsingBuildTimeKey(),
      getSupabaseCredentials(),
      getSetting<DailyReminder>(DAILY_REMINDER_SETTING_KEY),
    ]).then(([key, buildProvided, credentials, storedReminder]) => {
      if (cancelled) return;
      setStored(key);
      setFromBuild(buildProvided);
      setHasCredentials(credentials !== null);
      setReminder(storedReminder ?? DEFAULT_DAILY_REMINDER);
      setLoading(false);
      if (credentials) void refreshRemote();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The stored preference is the source of truth; the OS schedule is derived
  // from it, because a reinstall drops scheduled notifications silently.
  async function saveReminder(next: DailyReminder) {
    setReminder(next);
    await setSetting(DAILY_REMINDER_SETTING_KEY, next);
    if (!notificationsAvailable()) {
      setReminderStatus(
        next.enabled
          ? 'Saved. Reminders need the native app — a browser build cannot schedule them.'
          : 'Saved.',
      );
      return;
    }
    const armed = await applyDailyReminder(next);
    setReminderStatus(
      !next.enabled
        ? 'Reminder off.'
        : armed
          ? `Reminder set for ${toTimeValue(next)} daily.`
          : 'Notification permission was refused, so nothing is scheduled.',
    );
  }

  async function runImport(mode: 'merge' | 'replace') {
    const raw = importText.trim();
    if (!raw) return;
    setBusy(true);
    setBackupStatus(null);
    setImportDetail(null);
    try {
      const report = await importFromJson(raw, mode);
      setBackupStatus(
        `Imported ${report.wordsAdded} new words (${report.wordsMerged} merged) and ` +
          `${report.roundsAdded} rounds. Now holding ${report.totalWords} words. Reopen the app.`,
      );
      setImportText('');
      setConfirmingReplace(false);
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Import failed.');
      if (error instanceof ImportValidationError) setImportDetail(error.describe());
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await setApiKey(trimmed);
    setStored(trimmed);
    setFromBuild(false);
    setDraft('');
    setStatus('Key saved on this device.');
  }

  // REQ-37: export is the only backup path, so it is surfaced, not buried.
  async function runExport(deliver: (json: string, filename: string) => Promise<void> | void) {
    setBusy(true);
    setBackupStatus(null);
    try {
      const dump = await exportState(config.categories);
      await deliver(dump.json, dump.filename);
      setBackupStatus(`Exported ${dump.wordCount} words and ${dump.roundCount} rounds.`);
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshRemote() {
    try {
      setRemote(await readRemoteStatus());
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Could not read the backup.');
    }
  }

  async function runBackup(force = false) {
    setBusy(true);
    setBackupStatus(null);
    try {
      const result = await backUpNow(config.categories, { force });
      setBackupStatus(`Backed up ${result.words} words and ${result.rounds} rounds.`);
      await refreshRemote();
    } catch (error) {
      if (error instanceof BackupWouldShrinkError) {
        setBackupStatus(`${error.message} Tap "Back up anyway" to replace it.`);
      } else {
        setBackupStatus(error instanceof Error ? error.message : 'Backup failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function runRestore() {
    setBusy(true);
    setBackupStatus(null);
    try {
      const result = await restoreFromBackup();
      setBackupStatus(`Restored ${result.words} words and ${result.rounds} rounds. Reopen the app.`);
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSupabase() {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) return;
    await setSupabaseCredentials(supabaseUrl.trim(), supabaseKey.trim());
    setHasCredentials(true);
    setSupabaseKey('');
    setBackupStatus('Remote backup configured.');
    await refreshRemote();
  }

  async function handleClearSupabase() {
    await clearSupabaseCredentials();
    setHasCredentials(false);
    setRemote(null);
    setBackupStatus('Remote backup credentials removed.');
  }

  async function handleClear() {
    await clearApiKey();
    // A build-time key may still be in play once the device key is gone.
    const [key, buildProvided] = await Promise.all([getApiKey(), isUsingBuildTimeKey()]);
    setStored(key);
    setFromBuild(buildProvided);
    setStatus('Key removed from this device.');
  }

  const countChanged = (fields: readonly ConfigField[]): number =>
    fields.filter((field) => hasOverride(overrides, field.path)).length;
  const changedCount = countChanged(CONFIG_FIELDS);

  return (
    <div className="settings-screen">
      <header className="settings-screen__header">
        <button type="button" className="settings-screen__back" onClick={onBack}>
          ← Home
        </button>
        <h1 className="settings-screen__title">Settings</h1>
      </header>

      <section className="settings-screen__section">
        <h2 className="settings-screen__section-title">Model provider key</h2>
        <p className="settings-screen__note">
          Stored on this device only, and sent nowhere but the model provider.
        </p>

        {loading ? (
          <p className="settings-screen__note">Loading…</p>
        ) : (
          <>
            <p className="settings-screen__current">
              {stored
                ? `Current key: ${mask(stored)}${fromBuild ? ' (from this build)' : ''}`
                : 'No key set — rounds cannot be generated.'}
            </p>
            {fromBuild && (
              <p className="settings-screen__note">
                Supplied by the deployment, not this device. Anyone who can load this site can
                read it, so keep the site access-controlled. Saving a key below overrides it.
              </p>
            )}

            <input
              type="password"
              className="settings-screen__input"
              placeholder="sk-ant-…"
              value={draft}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
            />

            <div className="settings-screen__row">
              <button
                type="button"
                className="settings-screen__button"
                onClick={() => void handleSave()}
              >
                Save key
              </button>
              {stored && !fromBuild && (
                <button
                  type="button"
                  className="settings-screen__button"
                  onClick={() => void handleClear()}
                >
                  Remove
                </button>
              )}
            </div>

            {status && <p className="settings-screen__note">{status}</p>}
          </>
        )}
      </section>

      <section className="settings-screen__section">
        <h2 className="settings-screen__section-title">Backup</h2>
        <p className="settings-screen__note">
          A complete dump of every word, round, and setting. This is the only backup path —
          browser storage is not included in device backups.
        </p>
        <div className="settings-screen__row">
          <button
            type="button"
            className="settings-screen__button"
            disabled={busy}
            onClick={() => void runExport((json, filename) => downloadFile(filename, json))}
          >
            Save file
          </button>
          <button
            type="button"
            className="settings-screen__button"
            disabled={busy}
            onClick={() => void runExport((json) => copyToClipboard(json))}
          >
            Copy
          </button>
        </div>
        {backupStatus && <p className="settings-screen__note">{backupStatus}</p>}
      </section>

      <section className="settings-screen__section">
        <h2 className="settings-screen__section-title">Remote backup</h2>
        <p className="settings-screen__note">
          Uploads the same dump to Supabase Storage. Only the anon key is accepted — it is
          publishable by design, with access decided by a policy on the bucket. Never put a
          service_role key here: it bypasses every policy and would give anyone who can load
          this site full control of the project.
        </p>

        {hasCredentials ? (
          <>
            <p className="settings-screen__current">
              {remote === null
                ? 'Checking…'
                : remote.exists
                  ? `Backup holds ${remote.words ?? '?'} words and ${remote.rounds ?? '?'} rounds.`
                  : 'No backup stored yet.'}
            </p>
            <div className="settings-screen__row">
              <button
                type="button"
                className="settings-screen__button"
                disabled={busy}
                onClick={() => void runBackup(false)}
              >
                Back up now
              </button>
              <button
                type="button"
                className="settings-screen__button"
                disabled={busy || !remote?.exists}
                onClick={() => void runRestore()}
              >
                Restore
              </button>
            </div>
            <div className="settings-screen__row">
              <button
                type="button"
                className="settings-screen__button"
                disabled={busy}
                onClick={() => void runBackup(true)}
              >
                Back up anyway
              </button>
              <button
                type="button"
                className="settings-screen__button"
                disabled={busy}
                onClick={() => void handleClearSupabase()}
              >
                Forget
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              type="url"
              className="settings-screen__input"
              placeholder="https://your-project.supabase.co"
              value={supabaseUrl}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setSupabaseUrl(event.target.value)}
            />
            <input
              type="password"
              className="settings-screen__input"
              placeholder="anon key"
              value={supabaseKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setSupabaseKey(event.target.value)}
            />
            <div className="settings-screen__row">
              <button
                type="button"
                className="settings-screen__button"
                onClick={() => void handleSaveSupabase()}
              >
                Save
              </button>
            </div>
          </>
        )}
      </section>

      <section className="settings-screen__section">
        <h2 className="settings-screen__section-title">Reminder</h2>
        <p className="settings-screen__note">
          One daily notification when cards are due. Off unless you turn it on, and never used
          for anything else.
        </p>

        <label className="settings-screen__toggle">
          <input
            type="checkbox"
            checked={reminder.enabled}
            onChange={(event) => void saveReminder({ ...reminder, enabled: event.target.checked })}
          />
          <span>Daily reminder</span>
        </label>

        {reminder.enabled && (
          <label className="settings-screen__field">
            <span className="settings-screen__field-label">Time</span>
            <input
              type="time"
              className="settings-screen__input settings-screen__input--time"
              value={toTimeValue(reminder)}
              onChange={(event) => void saveReminder(fromTimeValue(event.target.value, reminder))}
            />
          </label>
        )}

        {!notificationsAvailable() && (
          <p className="settings-screen__note">
            This build runs in a browser, which cannot schedule local notifications. The
            preference is saved and takes effect in the native app.
          </p>
        )}
        {reminderStatus && <p className="settings-screen__note">{reminderStatus}</p>}
      </section>

      <section className="settings-screen__section">
        <h2 className="settings-screen__section-title">Import</h2>
        <p className="settings-screen__note">
          Paste a dump produced by Export. Merge layers it over what is here, keeping the higher
          counts per word. Replace discards everything on this device first.
        </p>
        <textarea
          className="settings-screen__textarea"
          placeholder='{"schemaVersion": …}'
          rows={4}
          spellCheck={false}
          value={importText}
          onChange={(event) => {
            setImportText(event.target.value);
            setConfirmingReplace(false);
          }}
        />
        <div className="settings-screen__row">
          <button
            type="button"
            className="settings-screen__button"
            disabled={busy || importText.trim() === ''}
            onClick={() => void runImport('merge')}
          >
            Merge
          </button>
          {/* Two taps, and the second one says what it destroys. Replace cannot
              be undone — there is no server to recover from (REQ-37). */}
          <button
            type="button"
            className="settings-screen__button settings-screen__button--danger"
            disabled={busy || importText.trim() === ''}
            onClick={() => {
              if (confirmingReplace) void runImport('replace');
              else setConfirmingReplace(true);
            }}
          >
            {confirmingReplace ? 'Erase everything and replace' : 'Replace…'}
          </button>
        </div>
        {confirmingReplace && (
          <p className="settings-screen__note">
            This deletes every word and round on this device and cannot be undone. Export first
            if you are not certain.
          </p>
        )}
        {importDetail && (
          <details className="settings-screen__details">
            <summary>Why it was rejected</summary>
            <pre className="settings-screen__raw">{importDetail}</pre>
          </details>
        )}
      </section>

      <section className="settings-screen__section">
        <h2 className="settings-screen__section-title">Algorithm and models</h2>
        <p className="settings-screen__note">
          Every value the app computes with. Each shows its compiled-in default; anything you
          change can be put back individually.
        </p>
        <div className="settings-screen__row">
          <button
            type="button"
            className="settings-screen__button"
            disabled={changedCount === 0}
            onClick={resetAll}
          >
            {changedCount === 0 ? 'All at defaults' : `Restore ${changedCount} to defaults`}
          </button>
        </div>

        {CONFIG_FIELD_GROUPS.map((group) => (
          <details key={group.id} className="settings-screen__group">
            <summary className="settings-screen__group-summary">
              {group.title}
              {countChanged(group.fields) > 0 && (
                <span className="settings-screen__badge">{countChanged(group.fields)}</span>
              )}
            </summary>
            <p className="settings-screen__note">{group.blurb}</p>
            {group.fields.map((field) => (
              <ConfigFieldRow
                key={field.id}
                field={field}
                value={readConfigValue(config, field.path) as ConfigValue}
                defaultValue={readConfigValue(DEFAULT_APP_CONFIG, field.path) as ConfigValue}
                overridden={hasOverride(overrides, field.path)}
                onChange={(value) => setValue(field.path, value)}
                onReset={() => resetValue(field.path)}
              />
            ))}
          </details>
        ))}
      </section>
    </div>
  );
}
