import type { FastifyRequest, FastifyReply } from 'fastify';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { createPatientSchema, updatePatientSchema, paginationSchema } from '../../utils/validation.js';
import { PatientNotFoundError } from '@healthcare/shared/errors';
import { generateMedicalRecordNumber, encryptField } from '@healthcare/shared/utils';
import { logAudit } from '../../services/audit.js';
import * as repo from './patient.repository.js';
import { mapPatient } from './patient.mapper.js';
import type { PatientRow, QuickSearchResult } from './types.js';

export async function listPatients(request: FastifyRequest, reply: FastifyReply) {
  const query = paginationSchema.parse(request.query);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const search = (request.query as Record<string, unknown>).search as string | undefined;
  const status = (request.query as Record<string, unknown>).status as string | undefined;

  const { patients, total } = await repo.findPatients(tenantId, {
    search, status, sort: query.sort, order: query.order,
    limit: query.limit, offset: (query.page - 1) * query.limit,
  });

  await logAudit({ tenantId, userId, action: 'patient.list', entityType: 'patients' });

  return sendPaginated(reply, patients.map(mapPatient), total, query.page, query.limit);
}

export async function getPatient(request: FastifyRequest, reply: FastifyReply) {
  const { patientId } = request.params as { patientId: string };
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  const data = await repo.findPatientWithRelatedData(patientId, tenantId);
  if (!data) throw new PatientNotFoundError(patientId);

  await logAudit({ tenantId, userId, action: 'patient.view', entityType: 'patients', entityId: patientId });

  return sendSuccess(reply, {
    ...mapPatient(data.patient),
    recentAppointments: data.appointments || [],
    recentEmrRecords: data.emrRecords || [],
    recentInvoices: data.invoices || [],
  });
}

export async function createPatient(request: FastifyRequest, reply: FastifyReply) {
  const body = createPatientSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId, locale } = getCtx(request);
  const mrn = generateMedicalRecordNumber();

  const patient = await repo.insertPatient({
    tenantId, medicalRecordNumber: mrn,
    firstName: body.firstName, lastName: body.lastName,
    dateOfBirth: body.dateOfBirth, gender: body.gender,
    phone: body.phone, email: body.email || null,
    nationalId: body.nationalId || null,
    nationality: body.nationality || null, bloodType: body.bloodType || null,
    address: body.address ? JSON.stringify(body.address) : null,
    emergencyContact: body.emergencyContact ? JSON.stringify(body.emergencyContact) : null,
    locale: locale || 'en', userId,
  });

  await logAudit({ tenantId, userId, action: 'patient.create', entityType: 'patients', entityId: patient.id });

  return sendSuccess(reply, mapPatient(patient), 'Patient created successfully', 201);
}

export async function updatePatient(request: FastifyRequest, reply: FastifyReply) {
  const { patientId } = request.params as { patientId: string };
  const body = updatePatientSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const expectedUpdatedAt = (body as Record<string, unknown>)._updatedAt as string | undefined;

  const existing = await repo.findPatientById(patientId, tenantId);
  if (!existing) throw new PatientNotFoundError(patientId);

  // #14: Optimistic concurrency — if client sent _updatedAt, verify it matches
  // (compare at millisecond precision; pg truncates timestamp microseconds)
  if (
    expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()
  ) {
    return reply.status(409).send({
      success: false,
      error: 'Conflict',
      message: 'Patient was modified by another user. Please refresh and try again.',
      serverUpdatedAt: existing.updated_at,
    });
  }

  const updateData: Record<string, unknown> = {};
  if (body.firstName !== undefined) updateData.first_name = body.firstName;
  if (body.lastName !== undefined) updateData.last_name = body.lastName;
  if (body.dateOfBirth !== undefined) updateData.date_of_birth = body.dateOfBirth;
  if (body.gender !== undefined) updateData.gender = body.gender;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.nationalId !== undefined) updateData.national_id = body.nationalId ? encryptField(body.nationalId) : null;
  if (body.nationality !== undefined) updateData.nationality = body.nationality;
  if (body.bloodType !== undefined) updateData.blood_type = body.bloodType;
  if (body.address !== undefined) updateData.address = JSON.stringify(body.address);
  if (body.emergencyContact !== undefined) updateData.emergency_contact = JSON.stringify(body.emergencyContact);

  const updated = expectedUpdatedAt
    ? await repo.updatePatientById(patientId, tenantId, updateData, expectedUpdatedAt)
    : await repo.updatePatientById(patientId, tenantId, updateData, existing.updated_at);

  if (!updated) {
    return reply.status(409).send({
      success: false,
      error: 'Conflict',
      message: 'Patient was modified by another user. Please refresh and try again.',
    });
  }

  await logAudit({ tenantId, userId, action: 'patient.update', entityType: 'patients', entityId: patientId });

  return sendSuccess(reply, mapPatient(updated), 'Patient updated successfully');
}

export async function deletePatient(request: FastifyRequest, reply: FastifyReply) {
  const { patientId } = request.params as { patientId: string };
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  const existing = await repo.findPatientById(patientId, tenantId);
  if (!existing) throw new PatientNotFoundError(patientId);

  await repo.softDeletePatient(patientId, tenantId);

  await logAudit({ tenantId, userId, action: 'patient.delete', entityType: 'patients', entityId: patientId });

  return sendSuccess(reply, null, 'Patient deleted successfully');
}

export async function quickSearch(request: FastifyRequest, reply: FastifyReply) {
  const { q } = request.query as { q?: string };
  const tenantId = getTenantId(request);

  if (!q || q.length < 2) return sendSuccess(reply, []);

  const patients = await repo.quickSearchPatients(tenantId, q);
  const results: QuickSearchResult[] = patients.map((p: PatientRow) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    mrn: p.medical_record_number,
    phone: p.phone,
    dateOfBirth: p.date_of_birth,
    gender: p.gender,
  }));

  return sendSuccess(reply, results);
}

// ── #9: Patient merge ──
export async function mergePatients(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { primaryId: string; duplicateId: string };
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  if (!body.primaryId || !body.duplicateId) {
    return reply.status(400).send({ success: false, error: 'primaryId and duplicateId are required' });
  }

  if (body.primaryId === body.duplicateId) {
    return reply.status(400).send({ success: false, error: 'Cannot merge a patient with itself' });
  }

  const result = await repo.mergePatients(body.primaryId, body.duplicateId, tenantId);
  if (!result.merged) {
    throw new PatientNotFoundError(body.duplicateId);
  }

  await logAudit({
    tenantId, userId,
    action: 'patient.merge',
    entityType: 'patients',
    entityId: body.primaryId,
    metadata: { duplicateId: body.duplicateId, movedRecords: result.movedRecords },
  });

  return sendSuccess(reply, { primaryId: body.primaryId, duplicateId: body.duplicateId, movedRecords: result.movedRecords }, 'Patients merged successfully');
}

// ── #16: Bulk import ──
export async function bulkImport(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { patients: Array<{
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    phone: string;
    email?: string;
    nationalId?: string;
    nationality?: string;
    bloodType?: string;
  }> };
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  if (!body.patients || body.patients.length === 0) {
    return reply.status(400).send({ success: false, error: 'No patients provided' });
  }

  if (body.patients.length > 1000) {
    return reply.status(400).send({ success: false, error: 'Maximum 1000 patients per import' });
  }

  const result = await repo.bulkInsertPatients(tenantId, body.patients, userId);

  await logAudit({
    tenantId, userId,
    action: 'patient.bulk_import',
    entityType: 'patients',
    metadata: { total: body.patients.length, inserted: result.inserted, errors: result.errors.length },
  });

  return sendSuccess(reply, {
    inserted: result.inserted,
    total: body.patients.length,
    errors: result.errors,
  }, `Bulk import complete: ${result.inserted}/${body.patients.length} inserted`);
}
