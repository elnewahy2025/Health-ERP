import { db } from '../../core/database.js';
import type { AppointmentRow } from './types.js';

export async function findAppointments(tenantId: string, filters: {
  date?: string;
  status?: string;
  doctorId?: string;
  patientId?: string;
  branchId?: string;
  sort?: string;
  order?: string;
  limit: number;
  offset: number;
}): Promise<{ appointments: AppointmentRow[]; total: number }> {
  let query = db('appointments')
    .join('patients', 'appointments.patient_id', 'patients.id')
    .join('users', 'appointments.doctor_id', 'users.id')
    .where('appointments.tenant_id', tenantId)
    .whereNull('appointments.deleted_at');

  if (filters.date) query = query.andWhere('appointments.appointment_date', filters.date);
  if (filters.status) query = query.andWhere('appointments.status', filters.status);
  if (filters.doctorId) query = query.andWhere('appointments.doctor_id', filters.doctorId);
  if (filters.patientId) query = query.andWhere('appointments.patient_id', filters.patientId);
  if (filters.branchId) query = query.andWhere('appointments.branch_id', filters.branchId);

  const total = await query.clone().count('appointments.id as count').first();
  const appointments = await query
    .select(
      'appointments.*',
      'patients.first_name as patient_first_name',
      'patients.last_name as patient_last_name',
      'patients.medical_record_number',
      'users.first_name as doctor_first_name',
      'users.last_name as doctor_last_name',
    )
    .orderBy('appointments.appointment_date', filters.order || 'desc')
    .orderBy('appointments.start_time', 'asc')
    .limit(filters.limit)
    .offset(filters.offset);

  return { appointments, total: Number(total?.count || 0) };
}

export async function findAppointmentById(appointmentId: string, tenantId: string): Promise<AppointmentRow | undefined> {
  return db('appointments')
    .join('patients', 'appointments.patient_id', 'patients.id')
    .join('users', 'appointments.doctor_id', 'users.id')
    .where('appointments.id', appointmentId)
    .where('appointments.tenant_id', tenantId)
    .select(
      'appointments.*',
      'patients.first_name as patient_first_name',
      'patients.last_name as patient_last_name',
      'patients.medical_record_number',
      'patients.date_of_birth as patient_dob',
      'patients.gender as patient_gender',
      'patients.phone as patient_phone',
      'users.first_name as doctor_first_name',
      'users.last_name as doctor_last_name',
    )
    .first();
}

export async function findTodayAppointments(tenantId: string, today: string): Promise<AppointmentRow[]> {
  return db('appointments')
    .join('patients', 'appointments.patient_id', 'patients.id')
    .join('users', 'appointments.doctor_id', 'users.id')
    .where('appointments.tenant_id', tenantId)
    .where('appointments.appointment_date', today)
    .whereNull('appointments.deleted_at')
    .select(
      'appointments.*',
      'patients.first_name as patient_first_name',
      'patients.last_name as patient_last_name',
      'patients.medical_record_number',
      'users.first_name as doctor_first_name',
      'users.last_name as doctor_last_name',
    )
    .orderBy('appointments.start_time', 'asc');
}

export async function findPatientForAppointment(patientId: string, tenantId: string) {
  return db('patients').where({ id: patientId, tenant_id: tenantId }).first();
}

export async function findBranchForTenant(branchId: string, tenantId: string) {
  return db('branches')
    .where({ id: branchId, tenant_id: tenantId, status: 'active' })
    .first();
}

export async function insertAppointment(data: Record<string, unknown>): Promise<AppointmentRow> {
  const [appointment] = await db('appointments').insert(data).returning('*');
  return appointment;
}

export async function updateAppointmentById(
  appointmentId: string,
  tenantId: string,
  updateData: Record<string, unknown>,
): Promise<AppointmentRow | undefined> {
  const [updated] = await db('appointments')
    .where({ id: appointmentId, tenant_id: tenantId })
    .update(updateData)
    .returning('*');
  return updated;
}

export async function findOverlappingAppointment(
  tenantId: string,
  doctorId: string,
  appointmentDate: string,
  startTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string,
): Promise<AppointmentRow | undefined> {
  // Calculate end time from start + duration
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const endMinutes = String(totalMinutes % 60).padStart(2, '0');
  const endTime = `${endHours}:${endMinutes}`;

  let query = db('appointments')
    .where('appointments.tenant_id', tenantId)
    .where('appointments.doctor_id', doctorId)
    .where('appointments.appointment_date', appointmentDate)
    .whereNotIn('appointments.status', ['cancelled', 'no_show'])
    .where(function () {
      // Overlap condition: existing.start < new.end AND existing.end > new.start
      this.where('appointments.start_time', '<', endTime)
        .andWhere('appointments.end_time', '>', startTime);
    });

  if (excludeAppointmentId) {
    query = query.whereNot('appointments.id', excludeAppointmentId);
  }

  return query.first();
}

export async function findUserForDoctorValidation(
  userId: string,
  tenantId: string,
): Promise<{ id: string; status: string; role_id: string | null; first_name: string; last_name: string } | undefined> {
  return db('users')
    .where({ id: userId, tenant_id: tenantId })
    .select('id', 'status', 'role_id', 'first_name', 'last_name')
    .first();
}

export async function bulkCreateAppointments(
  tenantId: string,
  appointments: Record<string, unknown>[],
): Promise<AppointmentRow[]> {
  const results = await db('appointments').insert(appointments).returning('*');
  return results;
}

export async function bulkCancelAppointments(
  tenantId: string,
  appointmentIds: string[],
  cancelReason: string,
): Promise<number> {
  return db('appointments')
    .where('tenant_id', tenantId)
    .whereIn('id', appointmentIds)
    .whereIn('status', ['scheduled', 'confirmed'])
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: cancelReason,
      updated_at: new Date(),
    });
}
