import type { Knex } from 'knex';

/**
 * System notification templates used by the appointment reminder service
 * (sendNotification looks templates up by `code` + `channel`). Idempotent:
 * existing rows are never duplicated.
 */
export async function up(knex: Knex): Promise<void> {
  const templates = [
    { code: 'appointment_reminder', channel: 'email', subject: 'Appointment Reminder', body: 'Dear {{patientName}}, this is a reminder for your appointment with Dr. {{doctorName}} on {{appointmentTime}}. Please arrive 10 minutes early. {{clinicPhone}}' },
    { code: 'appointment_reminder_sms', channel: 'sms', subject: '', body: '{{message}}' },
    { code: 'appointment_confirmation', channel: 'email', subject: 'Appointment Confirmed', body: 'Dear {{patientName}}, your appointment with Dr. {{doctorName}} is confirmed for {{appointmentTime}}. Location: {{clinicAddress}}. Phone: {{clinicPhone}}' },
    { code: 'appointment_confirmation_sms', channel: 'sms', subject: '', body: '{{message}}' },
    { code: 'appointment_reminder_manual', channel: 'sms', subject: '', body: 'Reminder: {{patientName}}, you have an appointment on {{date}} at {{time}}. {{clinicName}}' },
    { code: 'appointment_reminder_manual', channel: 'email', subject: 'Appointment Reminder', body: 'Dear {{patientName}}, you have an appointment on {{date}} at {{time}}. {{clinicName}}' },
    { code: 'appointment_reminder_24h', channel: 'sms', subject: '', body: 'Reminder: {{patientName}}, appointment with {{doctorName}} on {{date}} at {{time}} (in ~24 hours). {{clinicName}}' },
    { code: 'appointment_reminder_24h', channel: 'email', subject: 'Appointment Reminder (24h)', body: 'Dear {{patientName}}, your appointment with {{doctorName}} is tomorrow ({{date}}) at {{time}}. {{clinicName}}' },
    { code: 'appointment_reminder_3h', channel: 'sms', subject: '', body: 'Reminder: {{patientName}}, appointment with {{doctorName}} today at {{time}} (in ~3 hours). {{clinicName}}' },
    { code: 'appointment_reminder_3h', channel: 'email', subject: 'Appointment Reminder (3h)', body: 'Dear {{patientName}}, your appointment with {{doctorName}} is today at {{time}}. {{clinicName}}' },
  ];

  for (const t of templates) {
    const existing = await knex('notification_templates')
      .where({ code: t.code, channel: t.channel, tenant_id: null })
      .first();
    if (existing) continue;
    await knex('notification_templates').insert({
      code: t.code,
      name: t.code,
      channel: t.channel,
      subject: t.subject || null,
      body_template: t.body,
      is_active: true,
      tenant_id: null,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const codes = [
    'appointment_reminder', 'appointment_reminder_sms',
    'appointment_confirmation', 'appointment_confirmation_sms',
    'appointment_reminder_manual', 'appointment_reminder_24h', 'appointment_reminder_3h',
  ];
  await knex('notification_templates').whereIn('code', codes).whereNull('tenant_id').del();
}
