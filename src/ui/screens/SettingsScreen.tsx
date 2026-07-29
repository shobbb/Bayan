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

  useEffect(() => {
    let cancelled = false;
    Promise.all([getApiKey(), isUsingBuildTimeKey()]).then(([key, buildProvided]) => {
      if (cancelled) return;
      setStored(key);
      setFromBuild(buildProvided);
      setLoading(false);
    });
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
