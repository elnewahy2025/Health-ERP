import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLINIC_PROVIDER_DEFINITIONS,
  redactProviderSecretMetadata,
} from '../clinic-provider-configuration.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(testDirectory, '../../..');

function source(relativePath: string): string {
  return readFileSync(resolve(backendRoot, relativePath), 'utf8');
}

describe('Clinic provider configuration foundation', () => {
  it('returns only safe metadata for a provider secret', () => {
    const metadata = redactProviderSecretMetadata({
      is_active: true,
      last_four: '6789',
      secret_version: 3,
      rotated_at: '2026-08-19T00:00:00.000Z',
      expires_at: null,
      encrypted_value: 'must-never-leave-the-server',
      value_hash: 'internal-hash',
    } as never);

    expect(metadata).toEqual({
      configured: true,
      lastFour: '6789',
      version: 3,
      rotatedAt: '2026-08-19T00:00:00.000Z',
      expiresAt: null,
    });
    expect(JSON.stringify(metadata)).not.toContain('must-never-leave-the-server');
    expect(JSON.stringify(metadata)).not.toContain('internal-hash');
    expect(metadata).not.toHaveProperty('encryptedValue');
    expect(metadata).not.toHaveProperty('valueHash');
  });

  it('keeps the supported provider catalog explicit and non-secret', () => {
    expect(CLINIC_PROVIDER_DEFINITIONS.map((item) => item.providerKey)).toEqual(['eta', 'fawry', 'stripe', 'twilio']);
    for (const provider of CLINIC_PROVIDER_DEFINITIONS) {
      expect(provider.providerKey === 'twilio' || provider.configKeys.length > 0).toBe(true);
      expect(provider.secretKeys.length).toBeGreaterThan(0);
      expect(provider).not.toHaveProperty('secretValue');
      expect(provider).not.toHaveProperty('encryptedValue');
    }
  });

  it('keeps the required provider routes behind settings permissions', () => {
    const routes = source('src/modules/clinic-settings/index.ts');
    expect(routes).toContain("app.get('/api/v1/clinic-providers'");
    expect(routes).toContain("app.put('/api/v1/clinic-providers/:providerKey'");
    expect(routes).toContain("app.post('/api/v1/clinic-providers/:providerKey/test'");
    expect(routes).toContain("app.put('/api/v1/clinic-providers/:providerKey/secrets/:secretKey'");
    expect(routes).toContain("app.delete('/api/v1/clinic-providers/:providerKey/secrets/:secretKey'");
    expect(routes).toContain("authorize('settings.view')");
    expect(routes).toContain("authorize('settings.manage')");
  });

  it('keeps migration 053 forward-safe and non-destructive on rollback', () => {
    const migration = source('migrations/053_modular_clinic_settings.ts');
    expect(migration).toContain("hasTable('tenant_regional_profiles')");
    expect(migration).toContain("hasTable('tenant_module_configurations')");
    expect(migration).toContain("hasTable('tenant_provider_connections')");
    expect(migration).toContain("hasColumn('clinic_integration_secrets', column)");
    expect(migration).toContain("insert({ tenant_id: tenant.id })");
    expect(migration).not.toContain("dropTableIfExists('tenant_regional_profiles')");
    expect(migration).not.toContain("dropTableIfExists('tenant_module_configurations')");
    expect(migration).not.toContain("dropTableIfExists('tenant_provider_connections')");
  });
});
