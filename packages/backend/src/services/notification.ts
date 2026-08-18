import { db } from '../core/database.js';
import { sendEmail } from './email.js';
import { sendSms } from './sms.js';
import { listEffectiveClinicConfiguration } from './clinic-configuration.js';
import type { ClinicConfigurationScopeRef } from './clinic-configuration.js';

export interface ClinicNotificationContext {
  displayName: string;
  email: string;
  phone: string;
  address: string;
  timezone: string;
  locale: string;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function formatNotificationDate(value: string | Date, timezone: string, locale = 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const safeTimezone = isValidTimeZone(timezone) ? timezone : 'UTC';
  const safeLocale = locale.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-EG';
  return new Intl.DateTimeFormat(safeLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: safeTimezone,
  }).format(date);
}

export async function loadClinicNotificationContext(
  tenantId: string,
  scope: ClinicConfigurationScopeRef = { scopeType: 'tenant', scopeId: tenantId },
): Promise<ClinicNotificationContext> {
  const [tenant, entries] = await Promise.all([
    db('tenants').where({ id: tenantId }).select('name').first(),
    listEffectiveClinicConfiguration(tenantId, scope),
  ]);
  const values = new Map(entries.map((entry) => [entry.key, entry.value]));
  const text = (key: string): string => {
    const value = values.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  const locale = text('clinic.locale.default') || 'en';
  const timezone = text('clinic.timezone.default') || 'UTC';
  const address = [
    text('clinic.address.street'),
    text('clinic.address.city'),
    text('clinic.address.country'),
  ].filter(Boolean).join(', ');
  return {
    displayName: text('clinic.profile.display_name') || tenant?.name || '',
    email: text('clinic.contact.email'),
    phone: text('clinic.contact.land_phone') || text('clinic.contact.whatsapp_phone'),
    address,
    timezone,
    locale,
  };
}

interface NotificationData {
  tenantId: string;
  userId?: string;
  channel: 'email' | 'sms';
  recipient: string;
  templateKey: string;
  variables: Record<string, string>;
  locale?: string;
}

export async function sendNotification(data: NotificationData): Promise<boolean> {
  try {
    // Get template. The table stores templates by `code` (one row per language);
    // tenant-specific overrides take precedence over system (tenant_id null).
    const template = await db('notification_templates')
      .where({ code: data.templateKey, channel: data.channel, is_active: true })
      .andWhere(function () {
        this.whereNull('tenant_id').orWhere('tenant_id', data.tenantId);
      })
      .orderBy('tenant_id', 'asc') // tenant-specific overrides global
      .first();

    if (!template) {
      console.warn(`No template found: ${data.templateKey}/${data.channel}/${data.locale}`);
      return false;
    }

    // Replace variables
    let subject = template.subject || '';
    let body = template.body_template;
    for (const [key, value] of Object.entries(data.variables)) {
      subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Send
    let sent = false;
    if (data.channel === 'email') {
      sent = await sendEmail({ to: data.recipient, subject, html: body.replace(/\n/g, '<br/>') });
    } else {
      sent = await sendSms({ to: data.recipient, message: body });
    }

    // Log
    await db('notification_logs').insert({
      tenant_id: data.tenantId,
      user_id: data.userId || null,
      channel: data.channel,
      recipient: data.recipient,
      template_key: data.templateKey,
      subject: subject || null,
      body,
      status: sent ? 'sent' : 'failed',
      error_message: sent ? null : 'Send failed',
      sent_at: sent ? new Date() : null,
    });

    return sent;
  } catch (error: any) {
    console.error('✗ Notification failed:', error.message);
    
    // Log failure
    await db('notification_logs').insert({
      tenant_id: data.tenantId,
      user_id: data.userId || null,
      channel: data.channel,
      recipient: data.recipient,
      template_key: data.templateKey,
      status: 'failed',
      error_message: error.message,
    });
    
    return false;
  }
}
