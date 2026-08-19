import { describe, expect, it } from 'vitest';
import { nextAutomationRun, validateAutomationAction, validateAutomationConditions, validateAutomationTriggerConfig } from '../automation-service.js';

describe('automation-service validation', () => {
  it('calculates the next cron occurrence in the configured timezone', () => {
    expect(nextAutomationRun('*/15 * * * *', 'UTC', new Date('2026-08-19T12:01:00.000Z')).toISOString()).toBe('2026-08-19T12:15:00.000Z');
    expect(nextAutomationRun('0 9 * * *', 'Africa/Cairo', new Date('2026-08-19T06:00:00.000Z')).getTime()).toBeGreaterThan(new Date('2026-08-19T06:00:00.000Z').getTime());
  });

  it('rejects invalid cron expressions and timezones', () => {
    expect(() => validateAutomationTriggerConfig('schedule', null, { cron: 'not-a-cron', timezone: 'UTC' })).toThrow();
    expect(() => validateAutomationTriggerConfig('schedule', null, { cron: '*/5 * * * *', timezone: 'Not/AZone' })).toThrow();
    expect(() => validateAutomationTriggerConfig('event', null, {})).toThrow();
  });

  it('allows only tenant-safe notification actions with an explicit recipient source', () => {
    expect(validateAutomationAction('send_email', { templateKey: 'invoice.paid', recipientPath: 'patient.email', variables: {} })).toMatchObject({ channel: 'email', templateKey: 'invoice.paid', recipientPath: 'patient.email' });
    expect(validateAutomationAction('send_sms', { templateKey: 'appointment.reminder', recipient: '+201000000000' })).toMatchObject({ channel: 'sms' });
    expect(() => validateAutomationAction('api_call', { url: 'https://example.test' })).toThrow();
    expect(() => validateAutomationAction('send_notification', { templateKey: 'invoice.paid', recipient: 'a@example.test' })).toThrow();
    expect(() => validateAutomationAction('send_email', { templateKey: 'invoice.paid', recipientPath: 'patient.email', recipient: 'a@example.test' })).toThrow();
  });

  it('validates deterministic conditions and rejects arbitrary predicate shapes', () => {
    expect(validateAutomationConditions([{ path: 'invoice.status', operator: 'equals', value: 'paid' }])).toHaveLength(1);
    expect(validateAutomationConditions([])).toEqual([]);
    expect(() => validateAutomationConditions([{ path: 'invoice.status', operator: 'contains', value: 'paid' }])).toThrow();
    expect(() => validateAutomationConditions([{ path: 'invoice status', operator: 'exists' }])).toThrow();
  });
});
