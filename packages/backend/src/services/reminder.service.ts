import { db } from '../core/database.js';
import {
  sendNotification,
  loadClinicNotificationContext,
  formatNotificationDate,
} from './notification.js';
import { sendEmail } from './email.js';
import { sendSms } from './sms.js';
import { logAudit } from './audit.js';

// ============================================
// Interfaces
// ============================================

interface ReminderConfig {
  tenantId: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  doctorName: string;
  appointmentTime: string;
  clinicAddress?: string;
  clinicPhone?: string;
  branchId?: string;
  clinicContext?: Awaited<ReturnType<typeof loadClinicNotificationContext>>;
}

interface CronConfig {
  reminderMinutesBefore: number;
  sendEmail: boolean;
  sendSms: boolean;
  sendWhatsApp: boolean;
  enabled: boolean;
}

// ============================================
// Cron State
// ============================================

let reminderInterval: ReturnType<typeof setInterval> | null = null;
let cronInterval: ReturnType<typeof setInterval> | null = null;

const DEFAULT_CRON_CONFIG: CronConfig = {
  reminderMinutesBefore: 60,
  sendEmail: true,
  sendSms: true,
  sendWhatsApp: false,
  enabled: true,
};

// ============================================
// Core Reminder Sending
// ============================================

export async function sendAppointmentReminder(config: ReminderConfig): Promise<boolean> {
  const { tenantId, patientName, doctorName, appointmentTime } = config;
  const clinic = config.clinicContext || await loadClinicNotificationContext(
    tenantId,
    config.branchId ? { scopeType: 'branch', scopeId: config.branchId } : undefined,
  );
  const clinicName = clinic.displayName || 'Clinic';
  const clinicPhone = config.clinicPhone || clinic.phone;
  const clinicAddress = config.clinicAddress || clinic.address;

  if (config.patientEmail) {
    await sendNotification({
      tenantId,
      channel: 'email',
      recipient: config.patientEmail,
      templateKey: 'appointment_reminder',
      variables: {
        patientName,
        doctorName,
        appointmentTime,
        clinicName,
        clinicAddress,
        clinicPhone,
        clinicEmail: clinic.email,
      },
      locale: clinic.locale,
    }).catch(() => {});
  }

  if (config.patientPhone) {
    const smsBody = `${clinicName}: Hi ${patientName}, this is a reminder for your appointment with Dr. ${doctorName} on ${appointmentTime}. Please arrive 10 minutes early. For cancellation, call ${clinicPhone || clinicName}.`;
    await sendNotification({
      tenantId,
      channel: 'sms',
      recipient: config.patientPhone,
      templateKey: 'appointment_reminder_sms',
      variables: {
        patientName,
        doctorName,
        appointmentTime,
        clinicName,
        clinicPhone,
        message: smsBody,
      },
      locale: clinic.locale,
    }).catch(() => {});
  }

  return true;
}

export async function sendAppointmentConfirmation(config: ReminderConfig): Promise<boolean> {
  const { tenantId, patientName, doctorName, appointmentTime } = config;
  const clinic = config.clinicContext || await loadClinicNotificationContext(
    tenantId,
    config.branchId ? { scopeType: 'branch', scopeId: config.branchId } : undefined,
  );
  const clinicName = clinic.displayName || 'Clinic';
  const clinicPhone = config.clinicPhone || clinic.phone;
  const clinicAddress = config.clinicAddress || clinic.address;

  if (config.patientEmail) {
    await sendNotification({
      tenantId,
      channel: 'email',
      recipient: config.patientEmail,
      templateKey: 'appointment_confirmation',
      variables: {
        patientName,
        doctorName,
        appointmentTime,
        clinicName,
        clinicAddress,
        clinicPhone,
        clinicEmail: clinic.email,
      },
      locale: clinic.locale,
    }).catch(() => {});
  }

  if (config.patientPhone) {
    await sendNotification({
      tenantId,
      channel: 'sms',
      recipient: config.patientPhone,
      templateKey: 'appointment_confirmation_sms',
      variables: {
        patientName,
        doctorName,
        appointmentTime,
        clinicName,
        clinicPhone,
        message: `${clinicName}: Your appointment with Dr. ${doctorName} is confirmed for ${appointmentTime}.`,
      },
      locale: clinic.locale,
    }).catch(() => {});
  }

  return true;
}

// ============================================
// Batch Reminder Processing
// ============================================

export async function processPendingReminders(): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const pendingReminders = await db('appointment_reminders')
    .join('appointments', 'appointment_reminders.appointment_id', 'appointments.id')
    .join('patients', 'appointments.patient_id', 'patients.id')
    .join('users', 'appointments.doctor_id', 'users.id')
    .where('appointment_reminders.status', 'pending')
    .where('appointments.status', 'scheduled')
    .where('appointments.appointment_date', '<=', tomorrow)
    .select(
      'appointment_reminders.*',
      'appointments.appointment_date',
      'appointments.branch_id',
      'patients.first_name as patient_first_name',
      'patients.last_name as patient_last_name',
      'patients.phone as patient_phone',
      'patients.email as patient_email',
      'users.first_name as doctor_first_name',
      'users.last_name as doctor_last_name',
    );

  let sent = 0;
  let failed = 0;

  for (const reminder of pendingReminders) {
    try {
      const clinicContext = await loadClinicNotificationContext(
        reminder.tenant_id,
        reminder.branch_id ? { scopeType: 'branch', scopeId: reminder.branch_id } : undefined,
      );
      const config: ReminderConfig = {
        tenantId: reminder.tenant_id,
        appointmentId: reminder.appointment_id,
        patientId: reminder.patient_id,
        patientName: `${reminder.patient_first_name} ${reminder.patient_last_name}`,
        patientPhone: reminder.patient_phone,
        patientEmail: reminder.patient_email,
        doctorName: `Dr. ${reminder.doctor_first_name} ${reminder.doctor_last_name}`,
        branchId: reminder.branch_id || undefined,
        clinicContext,
        appointmentTime: formatNotificationDate(
          reminder.appointment_date,
          clinicContext.timezone,
          clinicContext.locale,
        ),
      };

      await sendAppointmentReminder(config);
      await db('appointment_reminders').where({ id: reminder.id }).update({
        status: 'sent', sent_at: db.fn.now(),
      });
      sent++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`✗ Reminder failed for appointment ${reminder.appointment_id}:`, message);
      await db('appointment_reminders').where({ id: reminder.id }).update({
        status: 'failed', error_message: message,
      });
      failed++;
    }
  }

  if (sent > 0 || failed > 0) {
    console.log(`✓ Reminders processed: ${sent} sent, ${failed} failed`);
  }
  return { sent, failed };
}

// ============================================
// Auto-Create Reminders for New Appointments
// ============================================

export async function autoCreateReminders(appointmentId: string, tenantId: string): Promise<void> {
  const appointment = await db('appointments').where({ id: appointmentId, tenant_id: tenantId }).first();
  if (!appointment) return;

  const aptDate = new Date(appointment.appointment_date);
  const reminder24h = new Date(aptDate.getTime() - 24 * 60 * 60 * 1000);
  const reminder1h = new Date(aptDate.getTime() - 60 * 60 * 1000);

  const reminders = [
    { appointment_id: appointmentId, tenant_id: tenantId, type: '24h', scheduled_for: reminder24h },
    { appointment_id: appointmentId, tenant_id: tenantId, type: '1h', scheduled_for: reminder1h },
  ];

  for (const r of reminders) {
    await db('appointment_reminders').insert({
      ...r,
      status: 'pending',
      channel: 'both',
    }).catch(() => {});
  }
}

// ============================================
// Manual Reminder
// ============================================

export async function sendManualReminder(appointmentId: string, tenantId: string): Promise<boolean> {
  try {
    const apt = await db('appointments')
      .join('patients', 'appointments.patient_id', 'patients.id')
      .join('tenants', 'appointments.tenant_id', 'tenants.id')
      .where('appointments.id', appointmentId)
      .select('appointments.*', 'patients.first_name', 'patients.last_name', 'patients.phone', 'patients.email', 'tenants.name as clinic_name')
      .first();

    if (!apt) return false;

    const aptDate = new Date(apt.appointment_date);
    const timeStr = aptDate.toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit' });
    const dateStr = aptDate.toLocaleDateString('en-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    if (apt.phone) {
      await sendNotification({
        tenantId, channel: 'sms', recipient: apt.phone,
        templateKey: 'appointment_reminder_manual',
        variables: { patientName: `${apt.first_name} ${apt.last_name}`, date: dateStr, time: timeStr, clinicName: apt.clinic_name || 'Vision Healthcare' },
      });
    }

    if (apt.email) {
      await sendNotification({
        tenantId, channel: 'email', recipient: apt.email,
        templateKey: 'appointment_reminder_manual',
        variables: { patientName: `${apt.first_name} ${apt.last_name}`, date: dateStr, time: timeStr, clinicName: apt.clinic_name || 'Vision Healthcare' },
      });
    }

    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('✗ Manual reminder failed:', message);
    return false;
  }
}

// ============================================
// Cron-Based Reminder Service (appointment_reminders table)
// ============================================

export function startReminderCron(config?: Partial<CronConfig>): void {
  const mergedConfig = { ...DEFAULT_CRON_CONFIG, ...config };

  if (!mergedConfig.enabled) {
    console.log('✓ Appointment reminders disabled');
    return;
  }

  cronInterval = setInterval(async () => {
    try {
      await processPendingReminders();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('✗ Reminder cron error:', message);
    }
  }, 5 * 60 * 1000);

  processPendingReminders().catch(() => {});
  console.log(`✓ Appointment reminder cron started (every ${mergedConfig.reminderMinutesBefore} min before)`);
}

export function stopReminderCron(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('✓ Appointment reminder cron stopped');
  }
}

// ============================================
// Main Reminder Service (appointment_date based)
// ============================================

export function startReminderService(): void {
  reminderInterval = setInterval(async () => {
    try {
      await checkAndSendReminders();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('✗ Reminder service error:', message);
    }
  }, 5 * 60 * 1000);

  setTimeout(() => {
    checkAndSendReminders().catch(() => {});
  }, 30000);

  console.log('✓ Appointment reminder service started (checks every 5 minutes)');
}

export function stopReminderService(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

async function checkAndSendReminders(): Promise<void> {
  const upcomingAppointments = await db('appointments')
    .join('patients', 'appointments.patient_id', 'patients.id')
    .join('tenants', 'appointments.tenant_id', 'tenants.id')
    .where('appointments.status', 'scheduled')
    .whereRaw("appointments.appointment_date > NOW()")
    .whereRaw("appointments.appointment_date <= NOW() + INTERVAL '24 hours'")
    .whereRaw("COALESCE((appointments.metadata->>'reminder_sent'), 'false') != 'true'")
    .select(
      'appointments.id as appointment_id',
      'appointments.tenant_id',
      'appointments.appointment_date',
      'appointments.type',
      'appointments.reason',
      'patients.first_name',
      'patients.last_name',
      'patients.phone',
      'patients.email',
      'tenants.name as clinic_name',
      'tenants.slug as tenant_slug',
    )
    .limit(50);

  if (upcomingAppointments.length === 0) return;

  console.log(`📧 Sending ${upcomingAppointments.length} appointment reminders...`);

  let sentCount = 0;

  for (const apt of upcomingAppointments) {
    try {
      const aptDate = new Date(apt.appointment_date);
      const timeStr = aptDate.toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit' });
      const dateStr = aptDate.toLocaleDateString('en-EG', { year: 'numeric', month: 'long', day: 'numeric' });
      const hoursUntil = Math.floor((aptDate.getTime() - Date.now()) / (1000 * 60 * 60));

      let reminderType = 'appointment_reminder_24h';
      if (hoursUntil <= 3) {
        reminderType = 'appointment_reminder_3h';
      } else if (hoursUntil <= 24) {
        reminderType = 'appointment_reminder_24h';
      }

      if (apt.phone) {
        await sendNotification({
          tenantId: apt.tenant_id,
          channel: 'sms',
          recipient: apt.phone,
          templateKey: reminderType,
          variables: {
            patientName: `${apt.first_name} ${apt.last_name}`,
            doctorName: 'the doctor',
            clinicName: apt.clinic_name || 'Vision Healthcare',
            date: dateStr,
            time: timeStr,
            hoursUntil: String(hoursUntil),
            reason: apt.reason || 'follow-up',
          },
        });
        sentCount++;
      }

      if (apt.email) {
        await sendNotification({
          tenantId: apt.tenant_id,
          channel: 'email',
          recipient: apt.email,
          templateKey: reminderType,
          variables: {
            patientName: `${apt.first_name} ${apt.last_name}`,
            doctorName: 'the doctor',
            clinicName: apt.clinic_name || 'Vision Healthcare',
            date: dateStr,
            time: timeStr,
            hoursUntil: String(hoursUntil),
            reason: apt.reason || 'follow-up',
          },
        });
        sentCount++;
      }

      await db('appointments')
        .where({ id: apt.appointment_id })
        .update({
          metadata: db.raw("jsonb_set(COALESCE(metadata, '{}'), '{reminder_sent}', 'true')"),
        });

      await logAudit({
        tenantId: apt.tenant_id,
        action: 'reminder.sent',
        entityType: 'appointment',
        entityId: apt.appointment_id,
        metadata: { type: reminderType, phone: apt.phone, email: apt.email },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`✗ Reminder failed for ${apt.first_name}:`, message);
    }
  }

  if (sentCount > 0) {
    console.log(`✓ Sent ${sentCount} appointment reminders`);
  }
}

// ============================================
// Reminder Stats
// ============================================

export async function getReminderStats(tenantId: string): Promise<{
  totalRemindersSent: number;
  todayRemindersSent: number;
  upcomingAppointments: number;
}> {
  const total = await db('notification_logs')
    .where({ tenant_id: tenantId, template_key: 'appointment_reminder' })
    .count('id as count').first();
  const today = await db('notification_logs')
    .where({ tenant_id: tenantId, template_key: 'appointment_reminder' })
    .whereRaw("DATE(created_at) = CURRENT_DATE")
    .count('id as count').first();
  const upcoming = await db('appointments')
    .where({ tenant_id: tenantId, status: 'scheduled' })
    .where('appointment_date', '>', new Date().toISOString())
    .count('id as count').first();

  return {
    totalRemindersSent: Number(total?.count || 0),
    todayRemindersSent: Number(today?.count || 0),
    upcomingAppointments: Number(upcoming?.count || 0),
  };
}
