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

export interface ClinicModuleReadiness {
  moduleKey: string;
  core: boolean;
  entitled: boolean;
  activationStatus: string;
  validationStatus: string;
  missingRequiredKeys: string[];
}

export interface ClinicShellIdentity {
  displayName: string;
  logoUrl: string;
  timezone: string;
  locale: string;
  currency: string;
}

export interface ClinicModuleVisibility {
  moduleKey: string;
  core: boolean;
  active: boolean;
}

export const clinicConfigurationApi = {
  identity: () => apiClient.get('/clinic-configuration/identity')
    .then((response) => response.data.data as ClinicShellIdentity),
  visibility: () => apiClient.get('/clinic-modules/visibility')
    .then((response) => response.data.data as ClinicModuleVisibility[]),
  scopes: () => apiClient.get('/clinic-configuration/scopes')
    .then((response) => response.data.data as { branches: Array<{ id: string; name: string; code?: string }>; departments: Array<{ id: string; name: string; code?: string }> }),
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
  readiness: () => apiClient.get('/clinic-configuration/readiness')
    .then((response) => response.data.data as { tenantId: string; modules: ClinicModuleReadiness[] }),
  setModuleEnabled: (moduleKey: string, enabled: boolean) =>
    apiClient.put(`/clinic-modules/${encodeURIComponent(moduleKey)}`, { enabled })
      .then((response) => response.data.data as ClinicModuleStatus),
};
