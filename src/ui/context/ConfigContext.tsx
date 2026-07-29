import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_APP_CONFIG, mergeConfig, type AppConfig, type AppConfigOverrides } from '@/config';
import {
  withOverride,
  withoutOverride,
  type ConfigPath,
  type ConfigValue,
} from '@/config/overrides';
import { getConfigOverrides, setConfigOverrides } from '@/data/settingsRepository';

/**
 * Editing is a separate context from reading so the many components that only
 * need a value keep depending on nothing but AppConfig. Only Settings takes the
 * mutators.
 */
export interface ConfigEditor {
  /** What is persisted. An absent key means the default is in force. */
  overrides: AppConfigOverrides;
  setValue: (path: ConfigPath, value: ConfigValue) => void;
  resetValue: (path: ConfigPath) => void;
  resetAll: () => void;
}

const ConfigContext = createContext<AppConfig>(DEFAULT_APP_CONFIG);
const ConfigEditorContext = createContext<ConfigEditor | null>(null);

export interface ConfigProviderProps {
  children: ReactNode;
}

/**
 * REQ-C9: config is read once at startup into a context provider. No module
 * reads config at import time, so overriding in tests stays possible.
 *
 * Edits land in state immediately and are written behind that. A config value
 * is a preference, not a transaction — making the UI wait on IndexedDB before
 * showing a number the user just typed would be latency for nothing.
 */
export function ConfigProvider({ children }: ConfigProviderProps) {
  const [overrides, setOverrides] = useState<AppConfigOverrides>({});

  useEffect(() => {
    let cancelled = false;
    getConfigOverrides().then((stored) => {
      if (!cancelled) setOverrides(stored ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: AppConfigOverrides) => {
    setOverrides(next);
    void setConfigOverrides(next);
  }, []);

  const editor = useMemo<ConfigEditor>(
    () => ({
      overrides,
      setValue: (path, value) => persist(withOverride(overrides, path, value)),
      resetValue: (path) => persist(withoutOverride(overrides, path)),
      // Categories are not edited here (§3.4) and arrive with imports, so
      // "reset everything" must not throw away the vocabulary labelling.
      resetAll: () => persist(overrides.categories ? { categories: overrides.categories } : {}),
    }),
    [overrides, persist],
  );

  const config = useMemo(() => mergeConfig(overrides), [overrides]);

  return (
    <ConfigContext.Provider value={config}>
      <ConfigEditorContext.Provider value={editor}>{children}</ConfigEditorContext.Provider>
    </ConfigContext.Provider>
  );
}

export function useConfig(): AppConfig {
  return useContext(ConfigContext);
}

export function useConfigEditor(): ConfigEditor {
  const editor = useContext(ConfigEditorContext);
  if (!editor) throw new Error('useConfigEditor must be used inside a ConfigProvider');
  return editor;
}
