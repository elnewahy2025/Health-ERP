import { describe, expect, it } from 'vitest';
import { isValidNationalId, isValidPhone } from '../lib/validators';

describe('generic clinic validators', () => {
  it('accepts local and international phone formats', () => {
    expect(isValidPhone('01012345678')).toBe(true);
    expect(isValidPhone('+201012345678')).toBe(true);
    expect(isValidPhone('001012345678')).toBe(true);
  });

  it('rejects malformed phone values', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('clinic-phone')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });

  it('accepts national and clinic-issued identifiers without country assumptions', () => {
    expect(isValidNationalId('AB-1234')).toBe(true);
    expect(isValidNationalId('رقم-1234')).toBe(true);
    expect(isValidNationalId('29201010101234')).toBe(true);
  });

  it('rejects identifiers that are too short, too long, or contain unsupported symbols', () => {
    expect(isValidNationalId('123')).toBe(false);
    expect(isValidNationalId('123456789012345678901234567890123')).toBe(false);
    expect(isValidNationalId('ID/1234')).toBe(false);
  });
});
