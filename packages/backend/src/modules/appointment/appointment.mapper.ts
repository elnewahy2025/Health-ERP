import { randomBytes } from 'crypto';
import type { AppointmentRow, AppointmentResponse } from './types.js';

function formatDate(value: string | Date): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value).substring(0, 10);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function mapAppointment(a: AppointmentRow): AppointmentResponse {
  return {
    id: a.id,
    tenantId: a.tenant_id,
    patientId: a.patient_id,
    doctorId: a.doctor_id,
    branchId: a.branch_id,
    appointmentDate: formatDate(a.appointment_date),
    startTime: a.start_time,
    endTime: a.end_time,
    duration: a.duration,
    type: a.type,
    status: a.status,
    reason: a.reason,
    notes: a.notes,
    isWalkIn: a.is_walk_in,
    isVirtual: a.is_virtual,
    telemedicineLink: a.telemedicine_link,
    reminderSent: a.reminder_sent,
    checkInTime: a.check_in_time,
    checkOutTime: a.check_out_time,
    cancelledAt: a.cancelled_at,
    cancelReason: a.cancel_reason,
    rescheduledFrom: a.rescheduled_from,
    timezone: a.timezone,
    patientName: a.patient_first_name && a.patient_last_name ? `${a.patient_first_name} ${a.patient_last_name}` : undefined,
    patientMrn: a.medical_record_number,
    patientDob: a.patient_dob,
    patientGender: a.patient_gender,
    patientPhone: a.patient_phone,
    doctorName: a.doctor_first_name && a.doctor_last_name ? `${a.doctor_first_name} ${a.doctor_last_name}` : undefined,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

export function generateTelemedicineLink(): string {
  const id = randomBytes(8).toString('hex');
  return `https://meet.visionhealthcare.com/${id}`;
}
