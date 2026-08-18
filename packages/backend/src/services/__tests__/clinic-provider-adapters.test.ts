import { describe, expect, it } from 'vitest';
import { getClinicProviderAdapter } from '../clinic-provider-adapters.js';
import { CLINIC_PROVIDER_CONTRACTS, getClinicProviderCapability } from '../clinic-provider-contracts.js';

describe('Clinic provider structural adapters', () => {
  it('requires all ETA configuration and signing credentials', () => {
    const adapter = getClinicProviderAdapter('eta');
    expect(adapter).not.toBeNull();
    const result = adapter!.validate({
      tenantId: 'tenant-1',
      providerKey: 'eta',
      environment: 'sandbox',
      status: 'configured',
      validationMode: 'structural',
      liveValidationEnabled: false,
      validationTimeoutMs: 5000,
      config: { taxRegistrationNumber: 'TRN' },
      secrets: { clientId: 'client-plaintext-value' },
    });
    expect(result.status).toBe('setup_required');
    expect(result.missing).toEqual(expect.arrayContaining(['config:invoiceSeries', 'config:activityCode', 'secret:clientSecret', 'secret:signingKey']));
    expect(JSON.stringify(result)).not.toContain('client-plaintext-value');
  });

  it('validates Fawry protocol currency as a provider field without applying a clinic default', () => {
    const adapter = getClinicProviderAdapter('fawry');
    expect(adapter).not.toBeNull();
    const invalid = adapter!.validate({
      tenantId: 'tenant-1',
      providerKey: 'fawry',
      environment: 'sandbox',
      status: 'configured',
      validationMode: 'structural',
      liveValidationEnabled: false,
      validationTimeoutMs: 5000,
      config: { merchantCode: 'merchant', merchantReferencePrefix: 'INV', currencyCode: 'EGP_TOO_LONG' },
      secrets: { secureKey: 'secret-value' },
    });
    expect(invalid.status).toBe('invalid');
    expect(invalid.code).toBe('fawry_configuration_invalid');
    expect(JSON.stringify(invalid)).not.toContain('secret-value');
  });

  it('accepts Twilio with one sender option and does not require optional legacy fields', () => {
    const adapter = getClinicProviderAdapter('twilio');
    expect(adapter).not.toBeNull();
    const result = adapter!.validate({
      tenantId: 'tenant-1',
      providerKey: 'twilio',
      environment: 'production',
      status: 'configured',
      validationMode: 'structural',
      liveValidationEnabled: false,
      validationTimeoutMs: 5000,
      config: {},
      secrets: { account_sid: 'AC123', auth_token: 'token', voice_number: '+10000000000' },
    });
    expect(result.status).toBe('ready');
    expect(result.missing).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('AC123');
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('exposes versioned capability states without claiming vendor authentication', () => {
    for (const providerKey of ['eta', 'fawry', 'stripe', 'twilio']) {
      const contract = CLINIC_PROVIDER_CONTRACTS[providerKey];
      expect(contract.contractVersion).toBeGreaterThan(0);
      expect(contract.supportedTestModes).toEqual(expect.arrayContaining(['structural', 'live']));
      expect(getClinicProviderCapability(providerKey, 'structural_validation')?.status).toBe('implemented');
      expect(getClinicProviderCapability(providerKey, 'endpoint_reachability')?.status).toBe('implemented');
      expect(getClinicProviderCapability(providerKey, 'vendor_authentication')?.status).toBe('not_verified');
    }
  });

  it('returns a safe unsupported result for an unregistered adapter key', async () => {
    const moduleSource = await import('../clinic-provider-adapters.js');
    expect(moduleSource.getClinicProviderAdapter('unknown-provider')).toBeNull();
  });
});
