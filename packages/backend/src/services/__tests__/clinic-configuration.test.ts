import { describe, expect, it } from 'vitest';
import {
  CLINIC_CONFIGURATION_REGISTRY,
  CLINIC_CORE_MODULES,
  CLINIC_MODULE_CATALOG,
  clinicConfigurationDefinition,
  isClinicModuleKey,
} from '@healthcare/shared';
import { ValidationError } from '@healthcare/shared/errors';
import { validateConfigurationShape } from '../clinic-configuration.js';

describe('clinic configuration registry', () => {
  it('contains unique allowlisted keys with valid scopes', () => {
    const keys = CLINIC_CONFIGURATION_REGISTRY.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.startsWith('clinic.'))).toBe(true);
    expect(CLINIC_CONFIGURATION_REGISTRY.every((definition) => definition.allowedScopes.length > 0)).toBe(true);
  });

  it('keeps secrets outside the normal configuration registry', () => {
    expect(CLINIC_CONFIGURATION_REGISTRY.some((definition) => definition.secret)).toBe(false);
    expect(CLINIC_CONFIGURATION_REGISTRY.some((definition) => definition.key.includes('token'))).toBe(false);
    expect(CLINIC_CONFIGURATION_REGISTRY.some((definition) => definition.key.includes('password'))).toBe(false);
  });

  it('allows tenant-only identity and legal settings to reject narrower overrides', () => {
    expect(clinicConfigurationDefinition('clinic.profile.display_name')?.allowedScopes).toEqual(['tenant']);
    expect(clinicConfigurationDefinition('clinic.legal.tax_number')?.allowedScopes).toEqual(['tenant']);
    expect(clinicConfigurationDefinition('clinic.contact.email')?.allowedScopes).toContain('branch');
  });

  it('defines core modules separately from optional modules', () => {
    expect(CLINIC_CORE_MODULES.length).toBeGreaterThan(0);
    expect([...CLINIC_MODULE_CATALOG]).toEqual(expect.arrayContaining([...CLINIC_CORE_MODULES]));
    expect(CLINIC_CORE_MODULES).not.toContain('pharmacy');
    expect(CLINIC_MODULE_CATALOG).toContain('pharmacy');
    expect(isClinicModuleKey('appointments')).toBe(true);
    expect(isClinicModuleKey('not-a-clinic-module')).toBe(false);
  });

  it('rejects non-object configuration payloads', () => {
    expect(() => validateConfigurationShape(null)).toThrow(ValidationError);
    expect(() => validateConfigurationShape([])).toThrow(ValidationError);
    expect(() => validateConfigurationShape('clinic')).toThrow(ValidationError);
    expect(() => validateConfigurationShape({ locale: 'en' })).not.toThrow();
  });
});
