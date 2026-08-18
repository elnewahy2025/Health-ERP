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
  email: string;
  timezone: string;
  locale: string;
  currency: string;
}

export interface ClinicModuleVisibility {
  moduleKey: string;
  core: boolean;
  active: boolean;
}

export interface RegionalProfile {
  tenantId: string;
  countryCode: string | null;
  profileKey: string;
  status: string;
  nationalIdentifierPolicy: string;
  phonePolicy: string;
  taxProfileKey: string | null;
  metadata: Record<string, unknown>;
  version: number;
  configuredAt: string | null;
}

export interface ClinicProviderSecretMetadata {
  configured: boolean;
  lastFour: string | null;
  version: number | null;
  rotatedAt: string | null;
  expiresAt: string | null;
}

export interface ClinicProviderConfiguration {
  providerKey: string;
  moduleKey: string;
  displayName: string;
  jurisdictionCode: string | null;
  configKeys: string[];
  moduleConfiguration: {
    moduleKey: string;
    config: Record<string, unknown>;
    version: number;
    validationStatus: string;
    validationErrors: string[];
  } | null;
  connection: {
    id: string;
    displayName: string | null;
    environment: 'sandbox' | 'production';
    status: string;
    config: Record<string, unknown>;
    version: number;
    lastTestStatus: string;
    lastTestedAt: string | null;
    lastErrorCode: string | null;
    enabledAt: string | null;
  } | null;
  secrets: Record<string, ClinicProviderSecretMetadata>;
  readiness: {
    status: 'setup_required' | 'ready' | 'disabled' | 'invalid' | 'connection_failed' | string;
    missing: string[];
    errors: string[];
  };
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
  remove: (payload: {
    scopeType: Exclude<ClinicConfigurationScope, 'tenant'>;
    scopeId: string;
    key: string;
    expectedVersion?: number;
  }) => apiClient.delete('/clinic-configuration', { data: payload })
    .then((response) => response.data.data as { reset: boolean; effective: ClinicConfigurationEntry | null }),
  modules: () => apiClient.get('/clinic-modules').then((response) => response.data.data as ClinicModuleStatus[]),
  readiness: () => apiClient.get('/clinic-configuration/readiness')
    .then((response) => response.data.data as { tenantId: string; modules: ClinicModuleReadiness[] }),
  setModuleEnabled: (moduleKey: string, enabled: boolean) =>
    apiClient.put(`/clinic-modules/${encodeURIComponent(moduleKey)}`, { enabled })
      .then((response) => response.data.data as ClinicModuleStatus),
  regionalProfile: () => apiClient.get('/clinic-regional-profile')
    .then((response) => response.data.data as RegionalProfile),
  updateRegionalProfile: (payload: Partial<Omit<RegionalProfile, 'tenantId' | 'version' | 'configuredAt'>> & { expectedVersion?: number }) =>
    apiClient.put('/clinic-regional-profile', payload)
      .then((response) => response.data.data as RegionalProfile),
  providers: () => apiClient.get('/clinic-providers')
    .then((response) => response.data.data as ClinicProviderConfiguration[]),
  updateProvider: (providerKey: string, payload: {
    displayName?: string | null;
    environment?: 'sandbox' | 'production';
    config: Record<string, unknown>;
    expectedVersion?: number;
    expectedModuleVersion?: number;
  }) => apiClient.put(`/clinic-providers/${encodeURIComponent(providerKey)}`, payload)
    .then((response) => response.data.data as ClinicProviderConfiguration),
  testProvider: (providerKey: string) => apiClient.post(`/clinic-providers/${encodeURIComponent(providerKey)}/test`)
    .then((response) => response.data.data as ClinicProviderConfiguration),
  updateProviderSecret: (providerKey: string, secretKey: string, value: string, expectedVersion?: number) =>
    apiClient.put(`/clinic-providers/${encodeURIComponent(providerKey)}/secrets/${encodeURIComponent(secretKey)}`, { value, expectedVersion })
      .then((response) => response.data.data as ClinicProviderConfiguration),
  revokeProviderSecret: (providerKey: string, secretKey: string, expectedVersion?: number) =>
    apiClient.delete(`/clinic-providers/${encodeURIComponent(providerKey)}/secrets/${encodeURIComponent(secretKey)}`, { data: { expectedVersion } })
      .then((response) => response.data.data as ClinicProviderConfiguration),
};
