import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_APP_CONFIG, mergeConfig, type AppConfig } from '@/config';
import { getConfigOverrides } from '@/data/settingsRepository';

const ConfigContext = createContext<AppConfig>(DEFAULT_APP_CONFIG);

export interface ConfigProviderProps {
  children: ReactNode;
}

/**
 * REQ-C9: config is read once at startup into a context provider. No module
 * reads config at import time, so overriding in tests stays possible.
 */
export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);

  useEffect(() => {
    let cancelled = false;
    getConfigOverrides().then((overrides) => {
      if (!cancelled) setConfig(mergeConfig(overrides));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useConfig(): AppConfig {
  return useContext(ConfigContext);
}
