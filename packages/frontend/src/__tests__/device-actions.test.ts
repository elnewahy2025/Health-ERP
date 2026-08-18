import { describe, expect, it } from 'vitest';
import { buildPhoneDeviceLink, buildWhatsAppDeviceLink, normalizeDevicePhone } from '../lib/device-actions';

describe('device communication actions', () => {
  it('normalizes phone numbers and builds a phone-app link', () => {
    expect(normalizeDevicePhone('00 20 (10) 1234-5678')).toBe('+201012345678');
    expect(buildPhoneDeviceLink('00 20 (10) 1234-5678')).toBe('tel:%2B201012345678');
  });

  it('builds a WhatsApp deep link with encoded message text', () => {
    expect(buildWhatsAppDeviceLink('+201012345678', 'Hello clinic')).toBe(
      'whatsapp://send?phone=201012345678&text=Hello%20clinic',
    );
  });
});
