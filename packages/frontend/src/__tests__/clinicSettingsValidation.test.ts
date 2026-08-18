import { describe, expect, it } from 'vitest';
import {
  isSupportedClinicLocale,
  isValidClinicTimezone,
} from '../lib/clinic-settings-validation';

describe('clinic settings validation', () => {
  it('accepts valid IANA timezone identifiers and UTC', () => {
    expect(isValidClinicTimezone('Africa/Cairo')).toBe(true);
    expect(isValidClinicTimezone('Europe/London')).toBe(true);
    expect(isValidClinicTimezone('UTC')).toBe(true);
  });

  it('rejects invalid timezone identifiers while allowing an incomplete blank value', () => {
    expect(isValidClinicTimezone('')).toBe(true);
    expect(isValidClinicTimezone('not-a-timezone')).toBe(false);
  });

  it('accepts only the supported clinic locales', () => {
    expect(isSupportedClinicLocale('en')).toBe(true);
    expect(isSupportedClinicLocale(' ar ')).toBe(true);
    expect(isSupportedClinicLocale('fr')).toBe(false);
    expect(isSupportedClinicLocale('')).toBe(false);
  });
});
