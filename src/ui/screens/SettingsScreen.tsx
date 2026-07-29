import { useEffect, useState } from 'react';
import { useConfig } from '@/ui/context/ConfigContext';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  isUsingBuildTimeKey,
} from '@/services/platform/storage';
import { copyToClipboard, downloadFile } from '@/services/platform/files';
import { exportState } from '@/services/interchange/exportState';
import {
  getSupabaseCredentials,
  setSupabaseCredentials,
  clearSupabaseCredentials,
} from '@/services/platform/storage';
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

/**
 * Minimal Settings (§13): API key entry and the active model routes. Config
 * overrides, notifications, and export/import land here in build order step 11.
 *
 * The key is stored through services/platform (Keychain / EncryptedSharedPrefs),
 * never IndexedDB or localStorage (REQ-P4), and is sent nowhere but the model
 * provider.
 */
export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const config = useConfig();
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([getApiKey(), isUsingBuildTimeKey(), getSupabaseCredentials()]).then(
      ([key, buildProvided, credentials]) => {
        if (cancelled) return;
        setStored(key);
        setFromBuild(buildProvided);
        setHasCredentials(credentials !== null);
        setLoading(false);
        if (credentials) void refreshRemote();
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

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
        <h2 className="settings-screen__section-title">Models</h2>
        <ul className="settings-screen__list">
          {Object.entries(config.models).map(([kind, route]) => (
            <li key={kind} className="settings-screen__list-row">
              <span>{kind}</span>
              <span className="settings-screen__value">{route.model}</span>
            </li>
          ))}
        </ul>
        <p className="settings-screen__note">
          Per-route model selection is editable here in a later step.
        </p>
      </section>
    </div>
  );
}
