import { describe, expect, it } from 'vitest';
import { formatClinicDate, formatClinicMoney } from '../stores/clinicConfigurationStore';

describe('clinic configuration formatting', () => {
  it('formats dates in the configured clinic timezone', () => {
    const formatted = formatClinicDate(
      '2026-01-01T23:30:00.000Z',
      'en-US',
      'Africa/Cairo',
      { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false },
    );
    expect(formatted).toContain('01/02/2026');
  });

  it('falls back safely when a stored timezone is invalid', () => {
    expect(() => formatClinicDate('2026-01-01T00:00:00.000Z', 'en-US', 'invalid/timezone')).not.toThrow();
  });

  it('formats money using the configured ISO currency', () => {
    const formatted = formatClinicMoney(1234.5, 'USD', 'en');
    expect(formatted).toContain('USD');
    expect(formatted).toContain('1,234.50');
  });

  it('uses Arabic formatting and safely falls back for invalid currencies', () => {
    expect(formatClinicMoney(10, 'EUR', 'ar')).toContain('EUR');
    expect(formatClinicMoney(10, 'INVALID', 'en')).toContain('EGP');
  });
});
