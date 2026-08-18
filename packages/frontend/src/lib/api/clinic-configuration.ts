import { apiClient } from './client';

export type ClinicConfigurationScope = 'tenant' | 'branch' | 'department';

export interface ClinicConfigurationEntry {
  key: string;
  value: unknown;
  scopeType: ClinicConfigurationScope | 'default';
  scopeId: string | null;
  version: number | null;
  definition: {
    valueType: 'string' | 'boolean' | 'number' | 'json';
    allowedScopes: ClinicConfigurationScope[];
    requiredFor: string[];
    defaultValue?: unknown;
    sensitive?: boolean;
    secret?: boolean;
    description: string;
  };
}

export interface ClinicModuleStatus {
  moduleKey: string;
  core: boolean;
  entitled: boolean;
  entitlementStatus: string | null;
  entitlementSource: string | null;
  activationStatus: 'enabled' | 'disabled' | 'setup_required' | string;
  configVersion: number | null;
  validationStatus: 'valid' | 'incomplete' | 'invalid' | string;
  validationErrors: unknown;
  activatedAt: string | null;
}

export const clinicConfigurationApi = {
  get: (scopeType: ClinicConfigurationScope = 'tenant', scopeId?: string) =>
    apiClient.get('/clinic-configuration', { params: { scopeType, scopeId } })
      .then((response) => response.data.data as { scopeType: ClinicConfigurationScope; scopeId: string; entries: ClinicConfigurationEntry[] }),
  update: (payload: {
    scopeType: ClinicConfigurationScope;
    scopeId: string;
    key: string;
    value: unknown;
    expectedVersion?: number;
  }) => apiClient.put('/clinic-configuration', payload).then((response) => response.data.data as ClinicConfigurationEntry),
  modules: () => apiClient.get('/clinic-modules').then((response) => response.data.data as ClinicModuleStatus[]),
  setModuleEnabled: (moduleKey: string, enabled: boolean) =>
    apiClient.put(`/clinic-modules/${encodeURIComponent(moduleKey)}`, { enabled })
      .then((response) => response.data.data as ClinicModuleStatus),
};
