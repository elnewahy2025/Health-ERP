import { describe, expect, it } from 'vitest';
import {
  buildPhoneDeviceLink,
  buildWhatsAppDeviceLink,
  confirmAndOpenDeviceLink,
  normalizeDevicePhone,
} from '../lib/device-actions';

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

  it('does not open a link when the user cancels confirmation', () => {
    const originalConfirm = window.confirm;
    const opened: string[] = [];
    window.confirm = () => false;
    expect(confirmAndOpenDeviceLink('tel:%2B201012345678', 'Confirm?', (link) => opened.push(link))).toBe(false);
    expect(opened).toEqual([]);
    window.confirm = originalConfirm;
  });

  it('opens exactly the confirmed link without invoking an API', () => {
    const originalConfirm = window.confirm;
    const opened: string[] = [];
    window.confirm = () => true;
    expect(confirmAndOpenDeviceLink('whatsapp://send?phone=201012345678', 'Confirm?', (link) => opened.push(link))).toBe(true);
    expect(opened).toEqual(['whatsapp://send?phone=201012345678']);
    window.confirm = originalConfirm;
  });
});
