import { describe, expect, it } from 'vitest';
import { formatDocumentDate } from '../pdf.js';

describe('document configuration formatting', () => {
  it('formats dates using the configured IANA timezone', () => {
    expect(formatDocumentDate('2026-01-15T23:30:00.000Z', 'Africa/Cairo', 'en')).toContain('Jan 16, 2026');
  });

  it('falls back safely when the configured timezone is invalid', () => {
    expect(formatDocumentDate('2026-01-15T23:30:00.000Z', 'Not/AZone', 'en')).toContain('Jan 15, 2026');
  });

  it('uses Arabic formatting for an Arabic clinic locale', () => {
    expect(formatDocumentDate('2026-01-15T12:00:00.000Z', 'Africa/Cairo', 'ar')).toContain('يناير');
  });
});
