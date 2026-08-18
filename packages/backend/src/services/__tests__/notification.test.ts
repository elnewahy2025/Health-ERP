import { describe, expect, it, vi } from 'vitest';

const { tenantQuery, dbMock, listEffectiveClinicConfigurationMock } = vi.hoisted(() => {
  const tenantQuery = {
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    first: vi.fn(),
  };
  return {
    tenantQuery,
    dbMock: vi.fn(() => tenantQuery),
    listEffectiveClinicConfigurationMock: vi.fn(),
  };
});

vi.mock('../../core/database.js', () => ({ db: dbMock }));
vi.mock('../clinic-configuration.js', () => ({
  listEffectiveClinicConfiguration: listEffectiveClinicConfigurationMock,
}));

import {
  formatNotificationDate,
  loadClinicNotificationContext,
} from '../notification.js';

describe('clinic-aware notification formatting', () => {
  it('formats appointment dates using the configured timezone', () => {
    expect(formatNotificationDate('2026-01-15T23:30:00.000Z', 'Africa/Cairo', 'en'))
      .toContain('Friday, January 16, 2026');
  });

  it('uses Arabic formatting for an Arabic clinic locale', () => {
    expect(formatNotificationDate('2026-01-15T12:00:00.000Z', 'Africa/Cairo', 'ar'))
      .toContain('يناير');
  });

  it('falls back safely for invalid timezone values', () => {
    expect(formatNotificationDate('2026-01-15T23:30:00.000Z', 'Not/AZone', 'en'))
      .toContain('Thursday, January 15, 2026');
  });

  it('loads tenant and branch-effective clinic communication values', async () => {
    tenantQuery.first.mockResolvedValue({ name: 'Tenant fallback name' });
    listEffectiveClinicConfigurationMock.mockResolvedValue([
      { key: 'clinic.profile.display_name', value: 'Configured Clinic' },
      { key: 'clinic.contact.email', value: 'hello@example.test' },
      { key: 'clinic.contact.land_phone', value: '+201000000000' },
      { key: 'clinic.address.street', value: '1 Main Street' },
      { key: 'clinic.address.city', value: 'Cairo' },
      { key: 'clinic.address.country', value: 'Egypt' },
      { key: 'clinic.timezone.default', value: 'Africa/Cairo' },
      { key: 'clinic.locale.default', value: 'ar' },
    ]);

    const context = await loadClinicNotificationContext('tenant-1', {
      scopeType: 'branch',
      scopeId: 'branch-1',
    });

    expect(listEffectiveClinicConfigurationMock).toHaveBeenCalledWith('tenant-1', {
      scopeType: 'branch',
      scopeId: 'branch-1',
    });
    expect(context).toEqual({
      displayName: 'Configured Clinic',
      email: 'hello@example.test',
      phone: '+201000000000',
      address: '1 Main Street, Cairo, Egypt',
      timezone: 'Africa/Cairo',
      locale: 'ar',
    });
  });
});
