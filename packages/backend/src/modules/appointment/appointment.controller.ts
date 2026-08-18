import type { FastifyRequest, FastifyReply } from 'fastify';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { createAppointmentSchema, updateAppointmentSchema, paginationSchema } from '../../utils/validation.js';
import {
  AppointmentNotFoundError,
  PatientNotFoundError,
  SchedulingConflictError,
  StatusTransitionError,
  WorkingHoursError,
  CancellationPolicyError,
  ValidationError,
} from '@healthcare/shared/errors';
import * as repo from './appointment.repository.js';
import { mapAppointment, calculateEndTime, generateTelemedicineLink } from './appointment.mapper.js';
import { sendAppointmentConfirmation } from '../../services/reminder.service.js';
import { loadClinicNotificationContext } from '../../services/notification.js';
import { logAudit } from '../../services/audit.js';
import {
  hasPermission,
  assignedPatientIds,
  type Principal,
} from '../../services/authorization.js';
import { ForbiddenError } from '@healthcare/shared/errors';
import type { AppointmentRow } from './types.js';
import type { PermissionScope } from '@healthcare/shared/authz';

// ── #5: Valid status transitions ──
const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['checked_in', 'completed', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'completed', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

// ── #7: Default working hours (configurable per tenant in future) ──
const WORKING_HOURS = { open: '08:00', close: '17:00' };

function isWithinWorkingHours(time: string): boolean {
  return time >= WORKING_HOURS.open && time <= WORKING_HOURS.close;
}

// ── #8: Cancellation policy — >24h free, <=24h requires reason ──
/** Effective scope for appointment list/summary operations. */
async function resolveAppointmentListScope(principal: Principal): Promise<{ branchIds?: string[]; patientIds?: string[]; scope: PermissionScope }> {
  if (hasPermission(principal, 'appointments.view', 'system') || hasPermission(principal, 'appointments.view', 'tenant')) {
    return { scope: hasPermission(principal, 'appointments.view', 'system') ? 'system' : 'tenant' };
  }
  if (hasPermission(principal, 'appointments.view', 'branch') || hasPermission(principal, 'appointments.view', 'branches')) {
    return { branchIds: principal.branches, scope: principal.branches.length > 1 ? 'branches' : 'branch' };
  }
  if (hasPermission(principal, 'appointments.view', 'assigned_patients') || hasPermission(principal, 'appointments.view', 'department')) {
    return { patientIds: await assignedPatientIds(principal), scope: 'assigned_patients' };
  }
  return { patientIds: [], scope: 'self' };
}

async function assertAppointmentAccess(
  principal: Principal,
  appointment: { tenant_id: string; branch_id?: string | null; patient_id?: string | null; doctor_id?: string | null },
): Promise<void> {
  if (principal.tenantId !== appointment.tenant_id) throw new ForbiddenError('You do not have access to this appointment');
  if (hasPermission(principal, 'appointments.view', 'tenant') || hasPermission(principal, 'appointments.view', 'system')) return;
  if ((hasPermission(principal, 'appointments.view', 'branch') || hasPermission(principal, 'appointments.view', 'branches')) && appointment.branch_id) {
    if (principal.branches.includes(String(appointment.branch_id))) return;
  }
  if (hasPermission(principal, 'appointments.view', 'assigned_patients')) {
    if (appointment.doctor_id === principal.id) return;
    const ids = await assignedPatientIds(principal);
    if (appointment.patient_id && ids.includes(String(appointment.patient_id))) return;
  }
  throw new ForbiddenError('You do not have access to this appointment');
}

function getCancellationPolicy(appointmentDate: string, startTime: string): { allowed: boolean; requiresReason: boolean } {
  const appointmentStart = new Date(`${appointmentDate}T${startTime}:00`);
  const now = new Date();
  const hoursUntil = (appointmentStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil <= 0) {
    return { allowed: true, requiresReason: true };
  }
  if (hoursUntil <= 24) {
    return { allowed: true, requiresReason: true };
  }
  return { allowed: true, requiresReason: false };
}

export async function listAppointments(request: FastifyRequest, reply: FastifyReply) {
  const query = paginationSchema.parse(request.query);
  const tenantId = getTenantId(request);
  const { date, status, doctorId, patientId, branchId } = request.query as Record<string, string | undefined>;
  const { userId, principal } = getCtx(request);
  const scope = await resolveAppointmentListScope(principal);

  const { appointments, total } = await repo.findAppointments(tenantId, {
    date, status, doctorId, patientId, branchId,
    branchIds: scope.branchIds,
    patientIds: scope.patientIds,
    principal,
    scope: scope.scope,
    sort: query.sort, order: query.order,
    limit: query.limit, offset: (query.page - 1) * query.limit,
  });

  try {
    await logAudit({ tenantId, userId, action: 'appointment.list', entityType: 'appointment' });
  } catch { /* audit failure should not block */ }

  return sendPaginated(reply, appointments.map(mapAppointment), total, query.page, query.limit);
}

export async function getAppointment(request: FastifyRequest, reply: FastifyReply) {
  const { appointmentId } = request.params as { appointmentId: string };
  const tenantId = getTenantId(request);
  const { userId, principal } = getCtx(request);

  const appointment = await repo.findAppointmentById(appointmentId, tenantId);
  if (!appointment) throw new AppointmentNotFoundError(appointmentId);
  await assertAppointmentAccess(principal, appointment);

  try {
    await logAudit({ tenantId, userId, action: 'appointment.view', entityType: 'appointment', entityId: appointmentId });
  } catch { /* audit failure should not block */ }

  return sendSuccess(reply, mapAppointment(appointment));
}

export async function createAppointment(request: FastifyRequest, reply: FastifyReply) {
  const body = createAppointmentSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  // Validate patient exists
  const patient = await repo.findPatientForAppointment(body.patientId, tenantId);
  if (!patient) throw new PatientNotFoundError(body.patientId);

  // Validate doctor and branch exist in this clinic (avoids phantom appointments)
  const doctor = await repo.findUserForDoctorValidation(body.doctorId, tenantId);
  if (!doctor) throw new ValidationError('Doctor not found in this clinic');
  const branch = await repo.findBranchForTenant(body.branchId, tenantId);
  if (!branch) throw new ValidationError('Branch not found in this clinic');

  const { principal } = getCtx(request);
  if (hasPermission(principal, 'appointments.create', 'branch') && !principal.branches.includes(body.branchId)) {
    throw new ForbiddenError('You can only create appointments in your assigned branches');
  }

  // ── #7: Working hours validation ──
  if (!isWithinWorkingHours(body.startTime)) {
    throw new WorkingHoursError(body.startTime, WORKING_HOURS.open, WORKING_HOURS.close);
  }

  // ── #4: Scheduling conflict detection ──
  const overlap = await repo.findOverlappingAppointment(
    tenantId, body.doctorId, body.appointmentDate, body.startTime, body.duration,
  );
  if (overlap) {
    throw new SchedulingConflictError(body.doctorId, body.appointmentDate, body.startTime);
  }

  const endTime = calculateEndTime(body.startTime, body.duration);
  const appointment = await repo.insertAppointment({
    tenant_id: tenantId,
    patient_id: body.patientId,
    doctor_id: body.doctorId,
    branch_id: body.branchId,
    appointment_date: body.appointmentDate,
    start_time: body.startTime,
    end_time: endTime,
    duration: body.duration,
    type: body.type,
    reason: body.reason || null,
    notes: body.notes || null,
    is_walk_in: body.isWalkIn,
    is_virtual: body.isVirtual,
    telemedicine_link: body.isVirtual ? generateTelemedicineLink() : null,
    status: 'scheduled',
    timezone: body.timezone || (await loadClinicNotificationContext(
      tenantId,
      body.branchId ? { scopeType: 'branch', scopeId: body.branchId } : undefined,
    )).timezone,
    created_by: userId,
  });

  // ── #11: Wire reminder service — send confirmation ──
  try {
    const doctorDisplayName = doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : 'Dr.';
    await sendAppointmentConfirmation({
      tenantId,
      appointmentId: appointment.id,
      patientId: body.patientId,
      patientName: `${patient.first_name} ${patient.last_name}`,
      patientPhone: patient.phone || '',
      patientEmail: patient.email || undefined,
      doctorName: doctorDisplayName,
      appointmentTime: `${body.appointmentDate} ${body.startTime}`,
    });
  } catch {
    // Reminder failure should not block appointment creation
  }

  // ── Audit logging ──
  try {
    await logAudit({
      tenantId,
      userId,
      action: 'appointment.created',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: {
        patientId: body.patientId,
        doctorId: body.doctorId,
        date: body.appointmentDate,
        time: body.startTime,
        type: body.type,
      },
    });
  } catch {
    // Audit failure should not block appointment creation
  }

  return sendSuccess(reply, mapAppointment(appointment), 'Appointment created successfully', 201);
}

export async function updateAppointment(request: FastifyRequest, reply: FastifyReply) {
  const { appointmentId } = request.params as { appointmentId: string };
  const body = updateAppointmentSchema.parse(request.body);
  const tenantId = getTenantId(request);

  const existing = await repo.findAppointmentById(appointmentId, tenantId);
  if (!existing) throw new AppointmentNotFoundError(appointmentId);
  await assertAppointmentAccess(getCtx(request).principal, existing);

  // ── #5: Status transition validation ──
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw new StatusTransitionError(existing.status, 'update');
  }

  const updateData: Record<string, unknown> = { updated_at: new Date() };

  if (body.doctorId) {
    const newDoctor = await repo.findUserForDoctorValidation(body.doctorId, tenantId);
    if (!newDoctor) throw new ValidationError('Doctor not found in this clinic');
    updateData.doctor_id = body.doctorId;
  }

  if (body.appointmentDate) updateData.appointment_date = body.appointmentDate;

  if (body.startTime) {
    // ── #7: Working hours validation ──
    if (!isWithinWorkingHours(body.startTime)) {
      throw new WorkingHoursError(body.startTime, WORKING_HOURS.open, WORKING_HOURS.close);
    }
    updateData.start_time = body.startTime;
  }

  if (body.duration) updateData.duration = body.duration;

  // Keep end_time consistent whenever start time or duration changes
  const effectiveStart = body.startTime || existing.start_time;
  const effectiveDuration = body.duration || existing.duration;
  if (body.startTime || body.duration) {
    updateData.end_time = calculateEndTime(effectiveStart, effectiveDuration);
  }

  // ── #4: Check for scheduling conflict when schedule-relevant fields change ──
  if (body.appointmentDate || body.startTime || body.duration || body.doctorId) {
    const conflictDate = body.appointmentDate || existing.appointment_date;
    const conflictDoctor = body.doctorId || existing.doctor_id;
    const overlap = await repo.findOverlappingAppointment(
      tenantId, conflictDoctor, conflictDate, effectiveStart, effectiveDuration, appointmentId,
    );
    if (overlap) {
      throw new SchedulingConflictError(conflictDoctor, conflictDate, effectiveStart);
    }
  }

  if (body.type) updateData.type = body.type;
  if (body.reason !== undefined) updateData.reason = body.reason;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.timezone) updateData.timezone = body.timezone;
  if (body.isVirtual !== undefined) {
    updateData.is_virtual = body.isVirtual;
    if (body.isVirtual && !existing.telemedicine_link) {
      updateData.telemedicine_link = generateTelemedicineLink();
    }
  }

  const updated = await repo.updateAppointmentById(appointmentId, tenantId, updateData);

  // ── Audit logging ──
  const { userId } = getCtx(request);
  try {
    await logAudit({
      tenantId,
      userId,
      action: 'appointment.updated',
      entityType: 'appointment',
      entityId: appointmentId,
      metadata: { changes: Object.keys(updateData).filter(k => k !== 'updated_at') },
    });
  } catch {
    // Audit failure should not block
  }

  return sendSuccess(reply, mapAppointment(updated!), 'Appointment updated successfully');
}

export async function checkInAppointment(request: FastifyRequest, reply: FastifyReply) {
  const { appointmentId } = request.params as { appointmentId: string };
  const tenantId = getTenantId(request);

  const existing = await repo.findAppointmentById(appointmentId, tenantId);
  if (!existing) throw new AppointmentNotFoundError(appointmentId);
  await assertAppointmentAccess(getCtx(request).principal, existing);

  // ── #5: Status transition validation ──
  if (!VALID_TRANSITIONS[existing.status]?.includes('checked_in')) {
    throw new StatusTransitionError(existing.status, 'checked_in');
  }

  const updated = await repo.updateAppointmentById(appointmentId, tenantId, {
    status: 'checked_in', check_in_time: new Date().toISOString(), updated_at: new Date(),
  });

  const { userId } = getCtx(request);
  try {
    await logAudit({ tenantId, userId, action: 'appointment.checked_in', entityType: 'appointment', entityId: appointmentId });
  } catch { /* ignore */ }

  return sendSuccess(reply, mapAppointment(updated!), 'Patient checked in');
}

export async function completeAppointment(request: FastifyRequest, reply: FastifyReply) {
  const { appointmentId } = request.params as { appointmentId: string };
  const tenantId = getTenantId(request);

  const existing = await repo.findAppointmentById(appointmentId, tenantId);
  if (!existing) throw new AppointmentNotFoundError(appointmentId);
  await assertAppointmentAccess(getCtx(request).principal, existing);

  // ── #5: Status transition validation ──
  if (!VALID_TRANSITIONS[existing.status]?.includes('completed')) {
    throw new StatusTransitionError(existing.status, 'completed');
  }

  const updated = await repo.updateAppointmentById(appointmentId, tenantId, {
    status: 'completed', check_out_time: new Date().toISOString(), updated_at: new Date(),
  });

  const { userId } = getCtx(request);
  try {
    await logAudit({ tenantId, userId, action: 'appointment.completed', entityType: 'appointment', entityId: appointmentId });
  } catch { /* ignore */ }

  return sendSuccess(reply, mapAppointment(updated!), 'Appointment completed');
}

export async function cancelAppointment(request: FastifyRequest, reply: FastifyReply) {
  const { appointmentId } = request.params as { appointmentId: string };
  const tenantId = getTenantId(request);
  const { reason } = request.body as { reason?: string };

  const existing = await repo.findAppointmentById(appointmentId, tenantId);
  if (!existing) throw new AppointmentNotFoundError(appointmentId);
  await assertAppointmentAccess(getCtx(request).principal, existing);

  // ── #5: Status transition validation ──
  if (!VALID_TRANSITIONS[existing.status]?.includes('cancelled')) {
    throw new StatusTransitionError(existing.status, 'cancelled');
  }

  // ── #8: Cancellation policy ──
  const policy = getCancellationPolicy(existing.appointment_date, existing.start_time);
  if (policy.requiresReason && !reason) {
    throw new CancellationPolicyError(
      'Cancellation within 24 hours of appointment requires a reason',
    );
  }

  const updated = await repo.updateAppointmentById(appointmentId, tenantId, {
    status: 'cancelled', cancelled_at: new Date().toISOString(),
    cancel_reason: reason || null, updated_at: new Date(),
  });

  const { userId } = getCtx(request);
  try {
    await logAudit({
      tenantId, userId,
      action: 'appointment.cancelled',
      entityType: 'appointment',
      entityId: appointmentId,
      metadata: { reason: reason || null, within24h: policy.requiresReason },
    });
  } catch { /* ignore */ }

  return sendSuccess(reply, mapAppointment(updated!), 'Appointment cancelled');
}

export async function todaySummary(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId, principal } = getCtx(request);
  const today = new Date().toISOString().split('T')[0];
  const scope = await resolveAppointmentListScope(principal);

  const appointments = await repo.findTodayAppointments(tenantId, today, scope.branchIds, principal, scope.scope);

  try {
    await logAudit({ tenantId, userId, action: 'appointment.today_summary', entityType: 'appointment' });
  } catch { /* audit failure should not block */ }

  const counts = {
    total: appointments.length,
    scheduled: appointments.filter((a: AppointmentRow) => a.status === 'scheduled' || a.status === 'confirmed').length,
    checkedIn: appointments.filter((a: AppointmentRow) => a.status === 'checked_in').length,
    inProgress: appointments.filter((a: AppointmentRow) => a.status === 'in_progress').length,
    completed: appointments.filter((a: AppointmentRow) => a.status === 'completed').length,
    cancelled: appointments.filter((a: AppointmentRow) => a.status === 'cancelled').length,
    noShow: appointments.filter((a: AppointmentRow) => a.status === 'no_show').length,
  };

  return sendSuccess(reply, { counts, appointments: appointments.map(mapAppointment) });
}

// ── #15: Bulk operations ──
export async function bulkCreateAppointments(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const { appointments: appointmentsData } = request.body as {
    appointments: Array<{
      patientId: string;
      doctorId: string;
      branchId: string;
      appointmentDate: string;
      startTime: string;
      duration: number;
      type: string;
      reason?: string;
      notes?: string;
      isWalkIn?: boolean;
      isVirtual?: boolean;
    }>;
  };

  if (!Array.isArray(appointmentsData) || appointmentsData.length === 0) {
    throw new ValidationError('appointments array is required and must not be empty');
  }

  if (appointmentsData.length > 50) {
    throw new ValidationError('Maximum 50 appointments per bulk operation');
  }

  const created: AppointmentRow[] = [];
  const conflicts: string[] = [];

  for (const apt of appointmentsData) {
    // Validate patient
    const patient = await repo.findPatientForAppointment(apt.patientId, tenantId);
    if (!patient) {
      conflicts.push(`Patient ${apt.patientId} not found`);
      continue;
    }

    // Validate doctor and branch
    const doctor = await repo.findUserForDoctorValidation(apt.doctorId, tenantId);
    if (!doctor) {
      conflicts.push(`Doctor ${apt.doctorId} not found`);
      continue;
    }
    const branch = await repo.findBranchForTenant(apt.branchId, tenantId);
    if (!branch) {
      conflicts.push(`Branch ${apt.branchId} not found`);
      continue;
    }

    // Working hours
    if (!isWithinWorkingHours(apt.startTime)) {
      conflicts.push(`${apt.startTime} outside working hours for patient ${apt.patientId}`);
      continue;
    }

    // Overlap check
    const overlap = await repo.findOverlappingAppointment(
      tenantId, apt.doctorId, apt.appointmentDate, apt.startTime, apt.duration,
    );
    if (overlap) {
      conflicts.push(`Scheduling conflict for doctor ${apt.doctorId} at ${apt.appointmentDate} ${apt.startTime}`);
      continue;
    }

    const endTime = calculateEndTime(apt.startTime, apt.duration);
    const inserted = await repo.insertAppointment({
      tenant_id: tenantId,
      patient_id: apt.patientId,
      doctor_id: apt.doctorId,
      branch_id: apt.branchId,
      appointment_date: apt.appointmentDate,
      start_time: apt.startTime,
      end_time: endTime,
      duration: apt.duration,
      type: apt.type,
      reason: apt.reason || null,
      notes: apt.notes || null,
      is_walk_in: apt.isWalkIn || false,
      is_virtual: apt.isVirtual || false,
      telemedicine_link: apt.isVirtual ? generateTelemedicineLink() : null,
      status: 'scheduled',
      timezone: (await loadClinicNotificationContext(
        tenantId,
        apt.branchId ? { scopeType: 'branch', scopeId: apt.branchId } : undefined,
      )).timezone,
      created_by: userId,
    });
    created.push(inserted);
  }

  try {
    await logAudit({
      tenantId, userId,
      action: 'appointment.bulk_created',
      entityType: 'appointment',
      metadata: { count: created.length, conflicts: conflicts.length },
    });
  } catch { /* ignore */ }

  return sendSuccess(reply, {
    created: created.map(mapAppointment),
    conflicts,
    total: created.length,
  }, 'Bulk appointment creation completed', 201);
}

export async function bulkCancelAppointments(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId, principal } = getCtx(request);
  const { appointmentIds, reason } = request.body as {
    appointmentIds: string[];
    reason?: string;
  };

  if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
    throw new ValidationError('appointmentIds array is required');
  }

  const scope = await resolveAppointmentListScope(principal);
  const cancelled = await repo.bulkCancelAppointments(tenantId, appointmentIds, reason || 'Bulk cancellation', { ...scope, principal, permissionScope: scope.scope });

  try {
    await logAudit({
      tenantId, userId,
      action: 'appointment.bulk_cancelled',
      entityType: 'appointment',
      metadata: { count: cancelled, reason: reason || null },
    });
  } catch { /* ignore */ }

  return sendSuccess(reply, { cancelled }, `${cancelled} appointments cancelled`);
}
