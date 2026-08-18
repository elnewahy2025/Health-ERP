import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clinicConfigurationApi,
  type ClinicModuleVisibility,
  type ClinicShellIdentity,
} from '../lib/api';

interface ClinicConfigurationContextValue {
  identity: ClinicShellIdentity | null;
  modules: ClinicModuleVisibility[];
  modulesReady: boolean;
  refresh: () => Promise<void>;
}

const ClinicConfigurationContext = createContext<ClinicConfigurationContextValue>({
  identity: null,
  modules: [],
  modulesReady: false,
  refresh: async () => undefined,
});

export function ClinicConfigurationProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<ClinicShellIdentity | null>(null);
  const [modules, setModules] = useState<ClinicModuleVisibility[]>([]);
  const [modulesReady, setModulesReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextIdentity, nextModules] = await Promise.all([
        clinicConfigurationApi.identity(),
        clinicConfigurationApi.visibility(),
      ]);
      setIdentity(nextIdentity);
      setModules(nextModules);
      setModulesReady(true);
    } catch {
      // The shell keeps the existing tenant/auth branding and permission-only
      // navigation until configuration reads are available.
      setModulesReady(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ClinicConfigurationContext.Provider value={{ identity, modules, modulesReady, refresh }}>
      {children}
    </ClinicConfigurationContext.Provider>
  );
}

export function useClinicConfiguration(): ClinicConfigurationContextValue {
  return useContext(ClinicConfigurationContext);
}

export function formatClinicDate(
  value: Date | string | number,
  locale: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone || 'UTC' }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}
