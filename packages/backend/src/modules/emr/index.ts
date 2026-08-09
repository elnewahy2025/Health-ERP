import { getCtx, getTenantId } from "../../utils/route-helper.js";
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { createEmrSchema, paginationSchema } from '../../utils/validation.js';
import { PatientNotFoundError, ForbiddenError } from '@healthcare/shared/errors';
import { calculateBMI } from '@healthcare/shared/utils';
import { authenticate } from '../auth-guard.js';
import { authorize, hasPermission, assignedPatientIds, canAccessPatient, type Principal } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import type { EmrRecordRow } from '../types.js';

export async function registerEmrModule(app: FastifyInstance) {
  /** Scope for EMR lists: tenant-wide, branch-wide, or assigned patients. */
  async function resolveEmrListScope(principal: Principal): Promise<{ branchIds?: string[]; patientIds?: string[] }> {
    if (hasPermission(principal, 'emr.view', 'system') || hasPermission(principal, 'emr.view', 'tenant')) return {};
    if (hasPermission(principal, 'emr.view', 'branch') || hasPermission(principal, 'emr.view', 'branches')) {
      return { branchIds: principal.branches };
    }
    if (hasPermission(principal, 'emr.view', 'assigned_patients') || hasPermission(principal, 'emr.view', 'department')) {
      return { patientIds: await assignedPatientIds(principal) };
    }
    return { patientIds: [] };
  }

  async function assertEmrAccess(principal: Principal, record: { tenant_id: string; patient_id: string; doctor_id?: string | null; branch_id?: string | null }): Promise<void> {
    if (principal.tenantId !== record.tenant_id) throw new ForbiddenError('You do not have access to this EMR record');
    if (hasPermission(principal, 'emr.view', 'tenant') || hasPermission(principal, 'emr.view', 'system')) return;
    if ((hasPermission(principal, 'emr.view', 'branch') || hasPermission(principal, 'emr.view', 'branches')) && record.branch_id) {
      if (principal.branches.includes(String(record.branch_id))) return;
    }
    if (hasPermission(principal, 'emr.view', 'assigned_patients') || hasPermission(principal, 'emr.view', 'department')) {
      if (record.doctor_id === principal.id) return;
      const ids = await assignedPatientIds(principal);
      if (ids.includes(record.patient_id)) return;
    }
    throw new ForbiddenError('You do not have access to this EMR record');
  }

  // List EMR records
  app.get('/api/v1/emr', {
    preHandler: [authenticate, authorize('emr.view')],
  }, async (request, reply) => {
    const query = paginationSchema.parse(request.query);
    const tenantId = getTenantId(request);
    const { patientId, doctorId, status } = request.query as { doctorId?: string; patientId?: string; status?: string };
    const { principal } = getCtx(request);
    const scope = await resolveEmrListScope(principal);

    let queryBuilder = db('emr_records')
      .join('patients', 'emr_records.patient_id', 'patients.id')
      .where('emr_records.tenant_id', tenantId)
      .whereNull('emr_records.deleted_at');

    if (scope.branchIds && scope.branchIds.length > 0) queryBuilder = queryBuilder.whereIn('patients.branch_id', scope.branchIds);
    if (scope.branchIds && scope.branchIds.length === 0) queryBuilder = queryBuilder.where(db.raw('false'));
    if (scope.patientIds && scope.patientIds.length > 0) queryBuilder = queryBuilder.whereIn('emr_records.patient_id', scope.patientIds);
    if (scope.patientIds && scope.patientIds.length === 0) queryBuilder = queryBuilder.where(db.raw('false'));
    if (patientId) queryBuilder = queryBuilder.andWhere('emr_records.patient_id', patientId);
    if (doctorId) queryBuilder = queryBuilder.andWhere('emr_records.doctor_id', doctorId);
    if (status) queryBuilder = queryBuilder.andWhere('emr_records.status', status);

    const total = await queryBuilder.clone().count('emr_records.id as count').first();
    const records = await queryBuilder
      .select(
        'emr_records.*',
        'patients.first_name as patient_first_name',
        'patients.last_name as patient_last_name',
        'patients.medical_record_number',
      )
      .orderBy('emr_records.encounter_date', query.order || 'desc')
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const mapped = records.map(mapEmr);
    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'emr.list', entityType: 'emr_record' }); } catch {}
    return sendPaginated(reply, mapped, Number(total?.count || 0), query.page, query.limit);
  });

  // Get single EMR record
  app.get('/api/v1/emr/:emrId', {
    preHandler: [authenticate, authorize('emr.view')],
  }, async (request, reply) => {
    const { emrId } = request.params as { emrId: string };
    const tenantId = getTenantId(request);

    const record = await db('emr_records')
      .join('patients', 'emr_records.patient_id', 'patients.id')
      .where('emr_records.id', emrId)
      .where('emr_records.tenant_id', tenantId)
      .select(
        'emr_records.*',
        'patients.first_name as patient_first_name',
        'patients.last_name as patient_last_name',
        'patients.medical_record_number',
        'patients.date_of_birth as patient_dob',
        'patients.gender as patient_gender',
        'patients.branch_id as patient_branch_id',
      )
      .first();

    if (!record) {
      return reply.status(404).send({ success: false, error: 'EMR record not found' });
    }
    await assertEmrAccess(getCtx(request).principal, {
      tenant_id: record.tenant_id,
      patient_id: record.patient_id,
      doctor_id: record.doctor_id,
      branch_id: record.patient_branch_id,
    });

    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'emr.view', entityType: 'emr_record', entityId: emrId }); } catch {}
    return sendSuccess(reply, mapEmr(record));
  });

  // Create EMR record
  app.post('/api/v1/emr', {
    preHandler: [authenticate, authorize('emr.create')],
  }, async (request, reply) => {
    const body = createEmrSchema.parse(request.body);
    const tenantId = getTenantId(request); const userId = getCtx(request).userId;

    const patient = await db('patients')
      .where({ id: body.patientId, tenant_id: tenantId })
      .first();
    if (!patient) throw new PatientNotFoundError(body.patientId);

    let vitalsData = null;
    let bmiValue = null;
    if (body.vitals) {
      bmiValue = calculateBMI(body.vitals.weight, body.vitals.height);
      vitalsData = JSON.stringify({ ...body.vitals, bmi: bmiValue });
    }

    const [record] = await db('emr_records').insert({
      tenant_id: tenantId,
      patient_id: body.patientId,
      appointment_id: body.appointmentId || null,
      doctor_id: userId,
      encounter_date: body.encounterDate || new Date().toISOString().split('T')[0],
      encounter_type: body.encounterType,
      chief_complaint: body.chiefComplaint || null,
      subjective: body.subjective || null,
      objective: body.objective || null,
      assessment: body.assessment || null,
      plan: body.plan || null,
      vitals: vitalsData,
      notes: body.notes || null,
      status: 'draft',
      created_by: userId,
    }).returning('*');

    // If linked to appointment, mark appointment as in_progress
    if (body.appointmentId) {
      await db('appointments')
        .where({ id: body.appointmentId, tenant_id: tenantId })
        .update({ status: 'in_progress', updated_at: new Date() });
    }

    try { await logAudit({ tenantId, userId, action: 'emr.created', entityType: 'emr_record', entityId: record.id,
      metadata: { patientId: body.patientId, encounterType: body.encounterType } }); } catch {}
    return sendSuccess(reply, mapEmr(record), 'EMR record created', 201);
  });

  // Update EMR record
  app.put('/api/v1/emr/:emrId', {
    preHandler: [authenticate, authorize('emr.edit')],
  }, async (request, reply) => {
    const { emrId } = request.params as { emrId: string };
    const tenantId = getTenantId(request);
    const body = request.body as Record<string, unknown>;

    const existing = await db('emr_records')
      .where({ id: emrId, tenant_id: tenantId })
      .first();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'EMR record not found' });
    }
    await assertEmrAccess(getCtx(request).principal, existing);

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (body.subjective !== undefined) updateData.subjective = body.subjective;
    if (body.objective !== undefined) updateData.objective = body.objective;
    if (body.assessment !== undefined) updateData.assessment = body.assessment;
    if (body.plan !== undefined) updateData.plan = body.plan;
    if (body.chiefComplaint !== undefined) updateData.chief_complaint = body.chiefComplaint;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.vitals) {
      const bmi = calculateBMI(Number((body.vitals as Record<string, unknown>).weight), Number((body.vitals as Record<string, unknown>).height));
      updateData.vitals = JSON.stringify({ ...body.vitals, bmi });
    }
    if (body.diagnosis !== undefined) updateData.diagnosis = JSON.stringify(body.diagnosis);
    if (body.medications !== undefined) updateData.medications = JSON.stringify(body.medications);
    if (body.procedures !== undefined) updateData.procedures = JSON.stringify(body.procedures);

    const [updated] = await db('emr_records')
      .where({ id: emrId, tenant_id: tenantId })
      .update(updateData)
      .returning('*');

    // If marking as completed and linked to appointment
    if (body.status === 'completed' && existing.appointment_id) {
      await db('appointments')
        .where({ id: existing.appointment_id })
        .update({ status: 'completed', check_out_time: new Date().toISOString(), updated_at: new Date() });
    }

    return sendSuccess(reply, mapEmr(updated), 'EMR record updated');
  });

  // Sign EMR record
  app.post('/api/v1/emr/:emrId/sign', {
    preHandler: [authenticate, authorize('emr.approve')],
  }, async (request, reply) => {
    const { emrId } = request.params as { emrId: string };
    const tenantId = getTenantId(request);

    const existing = await db('emr_records')
      .where({ id: emrId, tenant_id: tenantId })
      .first();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'EMR record not found' });
    }
    await assertEmrAccess(getCtx(request).principal, existing);

    const [record] = await db('emr_records')
      .where({ id: emrId, tenant_id: tenantId })
      .update({ status: 'signed', updated_at: new Date() })
      .returning('*');

    const { userId: signUserId } = getCtx(request);
    try { await logAudit({ tenantId, userId: signUserId, action: 'emr.signed', entityType: 'emr_record', entityId: emrId }); } catch {}
    return sendSuccess(reply, mapEmr(record), 'EMR record signed');
  });

  // Add diagnosis to EMR
  app.post('/api/v1/emr/:emrId/diagnosis', {
    preHandler: [authenticate, authorize('emr.edit')],
  }, async (request, reply) => {
    const { emrId } = request.params as { emrId: string };
    const body = z.object({
      code: z.string(),
      name: z.string(),
      type: z.enum(['primary', 'secondary', 'complication']),
      notes: z.string().optional(),
    }).parse(request.body);

    const tenantId = getTenantId(request);
    const existing = await db('emr_records')
      .where({ id: emrId, tenant_id: tenantId })
      .first();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'EMR record not found' });
    }

    const currentDiagnosis = existing.diagnosis
      ? (typeof existing.diagnosis === 'string' ? JSON.parse(existing.diagnosis) : existing.diagnosis)
      : [];
    currentDiagnosis.push(body);

    await db('emr_records')
      .where({ id: emrId, tenant_id: tenantId })
      .update({
        diagnosis: JSON.stringify(currentDiagnosis),
        updated_at: new Date(),
      });

    const { userId: diagUserId } = getCtx(request);
    try { await logAudit({ tenantId, userId: diagUserId, action: 'emr.diagnosis_added', entityType: 'emr_record', entityId: emrId,
      metadata: { code: body.code, type: body.type } }); } catch {}
    return sendSuccess(reply, currentDiagnosis, 'Diagnosis added');
  });

  // Prescribe medication
  app.post('/api/v1/emr/:emrId/medications', {
    preHandler: [authenticate, authorize('emr.edit')],
  }, async (request, reply) => {
    const { emrId } = request.params as { emrId: string };
    const body = z.object({
      drugName: z.string().min(1),
      dosage: z.string().min(1),
      route: z.string().min(1),
      frequency: z.string().min(1),
      duration: z.string().min(1),
      quantity: z.number().positive(),
      refills: z.number().int().min(0).default(0),
      instructions: z.string().optional(),
    }).parse(request.body);

    const tenantId = getTenantId(request);
    const existing = await db('emr_records')
      .where({ id: emrId, tenant_id: tenantId })
      .first();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'EMR record not found' });
    }

    const currentMeds = existing.medications
      ? (typeof existing.medications === 'string' ? JSON.parse(existing.medications) : existing.medications)
      : [];
    currentMeds.push({ ...body, prescribedAt: new Date().toISOString() });

    await db('emr_records')
      .where({ id: emrId, tenant_id: tenantId })
      .update({
        medications: JSON.stringify(currentMeds),
        updated_at: new Date(),
      });

    const { userId: medUserId } = getCtx(request);
    try { await logAudit({ tenantId, userId: medUserId, action: 'emr.medication_prescribed', entityType: 'emr_record', entityId: emrId,
      metadata: { drugName: body.drugName, dosage: body.dosage } }); } catch {}
    return sendSuccess(reply, currentMeds, 'Medication prescribed');
  });

  // Get patient EMR history
  app.get('/api/v1/patients/:patientId/emr', {
    preHandler: [authenticate, authorize('emr.view')],
  }, async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    const tenantId = getTenantId(request);
    const query = paginationSchema.parse(request.query);
    const { principal } = getCtx(request);

    const patient = await db('patients').where({ id: patientId, tenant_id: tenantId }).first();
    if (!patient) throw new PatientNotFoundError(patientId);
    if (!(await canAccessPatient(principal, patient))) {
      throw new ForbiddenError('You do not have access to this patient');
    }

    const records = await db('emr_records')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .orderBy('encounter_date', query.order || 'desc')
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const total = await db('emr_records')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .count('id as count')
      .first();

    const { userId: histUserId } = getCtx(request);
    try { await logAudit({ tenantId, userId: histUserId, action: 'emr.patient_history', entityType: 'emr_record', entityId: patientId }); } catch {}
    return sendPaginated(reply, records.map(mapEmr), Number(total?.count || 0), query.page, query.limit);
  });
}

function mapEmr(r: EmrRecordRow) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    patientId: r.patient_id,
    appointmentId: r.appointment_id,
    doctorId: r.doctor_id,
    encounterDate: r.encounter_date,
    encounterType: r.encounter_type,
    chiefComplaint: r.chief_complaint,
    subjective: r.subjective,
    objective: r.objective,
    assessment: r.assessment,
    plan: r.plan,
    diagnosis: r.diagnosis ? (typeof r.diagnosis === 'string' ? JSON.parse(r.diagnosis) : r.diagnosis) : [],
    procedures: r.procedures ? (typeof r.procedures === 'string' ? JSON.parse(r.procedures) : r.procedures) : [],
    medications: r.medications ? (typeof r.medications === 'string' ? JSON.parse(r.medications) : r.medications) : [],
    labOrders: r.lab_orders || [],
    radiologyOrders: r.radiology_orders || [],
    vitals: r.vitals ? (typeof r.vitals === 'string' ? JSON.parse(r.vitals) : r.vitals) : undefined,
    notes: r.notes,
    status: r.status,
    patientName: r.patient_first_name && r.patient_last_name ? `${r.patient_first_name} ${r.patient_last_name}` : undefined,
    patientMrn: r.medical_record_number,
    patientDob: (r as unknown as Record<string, unknown>).patient_dob,
    patientGender: (r as unknown as Record<string, unknown>).patient_gender,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
